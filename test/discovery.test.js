import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapLimited, parseSsdpHeaders, ssdpAddresses } from '../src/discovery.js';

const answer = (st, extra = '') =>
  `HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\nLOCATION: http://192.0.2.10:5200/Printer.xml\r\nST: ${st}\r\nUSN: uuid:16a65700-007c-1000-bb49-000000000001::${st}\r\n${extra}\r\n`;

test('SSDP headers are read case-insensitively, the first one wins', () => {
  const headers = parseSsdpHeaders(
    answer('urn:schemas-upnp-org:device:Printer:1', 'st: other\r\n'),
  );
  assert.equal(headers.st, 'urn:schemas-upnp-org:device:Printer:1');
  assert.equal(headers.location, 'http://192.0.2.10:5200/Printer.xml');
  assert.deepEqual(parseSsdpHeaders(undefined), {});
});

test('one candidate per answering IPv4 address, only printers', () => {
  const addresses = ssdpAddresses([
    {
      source_ip: '192.0.2.10',
      source_port: 1900,
      headers: answer('urn:schemas-upnp-org:device:Printer:1'),
    },
    { source_ip: '192.0.2.10', source_port: 1900, headers: answer('upnp:rootdevice') },
    {
      source_ip: '192.0.2.11',
      source_port: 1900,
      headers: answer('urn:schemas-upnp-org:device:MediaRenderer:1'),
    },
    { source_ip: '192.0.2.12', source_port: 1900, headers: '' },
    {
      source_ip: 'fe80::1',
      source_port: 1900,
      headers: answer('urn:schemas-upnp-org:device:Printer:1'),
    },
    { source_ip: 42 },
    null,
  ]);
  assert.deepEqual(addresses, ['http://192.0.2.10', 'http://192.0.2.12']);
  assert.deepEqual(ssdpAddresses('nope'), []);
});

test('mapLimited keeps the order and the concurrency bound', async () => {
  let running = 0;
  let peak = 0;
  const results = await mapLimited(
    [1, 2, 3, 4, 5, 6],
    async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5 * (7 - n)));
      running -= 1;
      return n * 2;
    },
    2,
  );
  assert.deepEqual(results, [2, 4, 6, 8, 10, 12]);
  assert.equal(peak, 2);
  assert.deepEqual(await mapLimited([], async () => 1), []);
});
