// -----------------------------------------------------------------------------
// The HTTP client, against a fake SyncThru server: addresses, documents,
// refusals. Nothing leaves 127.0.0.1.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  HOME_PATH,
  SyncThruError,
  displayAddress,
  httpGet,
  normalizeAddress,
  readCounters,
  readHome,
} from '../src/syncthru/client.js';
import { startFakePrinter } from './helpers/fakeSyncThru.js';
import { RAW } from './helpers/printers.js';

test('an address becomes an origin; credentials and other schemes are refused', () => {
  assert.equal(normalizeAddress('192.0.2.10'), 'http://192.0.2.10');
  assert.equal(normalizeAddress(' 192.0.2.10:8080 '), 'http://192.0.2.10:8080');
  assert.equal(normalizeAddress('https://printer.local/sws/index.html'), 'https://printer.local');
  assert.equal(normalizeAddress('HTTP://Printer.LOCAL/'), 'http://printer.local');
  assert.equal(normalizeAddress('[2001:db8::1]'), 'http://[2001:db8::1]');
  for (const bad of [
    '',
    '   ',
    'ftp://192.0.2.10',
    'http://admin:secret@192.0.2.10',
    'http://',
    'a b',
  ]) {
    assert.throws(
      () => normalizeAddress(bad),
      (err) =>
        err instanceof SyncThruError &&
        err.code === 'invalid_address' &&
        !err.message.includes('secret'),
      bad,
    );
  }
  assert.equal(displayAddress('http://192.0.2.10:8080'), '192.0.2.10:8080');
});

test('home.json and counters.json are read from a printer', async () => {
  const printer = await startFakePrinter({ home: RAW.m2070, counters: RAW.m2070Counters });
  try {
    const home = await readHome(printer.url);
    assert.equal(home.identity.model_name, 'M2070 Series');
    assert.deepEqual(await readCounters(printer.url), {
      GXI_BILLING_PRINT_TOTAL_IMP_CNT: 1337,
      GXI_BILLING_COPY_TOTAL_IMP_CNT: 42,
    });
  } finally {
    await printer.close();
  }
});

test('a web server that is not SyncThru is told apart from a printer that is off', async () => {
  const printer = await startFakePrinter({ home: '<html>Welcome</html>' });
  try {
    await assert.rejects(readHome(printer.url), { code: 'not_syncthru' });
    printer.home = { hello: 'world' };
    await assert.rejects(readHome(printer.url), { code: 'not_syncthru' });
    printer.home = null;
    await assert.rejects(readHome(printer.url), { code: 'not_syncthru', status: 404 });
    printer.mode = 503;
    await assert.rejects(readHome(printer.url), { code: 'http', status: 503 });
    printer.mode = 'down';
    await assert.rejects(readHome(printer.url), { code: 'unreachable' });
    // No counters is no error.
    assert.equal(await readCounters(printer.url), null);
  } finally {
    await printer.close();
  }
  await assert.rejects(readHome(printer.url), { code: 'unreachable' });
});

function server(handler) {
  return new Promise((resolve) => {
    const instance = http.createServer(handler);
    instance.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${instance.address().port}`,
        close: () => {
          instance.closeAllConnections();
          return new Promise((done) => instance.close(done));
        },
      }),
    );
  });
}

test('a slow printer times out, a huge answer is cut', async () => {
  const slow = await server(() => {});
  try {
    await assert.rejects(httpGet(`${slow.url}${HOME_PATH}`, { timeoutMs: 100 }), {
      code: 'timeout',
    });
  } finally {
    await slow.close();
  }
  const huge = await server((request, response) => {
    response.writeHead(200);
    response.end('x'.repeat(600 * 1024));
  });
  try {
    await assert.rejects(readHome(huge.url), { code: 'not_syncthru' });
  } finally {
    await huge.close();
  }
});

test('redirects are followed on the same host only, twice at most', async () => {
  let hops = 0;
  const target = await server((request, response) => {
    if (request.url === '/loop') {
      hops += 1;
      response.writeHead(302, { location: '/loop' }).end();
    } else if (request.url === '/away') {
      response.writeHead(301, { location: 'http://192.0.2.99/' }).end();
    } else if (request.url === '/moved') {
      response.writeHead(302, { location: HOME_PATH }).end();
    } else {
      response.writeHead(200).end(RAW.c430w);
    }
  });
  try {
    const { status, text } = await httpGet(`${target.url}/moved`);
    assert.equal(status, 200);
    assert.match(text, /C430W/);
    await assert.rejects(httpGet(`${target.url}/loop`), { code: 'http' });
    assert.equal(hops, 3);
    await assert.rejects(httpGet(`${target.url}/away`), { code: 'http' });
  } finally {
    await target.close();
  }
});

test('a Latin-1 answer is decoded', async () => {
  const latin = await server((request, response) => {
    response.writeHead(200);
    response.end(Buffer.from(RAW.c430w.replace('Living room', 'Séjour'), 'latin1'));
  });
  try {
    assert.equal((await readHome(latin.url)).identity.location, 'Séjour');
  } finally {
    await latin.close();
  }
});
