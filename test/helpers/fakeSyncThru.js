// -----------------------------------------------------------------------------
// A fake SyncThru printer: a real HTTP server on 127.0.0.1 serving home.json
// (and counters.json when given), in the printer's own dialect. The tests
// change what it serves, switch it off and count the requests.
// -----------------------------------------------------------------------------

import http from 'node:http';
import { COUNTERS_PATH, HOME_PATH } from '../../src/syncthru/client.js';
import { toSyncThruText } from './printers.js';

/**
 * @param {{ home: string|object, counters?: string|object|null }} documents
 */
export async function startFakePrinter({ home, counters = null }) {
  const printer = {
    home,
    counters,
    /** 'up' | 'down' (connection closed) | number (HTTP status) */
    mode: 'up',
    requests: [],
  };
  const text = (doc) => (typeof doc === 'string' ? doc : toSyncThruText(doc));
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    printer.requests.push(request.url);
    if (printer.mode === 'down') {
      request.socket.destroy();
      return;
    }
    if (typeof printer.mode === 'number') {
      response.writeHead(printer.mode).end();
      return;
    }
    const doc =
      request.url === HOME_PATH
        ? printer.home
        : request.url === COUNTERS_PATH
          ? printer.counters
          : null;
    if (doc === null || doc === undefined) {
      response.writeHead(404, { 'content-type': 'text/html' }).end('<html>Not found</html>');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/plain' }).end(text(doc));
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  printer.url = `http://127.0.0.1:${server.address().port}`;
  printer.count = (path) => printer.requests.filter((url) => url === path).length;
  printer.close = () =>
    new Promise((resolve) => {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close(resolve);
    });
  return printer;
}
