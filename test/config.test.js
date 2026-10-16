import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  normalizeConfig,
  parsePrinterList,
  pollIntervalMs,
} from '../src/config.js';

test('the defaults', () => {
  const config = normalizeConfig();
  assert.equal(config.language, 'fr');
  assert.equal(config.poll_interval, 60);
  assert.equal(config.low_threshold, 10);
  assert.deepEqual(config.addresses, []);
  assert.equal(pollIntervalMs(config), 60_000);
  assert.deepEqual(normalizeConfig(null).addresses, []);
  assert.equal(DEFAULT_CONFIG.printers, '');
});

test('numbers are typed and bounded, a comma is a decimal point', () => {
  assert.equal(normalizeConfig({ poll_interval: '5' }).poll_interval, 30);
  assert.equal(normalizeConfig({ poll_interval: 99999 }).poll_interval, 3600);
  assert.equal(normalizeConfig({ poll_interval: 'abc' }).poll_interval, 60);
  assert.equal(normalizeConfig({ low_threshold: '12,6' }).low_threshold, 13);
  assert.equal(normalizeConfig({ low_threshold: 0 }).low_threshold, 1);
  assert.equal(normalizeConfig({ low_threshold: '' }).low_threshold, 10);
});

test('the language is one of the four, French by default', () => {
  assert.equal(normalizeConfig({ language: 'de' }).language, 'de');
  assert.equal(normalizeConfig({ language: 'es-ES' }).language, 'es');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});

test('the manual list: separators, duplicates, invalid entries apart', () => {
  assert.deepEqual(
    parsePrinterList('192.0.2.10, 192.0.2.11;printer.local\nhttps://192.0.2.12:8443/x 192.0.2.10'),
    {
      addresses: [
        'http://192.0.2.10',
        'http://192.0.2.11',
        'http://printer.local',
        'https://192.0.2.12:8443',
      ],
      invalid: [],
    },
  );
  assert.deepEqual(parsePrinterList('ftp://192.0.2.1, http://user:pw@192.0.2.2, 192.0.2.3'), {
    addresses: ['http://192.0.2.3'],
    invalid: ['ftp://192.0.2.1', 'http://***@192.0.2.2'],
  });
  assert.deepEqual(parsePrinterList(undefined), { addresses: [], invalid: [] });
});
