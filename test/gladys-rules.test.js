// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures: a mono laser with counters (M2070), two colour lasers with their
// imaging unit (C430W, C480FW with a masked serial), a model reporting its
// paper level and every tray — in the four feature-name languages.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RAW, home } from './helpers/printers.js';
import { createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

// Every tray installed, a paper level, both counters.
const everything = home('c430w');
everything.GXI_SUPPORT_PAPER_LEVEL = 1;
for (const tray of ['tray1', 'tray2', 'tray3', 'tray4', 'tray5', 'mp', 'manual']) {
  everything[tray].opt = 1;
  everything[tray].paper_level = 40;
}
for (const color of ['black', 'cyan', 'magenta', 'yellow']) {
  everything[`drum_${color}`].opt = 1;
}
everything.identity.serial_num = 'ZX0000000000009';

const printers = [
  { home: RAW.c430w },
  { home: RAW.m2070, counters: RAW.m2070Counters },
  { home: RAW.c480fw },
  { home: everything, counters: RAW.m2070Counters },
];

for (const language of ['fr', 'en', 'de', 'es']) {
  test(`every discovered device follows the Gladys rules (${language})`, async () => {
    const world = await createWorld({ printers, config: { language } });
    try {
      const devices = world.fake.discoveredDevices;
      assert.equal(devices.length, 4, `expected the fixture printers, got ${devices.length}`);
      const deviceIds = new Set();

      for (const device of devices) {
        const where = device.name;
        assert.ok(!deviceIds.has(device.external_id), `${where}: duplicate device external_id`);
        deviceIds.add(device.external_id);

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(
            feature.external_id.startsWith(`${device.external_id}:`),
            `${at}: feature id outside its device`,
          );
          assert.ok(typeof feature.name === 'string' && feature.name.length > 0, `${at}: no name`);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);
        }
      }
      // The full model really has every kind of feature.
      const full = devices.find((device) => device.external_id.endsWith(':zx0000000000009'));
      assert.equal(full.features.length, 2 + 4 + 5 + 7 * 2 + 2);
    } finally {
      await world.stop();
    }
  });
}
