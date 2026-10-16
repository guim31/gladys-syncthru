import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  buildDevice,
  featureKeys,
  offlineStates,
  readingStates,
  trayLabel,
} from '../src/devices.js';
import { classifyState, readPrinter } from '../src/printer.js';
import { home } from './helpers/printers.js';

const gladys = createFakeGladys();

test('a mono laser: state, online, its toner, its tray, the counters', () => {
  const printer = readPrinter(home('m2070'), home('m2070Counters'));
  assert.deepEqual(featureKeys(printer), [
    'state',
    'online',
    'toner_black',
    'tray_1',
    'pages_printed',
    'pages_copied',
  ]);
  const device = buildDevice(gladys, { baseUrl: 'http://192.0.2.10', printer }, { language: 'en' });
  assert.equal(device.external_id, 'ext:test-integration:printer:zx0000000000001');
  assert.deepEqual(
    device.features.map((feature) => [
      feature.name,
      `${feature.category}/${feature.type}`,
      feature.unit,
    ]),
    [
      ['State', 'text/text', undefined],
      ['Online', 'presence-sensor/binary', undefined],
      ['Black toner', 'level-sensor/liquid-level-percent', 'percent'],
      ['Tray 1', 'text/text', undefined],
      ['Pages printed', 'counter-sensor/integer', undefined],
      ['Pages copied', 'counter-sensor/integer', undefined],
    ],
  );
  for (const feature of device.features) {
    assert.equal(feature.read_only, true, 'read only: nothing is ever sent to the printer');
    assert.equal(feature.has_feedback, false);
  }
});

test('the states of a reading, and of a printer that is off', () => {
  const printer = readPrinter(home('c430w'));
  const ids = gladys.externalIds('printer', 'p');
  const states = readingStates(ids, printer, classifyState(printer), 'es');
  assert.deepEqual(states.slice(0, 3), [
    { device_feature_external_id: ids.feature('state'), text: 'Tóner bajo' },
    { device_feature_external_id: ids.feature('online'), state: 1 },
    { device_feature_external_id: ids.feature('toner_black'), state: 8 },
  ]);
  // Never an empty text: Gladys ignores it.
  for (const state of states) {
    if ('text' in state) {
      assert.ok(state.text.length > 0);
    }
  }
  assert.deepEqual(offlineStates(ids, 'de'), [
    { device_feature_external_id: ids.feature('state'), text: 'Nicht erreichbar' },
    { device_feature_external_id: ids.feature('online'), state: 0 },
  ]);
});

test('a tray: ready, empty or the printer code', () => {
  assert.equal(trayLabel({ code: '' }, 'fr'), 'Prêt');
  assert.equal(trayLabel({ code: 'M1-5112' }, 'fr'), 'Vide');
  assert.equal(trayLabel({ code: 'S2-4110' }, 'en'), 'Alert S2-4110');
});
