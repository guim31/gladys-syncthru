// -----------------------------------------------------------------------------
// The fixture printers, as raw texts (what the HTTP server serves) and parsed.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { parseSyncThruPayload } from '../../src/syncthru/parse.js';

const read = (name) =>
  readFileSync(new URL(`../fixtures/syncthru/${name}`, import.meta.url), 'utf8');

/** Raw answers, exactly as the printers send them. */
export const RAW = {
  m2070: read('m2070-home.js.txt'),
  m2070Counters: read('m2070-counters.js.txt'),
  c480fw: read('c480fw-home.js.txt'),
  c430w: read('c430w-home.json'),
};

/** A fresh parsed copy of a fixture, to modify in a test. */
export function home(name) {
  return parseSyncThruPayload(RAW[name]);
}

/** The C430W, with its panel and codes changed (derived, not captured). */
export function c430wWith({ hr, display = '', toner = {}, trays = {} } = {}) {
  const doc = home('c430w');
  if (hr !== undefined) {
    doc.status.hrDeviceStatus = hr;
  }
  doc.status.status1 = display;
  for (const [color, values] of Object.entries(toner)) {
    Object.assign(doc[`toner_${color}`], values);
  }
  for (const [tray, values] of Object.entries(trays)) {
    Object.assign(doc[tray], values);
  }
  return doc;
}

/** Serialize a parsed document back, in the unquoted-key SyncThru dialect. */
export function toSyncThruText(value, indent = '') {
  if (Array.isArray(value)) {
    return `[${value.map((item) => toSyncThruText(item, indent)).join(', ')}]`;
  }
  if (value && typeof value === 'object') {
    const inner = `${indent}\t`;
    const lines = Object.entries(value).map(
      ([key, item]) => `${inner}${key}: ${toSyncThruText(item, inner)}`,
    );
    return `{\r\n${lines.join(',\r\n')}\r\n${indent}}`;
  }
  return JSON.stringify(value);
}
