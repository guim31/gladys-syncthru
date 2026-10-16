// -----------------------------------------------------------------------------
// End to end: the integration on the SDK's fake Gladys, against fake SyncThru
// printers over real HTTP (127.0.0.1).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { HOME_PATH, COUNTERS_PATH } from '../src/syncthru/client.js';
import { COUNTERS_EVERY_MS, HEARTBEAT_MS, TEST_ACTION } from '../src/app.js';
import { c430wWith, home, RAW } from './helpers/printers.js';
import { createWorld } from './helpers/world.js';

const C430W = 'ext:test-integration:printer:zx0000000000002';
const M2070 = 'ext:test-integration:printer:zx0000000000001';

function clock(start = Date.parse('2026-10-16T08:00:00Z')) {
  let current = start;
  const now = () => current;
  now.advance = (ms) => {
    current += ms;
  };
  return now;
}

test('the manual list is discovered at startup, with one device per printer', async () => {
  const world = await createWorld();
  try {
    const devices = world.fake.discoveredDevices;
    assert.deepEqual(
      devices.map((device) => device.name),
      ['Samsung C430W (Living room)', 'Samsung M2070 Series', 'Samsung C480FW (Office)'],
    );
    const c430w = devices[0];
    assert.equal(c430w.external_id, C430W);
    assert.equal(c430w.model, 'C430W');
    assert.deepEqual(c430w.params, [{ name: 'SYNCTHRU_URL', value: world.printers[0].url }]);
    assert.equal(world.fake.connectionStatus.connected, true);
    // SSDP was asked for, with the declared search target (no result here).
    assert.deepEqual(world.fake.scans, [{ type: 'ssdp', timeout_seconds: 5 }]);
    // Nothing is published before the user adds a printer.
    assert.equal(world.fake.states.length, 0);
  } finally {
    await world.stop();
  }
});

test('SSDP answers are probed; a printer that is not SyncThru is left out', async () => {
  const world = await createWorld({ printers: [{ home: RAW.c430w }, { home: '<html>HP</html>' }] });
  try {
    const [syncthru, other] = world.printers;
    // The fake core relays loopback answers: the port comes from the manual list.
    world.fake.scanResults.ssdp = [
      {
        source_ip: '127.0.0.1',
        source_port: 1900,
        headers: 'ST: urn:schemas-upnp-org:device:Printer:1\r\n',
      },
    ];
    await world.fake.scanRequest();
    assert.equal(world.fake.discoveredDevices.length, 1);
    assert.equal(syncthru.count(HOME_PATH) >= 2, true);
    assert.equal(other.count(HOME_PATH) >= 2, true);
    assert.match(
      world.logger.at('info').join('\n'),
      /Discovery: 1 SyncThru printer\(s\) out of 3 address\(es\)/,
    );
  } finally {
    await world.stop();
  }
});

test('an added printer gets all its states at once, then only the changes', async () => {
  const world = await createWorld();
  try {
    await world.addAll();
    const fake = world.fake;
    assert.equal(fake.lastState(`${C430W}:state`), 'Toner bas');
    assert.equal(fake.lastState(`${C430W}:online`), 1);
    assert.equal(fake.lastState(`${C430W}:toner_black`), 8);
    assert.equal(fake.lastState(`${C430W}:drum_color`), 44);
    assert.equal(fake.lastState(`${C430W}:tray_1`), 'Prêt');
    assert.equal(fake.lastState(`${M2070}:state`), 'En veille');
    assert.equal(fake.lastState(`${M2070}:pages_printed`), 1337);
    assert.equal(fake.lastState(`${M2070}:pages_copied`), 42);
    assert.ok(fake.widgetRefreshes.includes('printer'));

    const before = fake.states.length;
    await world.app.poller.cycle({ force: true });
    assert.equal(fake.states.length, before, 'nothing changed, nothing sent');
  } finally {
    await world.stop();
  }
});

