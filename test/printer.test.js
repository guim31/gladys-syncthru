// -----------------------------------------------------------------------------
// Reading a SyncThru document: supplies, trays, counters, state.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeCodes,
  classifyState,
  platformIdOf,
  printerName,
  readPrinter,
} from '../src/printer.js';
import { c430wWith, home } from './helpers/printers.js';

test('a mono laser: one toner, one tray, the counters (M2070)', () => {
  const printer = readPrinter(home('m2070'), home('m2070Counters'));
  assert.deepEqual(printer.supplies, [
    { key: 'toner_black', kind: 'toner', color: 'black', level: 58, code: '' },
  ]);
  // tray4 has opt 2: not an installed tray (pysyncthru).
  assert.deepEqual(printer.trays, [
    { key: 'tray_1', slot: '1', capacity: 150, level: null, sizeCode: 4, code: '' },
  ]);
  assert.deepEqual(printer.counters, { printed: 1337, copied: 42 });
  assert.equal(printer.display, 'Sleeping...');
  assert.equal(printer.hrStatus, 2);
  assert.equal(classifyState(printer), 'sleeping');
});

test('a colour laser: four toners and the colour imaging unit (C430W)', () => {
  const printer = readPrinter(home('c430w'));
  assert.deepEqual(
    printer.supplies.map((supply) => [supply.key, supply.level, supply.code]),
    [
      ['toner_black', 8, 'C1-5110'],
      ['toner_cyan', 98, ''],
      ['toner_magenta', 98, ''],
      ['toner_yellow', 97, ''],
      ['drum_color', 44, ''],
    ],
  );
  assert.deepEqual(printer.counters, { printed: null, copied: null });
  assert.deepEqual(activeCodes(printer), ['C1-5110']);
  // Warning + toner at 8 %: the toner, not a generic warning.
  assert.equal(classifyState(printer), 'toner_low');
  assert.equal(
    classifyState(printer, { lowThreshold: 5 }),
    'toner_low',
    'the C1 code alone says so',
  );
});

test('the panel text wins over the status code (C480FW warming up)', () => {
  const printer = readPrinter(home('c480fw'));
  assert.equal(printer.display, 'Warming Up Please Wait...');
  assert.equal(printer.supplies.find((supply) => supply.key === 'toner_yellow').level, 0);
  assert.equal(classifyState(printer), 'warming_up');
});

test('the states the user must know, from the panel and the codes', () => {
  const cases = [
    [{ hr: 2, display: 'Ready' }, 'ready'],
    [{ hr: 2, display: 'Printing...' }, 'printing'],
    [{ hr: 2, display: 'Impression en cours' }, 'printing'],
    [{ hr: 2, display: 'Drucker bereit' }, 'ready'],
    [{ hr: 2, display: 'Power Save' }, 'sleeping'],
    [{ hr: 2, display: 'Mode veille' }, 'sleeping'],
    [{ hr: 4, display: '' }, 'busy'],
    [{ hr: 1, display: '' }, 'unknown'],
    [{ hr: 3, display: 'Paper Jam in Tray 1' }, 'jam'],
    [{ hr: 3, display: 'Bourrage papier' }, 'jam'],
    [{ hr: 5, display: 'Papierstau' }, 'jam'],
    [{ hr: 3, display: 'Atasco de papel' }, 'jam'],
    [{ hr: 3, display: 'Out of Paper' }, 'out_of_paper'],
    [{ hr: 3, display: 'Load paper in tray 1' }, 'out_of_paper'],
    [{ hr: 3, display: 'Plus de papier' }, 'out_of_paper'],
    [{ hr: 3, display: 'Kein Papier' }, 'out_of_paper'],
    [{ hr: 3, display: 'Sin papel' }, 'out_of_paper'],
    [{ hr: 5, display: 'Scanner Error' }, 'error'],
    [
      { hr: 3, display: 'Cover Open', toner: { black: { remaining: 80, newError: '' } } },
      'warning',
    ],
    // The codes, with an empty panel (models without a display).
    [{ hr: 3, trays: { tray1: { newError: 'M1-5112' } } }, 'out_of_paper'],
    [{ hr: 3, trays: { tray1: { newError: 'M1-1110' } } }, 'jam'],
    // A code without a problem status is not trusted.
    [{ hr: 2, trays: { tray1: { newError: 'M1-1110' } } }, 'ready'],
  ];
  for (const [change, expected] of cases) {
    const printer = readPrinter(
      c430wWith({ toner: { black: { remaining: 80, newError: '' } }, ...change }),
    );
    assert.equal(classifyState(printer), expected, JSON.stringify(change));
  }
});

test('levels are bounded integers; a missing level is null, not 0', () => {
  const doc = home('c430w');
  doc.toner_cyan.remaining = 104.6;
  doc.toner_magenta.remaining = -3;
  doc.toner_yellow.remaining = '';
  doc.drum_color.remaining = 'n/a';
  const levels = readPrinter(doc).supplies.map((supply) => supply.level);
  assert.deepEqual(levels, [8, 100, 0, null, null]);
});

test('a document missing whole sections still reads', () => {
  const printer = readPrinter({ status: { hrDeviceStatus: '2' }, identity: null, toner_black: 5 });
  assert.equal(printer.hrStatus, 2);
  assert.deepEqual(printer.supplies, []);
  assert.deepEqual(printer.trays, []);
  assert.equal(printer.identity.model, '');
  assert.equal(classifyState(printer), 'ready');
});

test('the paper level is read only where the printer says it supports it', () => {
  const doc = home('c430w');
  doc.tray1.paper_level = 60;
  assert.equal(readPrinter(doc).trays[0].level, null);
  doc.GXI_SUPPORT_PAPER_LEVEL = 1;
  assert.equal(readPrinter(doc).trays[0].level, 60);
});

test('the platform id: serial, else MAC, else address — never a masked value', () => {
  assert.equal(platformIdOf(readPrinter(home('c430w')), 'http://192.0.2.11'), 'zx0000000000002');
  const masked = readPrinter(home('c480fw'));
  assert.equal(platformIdOf(masked, 'http://192.0.2.12:8080'), 'host-192-0-2-12-8080');
  const doc = home('c480fw');
  doc.identity.mac_addr = '02:00:00:00:00:03';
  assert.equal(platformIdOf(readPrinter(doc), 'http://192.0.2.12'), 'mac-020000000003');
});

test('the device name: brand and model, and the location', () => {
  assert.equal(
    printerName(readPrinter(home('c430w')), 'http://192.0.2.11'),
    'Samsung C430W (Living room)',
  );
  assert.equal(
    printerName(readPrinter(home('m2070')), 'http://192.0.2.10'),
    'Samsung M2070 Series',
  );
  assert.equal(
    printerName(readPrinter({ status: {}, identity: {} }), 'http://192.0.2.9'),
    'SyncThru 192.0.2.9',
  );
});
