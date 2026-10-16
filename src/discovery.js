// -----------------------------------------------------------------------------
// Where to look for printers.
//
// The container sits on a bridge network and never sees SSDP: the core sends
// the M-SEARCH for the search target declared in the manifest
// (`network_discovery`, the UPnP printer device type Home Assistant also
// matches) and relays the raw answers. Every answering address is then asked
// for its home.json, in unicast: only the ones that serve a SyncThru document
// become devices — an HP or Brother printer answering the same M-SEARCH is
// left alone.
// -----------------------------------------------------------------------------

import { isIP } from 'node:net';

export const SSDP_SEARCH_TARGET = 'urn:schemas-upnp-org:device:Printer:1';
export const SCAN_TIMEOUT_SECONDS = 5;
export const MAX_CANDIDATES = 32;

/** Headers of one raw SSDP answer, keys lower-cased. */
export function parseSsdpHeaders(text) {
  const headers = {};
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at > 0) {
      const key = line.slice(0, at).trim().toLowerCase();
      if (!(key in headers)) {
        headers[key] = line.slice(at + 1).trim();
      }
    }
  }
  return headers;
}

/**
 * The printer base URLs of an SSDP scan, one per answering IPv4 address.
 * @param {Array<{ source_ip: string, headers?: string }>} results
 * @returns {string[]}
 */
export function ssdpAddresses(results) {
  const addresses = [];
  for (const result of Array.isArray(results) ? results : []) {
    const ip = result?.source_ip;
    if (typeof ip !== 'string' || isIP(ip) !== 4) {
      continue;
    }
    const headers = parseSsdpHeaders(result.headers);
    // A device answering for another search target (some answer ssdp:all
    // style anyway): kept only when it does not say otherwise.
    if (headers.st && !/printer/i.test(headers.st) && !/rootdevice/i.test(headers.st)) {
      continue;
    }
    const address = `http://${ip}`;
    if (!addresses.includes(address) && addresses.length < MAX_CANDIDATES) {
      addresses.push(address);
    }
  }
  return addresses;
}

/**
 * Run `fn` on every item, a few at a time.
 * @template T, R
 * @param {T[]} items
 * @param {(item: T) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function mapLimited(items, fn, limit = 4) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
