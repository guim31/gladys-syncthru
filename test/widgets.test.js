import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { MAX_GAUGES, buildPrinterContent, levelColor, splitSupplies } from '../src/widgets.js';
import { classifyState, readPrinter } from '../src/printer.js';
import { home } from './helpers/printers.js';

const ID = 'ext:test:printer:x';
const ids = { feature: (key) => `${ID}:${key}` };

function full() {
  const doc = home('c430w');
  for (const color of ['black', 'cyan', 'magenta', 'yellow']) {
    doc[`drum_${color}`].opt = 1;
  }
  for (const tray of ['tray2', 'tray3', 'tray4', 'tray5', 'mp', 'manual']) {
    doc[tray].opt = 1;
  }
  return readPrinter(doc, { GXI_BILLING_PRINT_TOTAL_IMP_CNT: 10 });
}

test('the toners come first, five gauges at most, the rest in the rows', () => {
  const { gauges, rest } = splitSupplies(full().supplies);
  assert.deepEqual(
    gauges.map((supply) => supply.key),
    ['toner_black', 'toner_cyan', 'toner_magenta', 'toner_yellow', 'drum_black'],
  );
  assert.equal(gauges.length, MAX_GAUGES);
  assert.deepEqual(
    rest.map((supply) => supply.key),
    ['drum_cyan', 'drum_magenta', 'drum_yellow', 'drum_color'],
  );
});

test('a full printer stays within the budget of the core, in every language', () => {
  const printer = full();
  const device = { name: 'A printer with a name far too long for a widget heading', features: [] };
  for (const language of ['en', 'fr', 'de', 'es', 'it']) {
    const content = buildPrinterContent({
      device,
      ids,
      snapshot: {
        printer,
        state: classifyState(printer),
        readAt: Date.parse('2026-10-16T08:00:00Z'),
      },
      language,
      lowThreshold: 10,
      timeZone: 'Europe/Paris',
    });
    assert.deepEqual(validateWidgetContent(content), [], language);
    assert.equal(content.components.length, 8);
    const rows = content.components.find((component) => component.type === 'status').items;
    assert.equal(rows.length, 10);
    assert.match(String(rows[rows.length - 1].value), /16\/10|10\/16|16\.10/);
    for (const component of content.components) {
      assert.notEqual(component.style, 'primary', 'invisible in dark mode (#3153)');
      assert.notEqual(component.color, 'primary');
    }
  }
});

test('an unreachable printer keeps its last levels, without the stale panel text', () => {
  const printer = readPrinter(home('m2070'));
  const content = buildPrinterContent({
    device: { name: 'M2070', features: [{ external_id: `${ID}:toner_black` }] },
    ids,
    snapshot: { printer, state: 'offline', readAt: null },
    language: 'fr',
    lowThreshold: 10,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  const rows = content.components.find((component) => component.type === 'status').items;
  assert.deepEqual(rows[0], { label: 'État', value: 'Injoignable', color: 'neutral' });
  assert.ok(!rows.some((row) => row.label === 'Afficheur'));
  assert.equal(rows[rows.length - 1].value, 'Pas encore lu');
  assert.equal(content.components[1].device_feature, `${ID}:toner_black`);
});

test('never read: a heading, the state unknown, the button', () => {
  const content = buildPrinterContent({
    device: { name: 'X' },
    ids,
    snapshot: null,
    language: 'es',
    lowThreshold: 10,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(
    content.components.map((component) => component.type),
    ['text', 'status', 'button'],
  );
});

test('the level colours follow the threshold', () => {
  assert.equal(levelColor(10, 10), 'danger');
  assert.equal(levelColor(20, 10), 'warning');
  assert.equal(levelColor(21, 10), 'success');
});
