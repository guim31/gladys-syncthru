// -----------------------------------------------------------------------------
// Read-only client of the SyncThru web service.
//
// Two documents, both plain GETs without authentication, the ones pysyncthru
// (and so Home Assistant) reads in its API mode:
//   - /sws/app/information/home/home.json       state, identity, supplies, trays
//   - /sws/app/information/counters/counters.json  page counters (not every model)
// Nothing is ever written to the printer.
//
// node:http rather than fetch: the printers are small embedded servers, some
// only answer HTTPS with a self-signed certificate, and the answer must be
// capped in time and size.
// -----------------------------------------------------------------------------

import http from 'node:http';
import https from 'node:https';
import { parseSyncThruPayload } from './parse.js';

export const HOME_PATH = '/sws/app/information/home/home.json';
export const COUNTERS_PATH = '/sws/app/information/counters/counters.json';

export const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 2;

/** An error the user can act on; `code` is stable for the messages and tests. */
export class SyncThruError extends Error {
  /**
   * @param {'invalid_address'|'unreachable'|'timeout'|'http'|'not_syncthru'} code
   * @param {string} message
   * @param {{ status?: number }} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'SyncThruError';
    this.code = code;
    this.status = extra.status;
  }
}

/**
 * The base URL of a printer from what the user typed: an IP, a hostname, with
 * or without port, or an http(s) URL. Only the origin is kept. Credentials in
 * the URL are refused: the SyncThru pages read here need none, and an address
 * with a password must never end up in the logs or the device params.
 * @param {string} input
 * @returns {string} e.g. `http://192.0.2.10`
 * @throws {SyncThruError} invalid_address
 */
export function normalizeAddress(input) {
  const raw = String(input ?? '').trim();
  if (!raw) {
    throw new SyncThruError('invalid_address', 'empty address');
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new SyncThruError('invalid_address', 'invalid address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SyncThruError('invalid_address', 'only http and https addresses are supported');
  }
  if (url.username || url.password) {
    throw new SyncThruError('invalid_address', 'an address must not contain credentials');
  }
  if (!url.hostname) {
    throw new SyncThruError('invalid_address', 'invalid address');
  }
  return url.origin;
}

/** The address without scheme, for the logs and the texts (`192.0.2.10:8080`). */
export function displayAddress(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return String(baseUrl);
  }
}

function decode(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    // Older firmwares answer in Latin-1.
    return buffer.toString('latin1');
  }
}

/**
 * GET a URL, bounded in time and size, following at most two redirects to the
 * same host (some models move from http to https).
 * @returns {Promise<{ status: number, text: string }>}
 */
export function httpGet(target, { timeoutMs = REQUEST_TIMEOUT_MS, redirects = 0 } = {}) {
  const url = new URL(target);
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.get(
      url,
      {
        headers: { accept: 'application/json, text/javascript, */*', connection: 'close' },
        timeout: timeoutMs,
        // Printers serve a self-signed certificate; nothing secret is sent.
        rejectUnauthorized: false,
        agent: false,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location) {
          response.resume();
          let next;
          try {
            next = new URL(location, url);
          } catch {
            reject(new SyncThruError('http', `bad redirect (HTTP ${status})`, { status }));
            return;
          }
          if (redirects >= MAX_REDIRECTS || next.hostname !== url.hostname) {
            reject(new SyncThruError('http', `unexpected redirect (HTTP ${status})`, { status }));
            return;
          }
          httpGet(next.href, { timeoutMs, redirects: redirects + 1 }).then(resolve, reject);
          return;
        }
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            request.destroy(new SyncThruError('not_syncthru', 'answer too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => resolve({ status, text: decode(Buffer.concat(chunks)) }));
        response.on('error', reject);
      },
    );
    request.on('timeout', () => {
      request.destroy(new SyncThruError('timeout', `no answer within ${timeoutMs / 1000} s`));
    });
    request.on('error', (err) => {
      if (err instanceof SyncThruError) {
        reject(err);
        return;
      }
      // ECONNREFUSED, EHOSTUNREACH, ENOTFOUND...: the message names the cause
      // without the address (the caller adds it).
      reject(new SyncThruError('unreachable', err.code ?? err.message));
    });
  });
}

/** A home.json answer that really comes from SyncThru. */
export function isSyncThruHome(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.status !== null &&
    typeof value.status === 'object' &&
    value.status.hrDeviceStatus !== undefined &&
    value.identity !== null &&
    typeof value.identity === 'object'
  );
}

/**
 * Read the state document of a printer.
 * @param {string} baseUrl from normalizeAddress
 * @returns {Promise<object>} the parsed home.json
 * @throws {SyncThruError}
 */
export async function readHome(baseUrl, options = {}) {
  const { status, text } = await httpGet(`${baseUrl}${HOME_PATH}`, options);
  if (status === 404) {
    throw new SyncThruError('not_syncthru', 'no SyncThru JSON service (HTTP 404)', { status });
  }
  if (status !== 200) {
    throw new SyncThruError('http', `HTTP ${status}`, { status });
  }
  let value;
  try {
    value = parseSyncThruPayload(text);
  } catch {
    throw new SyncThruError('not_syncthru', 'the answer is not a SyncThru document');
  }
  if (!isSyncThruHome(value)) {
    throw new SyncThruError('not_syncthru', 'the answer is not a SyncThru document');
  }
  return value;
}

/**
 * Read the page counters. Many models do not serve them: null then, never an
 * error, like pysyncthru.
 * @returns {Promise<object|null>}
 */
export async function readCounters(baseUrl, options = {}) {
  try {
    const { status, text } = await httpGet(`${baseUrl}${COUNTERS_PATH}`, options);
    if (status !== 200) {
      return null;
    }
    const value = parseSyncThruPayload(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