test('the states refresh without onPoll: the container polls by itself', async () => {
  const world = await createWorld({ printers: [{ home: RAW.c430w }] });
  // The world was built with timers off: a second integration, its timer on,
  // shares nothing with it but the fake printer.
  const { createFakeGladys } = await import('@gladysassistant/integration-sdk/testing');
  const { registerIntegration } = await import('../src/app.js');
  const gladys = createFakeGladys({ config: { printers: world.printers[0].url } });
  const app = registerIntegration(gladys, { logger: world.logger, periodMs: 40 });
  try {
    await gladys.connect();
    await gladys.fake.deviceCreated(gladys.fake.discoveredDevices[0]);
    assert.equal(gladys.fake.lastState(`${C430W}:toner_black`), 8);

    world.printers[0].home = c430wWith({
      hr: 3,
      display: 'Paper Jam',
      toner: { black: { remaining: 7 } },
    });
    const deadline = Date.now() + 3000;
    while (gladys.fake.lastState(`${C430W}:state`) !== 'Bourrage papier' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(gladys.fake.lastState(`${C430W}:state`), 'Bourrage papier');
    assert.equal(gladys.fake.lastState(`${C430W}:toner_black`), 7);
    const asked = gladys.fake.wsMessages.filter((message) => /poll/i.test(message.type));
    assert.deepEqual(asked, [], 'Gladys never asked for a poll');
  } finally {
    app.stop();
    await world.stop();
  }
});

test("the core's onPoll is a fallback, skipped while the timer keeps up", async () => {
  const now = clock();
  const world = await createWorld({ printers: [{ home: RAW.c430w }], now });
  try {
    const [device] = await world.addAll();
    const reads = world.printers[0].count(HOME_PATH);
    assert.deepEqual(await world.fake.poll(device), { success: true });
    assert.equal(world.printers[0].count(HOME_PATH), reads, 'just polled: skipped');
    now.advance(61_000);
    assert.deepEqual(await world.fake.poll(device), { success: true });
    assert.equal(
      world.printers[0].count(HOME_PATH),
      reads + 1,
      'the timer stalled: the core polls',
    );
    // Not one of ours: ignored.
    assert.deepEqual(await world.fake.poll({ external_id: 'ext:test-integration:other:1' }), {
      success: true,
    });
  } finally {
    await world.stop();
  }
});

test('a normal cycle writes nothing at info; a printer lost and back writes two lines', async () => {
  const now = clock();
  const world = await createWorld({ now });
  try {
    await world.addAll();
    world.logger.clear();
    await world.app.poller.cycle({ force: true });
    await world.app.poller.cycle({ force: true });
    assert.deepEqual(world.logger.at('info'), []);
    assert.deepEqual(world.logger.at('warn'), []);
    assert.ok(world.logger.at('debug').length > 0);

    world.printers[0].mode = 'down';
    for (let i = 0; i < 3; i += 1) {
      await world.app.poller.cycle({ force: true });
    }
    assert.equal(world.fake.lastState(`${C430W}:state`), 'Injoignable');
    assert.equal(world.fake.lastState(`${C430W}:online`), 0);
    // The other values keep their last reading.
    assert.equal(world.fake.lastState(`${C430W}:toner_black`), 8);
    const warnings = world.logger.at('warn');
    assert.equal(warnings.length, 1, warnings.join('\n'));
    assert.match(warnings[0], /Samsung C430W \(Living room\): printer unreachable/);

    world.printers[0].mode = 'up';
    await world.app.poller.cycle({ force: true });
    assert.equal(world.fake.lastState(`${C430W}:online`), 1);
    assert.deepEqual(
      world.logger
        .at('info')
        .filter((line) => !line.startsWith('Discovery') && !line.startsWith('Ready')),
      ['Samsung C430W (Living room): printer answers again'],
    );
  } finally {
    await world.stop();
  }
});

test('no address with credentials, no secret ever reaches the logs', async () => {
  const world = await createWorld({
    printers: [{ home: RAW.c430w }],
    config: { language: 'en' },
  });
  try {
    const secret = 'S3cr3t-pass';
    await world.fake.configUpdated({
      printers: `http://admin:${secret}@192.0.2.50, ${world.printers[0].url}`,
    });
    await world.addAll();
    await world.fake.action(TEST_ACTION, { address: `http://admin:${secret}@192.0.2.50` });
    world.printers[0].mode = 'down';
    await world.app.poller.cycle({ force: true });
    const all = world.logger.lines.map((line) => line.text).join('\n');
    assert.ok(!all.includes(secret), 'the password was logged');
    assert.ok(!all.includes('admin:'), 'the user was logged');
    assert.match(all, /Ignored invalid printer address/);
    for (const device of world.fake.discoveredDevices) {
      assert.ok(!JSON.stringify(device).includes(secret));
    }
  } finally {
    await world.stop();
  }
});

test('the heartbeat re-sends a stable value at least every 12 hours', async () => {
  assert.ok(HEARTBEAT_MS <= 12 * 60 * 60 * 1000);
  const world = await createWorld({ printers: [{ home: RAW.c430w }] });
  try {
    await world.addAll();
    let heartbeat;
    world.gladys.publishChangedStates = async (states, options) => {
      heartbeat = options?.heartbeat;
      return { success: true, count: states.length };
    };
    await world.app.poller.cycle({ force: true });
    assert.equal(heartbeat, HEARTBEAT_MS);
  } finally {
    await world.stop();
  }
});

test('page counters are read every 15 minutes, not at every poll', async () => {
  const now = clock();
  const world = await createWorld({
    printers: [{ home: RAW.m2070, counters: RAW.m2070Counters }],
    now,
  });
  try {
    await world.addAll();
    const printer = world.printers[0];
    const counted = printer.count(COUNTERS_PATH);
    now.advance(60_000);
    await world.app.poller.cycle();
    assert.equal(printer.count(COUNTERS_PATH), counted);
    printer.counters = {
      GXI_BILLING_PRINT_TOTAL_IMP_CNT: 1400,
      GXI_BILLING_COPY_TOTAL_IMP_CNT: 42,
    };
    now.advance(COUNTERS_EVERY_MS);
    await world.app.poller.cycle();
    assert.equal(printer.count(COUNTERS_PATH), counted + 1);
    assert.equal(world.fake.lastState(`${M2070}:pages_printed`), 1400);
  } finally {
    await world.stop();
  }
});

test('a printer that stays off is looked for again, at its new address', async () => {
  const now = clock();
  const world = await createWorld({ printers: [{ home: RAW.c430w }, { home: RAW.m2070 }], now });
  try {
    const [c430w] = await world.addAll();
    // DHCP: the C430W now answers at the second address, which the user keeps in the list.
    world.printers[0].mode = 'down';
    world.printers[1].home = RAW.c430w;
    now.advance(31 * 60_000);
    for (let i = 0; i < 3; i += 1) {
      await world.app.poller.cycle({ force: true });
    }
    await world.app.discover();
    const republished = world.fake.discoveredDevices.find(
      (device) => device.external_id === c430w.external_id,
    );
    assert.equal(republished.params[0].value, world.printers[1].url);
    await world.app.poller.cycle({ force: true });
    assert.equal(world.fake.lastState(`${C430W}:online`), 1);
  } finally {
    await world.stop();
  }
});

test('scene triggers: a supply crossing the threshold, a jam, never at startup', async () => {
  const world = await createWorld({ printers: [{ home: RAW.c430w }], config: { language: 'en' } });
  try {
    await world.addAll();
    // Black is already at 8 %: no event at the first reading.
    assert.deepEqual(world.fake.sceneEvents, []);
    const printer = world.printers[0];

    printer.home = c430wWith({ hr: 3, toner: { cyan: { remaining: 10 } } });
    await world.app.poller.cycle({ force: true });
    printer.home = c430wWith({ hr: 3, toner: { cyan: { remaining: 9 } } });
    await world.app.poller.cycle({ force: true });
    assert.deepEqual(world.fake.sceneEvents, [
      {
        key: 'supply_low',
        data: {
          printer: C430W,
          kind: 'toner',
          printer_name: 'Samsung C430W (Living room)',
          supply: 'Cyan toner',
          level: 10,
        },
      },
    ]);

    printer.home = c430wWith({
      hr: 3,
      display: 'Paper Jam in Tray 1',
      toner: { cyan: { remaining: 9 } },
    });
    await world.app.poller.cycle({ force: true });
    await world.app.poller.cycle({ force: true });
    printer.home = c430wWith({ hr: 3, display: 'Load paper', toner: { cyan: { remaining: 9 } } });
    await world.app.poller.cycle({ force: true });
    const paper = world.fake.sceneEvents.filter((event) => event.key === 'paper_problem');
    assert.deepEqual(
      paper.map((event) => event.data),
      [
        {
          printer: C430W,
          problem: 'jam',
          printer_name: 'Samsung C430W (Living room)',
          problem_label: 'Paper jam',
          display_text: 'Paper Jam in Tray 1',
        },
        {
          printer: C430W,
          problem: 'out_of_paper',
          printer_name: 'Samsung C430W (Living room)',
          problem_label: 'Out of paper',
          display_text: 'Load paper',
        },
      ],
    );

    // Off and back: no second supply_low for the same low cartridges.
    printer.mode = 'down';
    await world.app.poller.cycle({ force: true });
    printer.mode = 'up';
    await world.app.poller.cycle({ force: true });
    assert.equal(world.fake.sceneEvents.filter((event) => event.key === 'supply_low').length, 1);
  } finally {
    await world.stop();
  }
});

test('a refused scene event is logged once, and never breaks the polling', async () => {
  const world = await createWorld({ printers: [{ home: RAW.c430w }] });
  try {
    await world.addAll();
    world.gladys.publishSceneEvent = async () => {
      throw new Error('404 unknown trigger');
    };
    for (const display of ['Paper Jam', 'Ready', 'Paper Jam']) {
      world.printers[0].home = c430wWith({ hr: 3, display });
      await world.app.poller.cycle({ force: true });
    }
    assert.equal(world.fake.lastState(`${C430W}:state`), 'Bourrage papier');
    assert.equal(world.logger.at('warn').filter((line) => /scene trigger/.test(line)).length, 1);
  } finally {
    await world.stop();
  }
});

test('the widget: gauges bound to the features, rows, and the refresh button', async () => {
  const world = await createWorld();
  try {
    const empty = (await world.fake.widgetGet('printer', { language: 'en' })).data.content;
    assert.deepEqual(validateWidgetContent(empty), []);
    assert.match(empty.components[0].text, /No printer added yet/);

    await world.addAll();
    const content = (
      await world.fake.widgetGet('printer', { settings: { printer: M2070 }, language: 'de' })
    ).data.content;
    assert.deepEqual(validateWidgetContent(content), []);
    assert.equal(content.components[0].text, 'Samsung M2070 Series');
    const [gauge] = content.components.filter((component) => component.type === 'gauge');
    assert.deepEqual(gauge, {
      type: 'gauge',
      label: 'Schwarz',
      color: 'success',
      device_feature: `${M2070}:toner_black`,
    });
    const rows = content.components.find((component) => component.type === 'status').items;
    assert.deepEqual(rows.map((row) => [row.label, row.value]).slice(0, 4), [
      ['Status', 'Energiesparmodus'],
      ['Anzeige', 'Sleeping...'],
      ['Fach 1', 'Bereit'],
      ['Gedruckte Seiten', 1337],
    ]);

    // Every bound feature exists on the device.
    const features = new Set(
      world.fake.discoveredDevices.flatMap((device) => device.features.map((f) => f.external_id)),
    );
    for (const component of content.components) {
      if (component.device_feature) {
        assert.ok(features.has(component.device_feature), component.device_feature);
      }
    }

    // Empty setting: the first printer.
    const first = (await world.fake.widgetGet('printer', { language: 'fr' })).data.content;
    assert.equal(first.components[0].text, 'Samsung C430W (Living room)');

    const reads = world.printers[1].count(HOME_PATH);
    const ack = await world.fake.widgetAction(
      'printer',
      'refresh',
      {},
      { settings: { printer: M2070 } },
    );
    assert.deepEqual(ack.data.message, {
      en: 'Printer read again',
      fr: 'Imprimante relue',
      de: 'Drucker neu gelesen',
      es: 'Impresora leída de nuevo',
    });
    assert.equal(world.printers[1].count(HOME_PATH), reads + 1);
    world.printers[1].mode = 'down';
    const failed = await world.fake.widgetAction(
      'printer',
      'refresh',
      {},
      { settings: { printer: M2070 } },
    );
    assert.equal(failed.data.message.en, 'The printer does not answer');
    assert.equal((await world.fake.widgetAction('printer', 'nope', {}, {})).success, false);
  } finally {
    await world.stop();
  }
});

test('the test action reads a printer and says what it found, in four languages', async () => {
  const world = await createWorld({ printers: [{ home: RAW.c430w }] });
  try {
    const address = world.printers[0].url.replace('http://', '');
    const ok = await world.fake.action(TEST_ACTION, { address });
    assert.equal(ok.success, true);
    assert.equal(
      ok.data.message.en,
      `C430W answers at ${address}: Toner low. Black toner 8 %, Cyan toner 98 %, Magenta toner 98 %, Yellow toner 97 %, Color drum 44 %. 1 below the threshold.`,
    );
    assert.match(ok.data.message.fr, /^C430W répond à .* : Toner bas\. Toner noir 8 %/);

    world.printers[0].mode = 'down';
    const off = await world.fake.action(TEST_ACTION, { address });
    assert.match(off.data.message.de, /^Kein SyncThru-Drucker unter .*: keine Antwort/);
    const invalid = await world.fake.action(TEST_ACTION, { address: 'ftp://x' });
    assert.match(invalid.data.message.es, /^Dirección no válida/);
    assert.equal(
      world.logger.at('info').filter((line) => line.startsWith('Test action')).length,
      3,
    );
  } finally {
    await world.stop();
  }
});

test('a new configuration is applied at once: language and addresses', async () => {
  const world = await createWorld({ printers: [{ home: RAW.c430w }] });
  try {
    await world.fake.configUpdated({ printers: world.printers[0].url, language: 'es' });
    assert.equal(world.fake.discoveredDevices[0].features[0].name, 'Estado');
    await world.addAll();
    assert.equal(world.fake.lastState(`${C430W}:state`), 'Tóner bajo');
  } finally {
    await world.stop();
  }
});

test('a deleted printer is forgotten; a startup failure is reported', async () => {
  const world = await createWorld({ printers: [{ home: RAW.c430w }] });
  try {
    const [device] = await world.addAll();
    await world.fake.deviceDeleted(device);
    assert.equal(world.app.snapshots.has(device.external_id), false);
    world.gladys.publishDiscoveredDevices = async () => {
      throw new Error('400 BAD_REQUEST');
    };
    await world.gladys.disconnect();
    await world.gladys.connect();
    assert.equal(world.fake.connectionStatus.connected, false);
    assert.match(world.logger.at('error').join('\n'), /Startup failed \(400 BAD_REQUEST\)/);
  } finally {
    await world.stop();
  }
});

test('a printer added from an older publication still gets the states it supports', async () => {
  const world = await createWorld({ printers: [{ home: RAW.c430w }] });
  try {
    const [device] = world.fake.discoveredDevices;
    // Created before the drum was reported: no drum feature.
    await world.addAll([
      {
        ...device,
        features: device.features.filter((f) => !f.external_id.endsWith(':drum_color')),
      },
    ]);
    assert.equal(world.fake.lastState(`${C430W}:drum_color`), undefined);
    const content = (await world.fake.widgetGet('printer', { language: 'en' })).data.content;
    const drum = content.components.find((component) => component.label === 'Color drum');
    assert.deepEqual(drum, {
      type: 'gauge',
      label: 'Color drum',
      color: 'success',
      value: 44,
      min: 0,
      max: 100,
      unit: '%',
    });
    assert.deepEqual(validateWidgetContent(content), []);
    assert.ok(home('c430w'));
  } finally {
    await world.stop();
  }
});
