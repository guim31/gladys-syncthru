// -----------------------------------------------------------------------------
// The SyncThru dialect: what JSON.parse refuses and the printers send.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSyncThruPayload } from '../src/syncthru/parse.js';
import { RAW } from './helpers/printers.js';

test('the real answers are not JSON, and parse', () => {
  assert.throws(() => JSON.parse(RAW.m2070));
  assert.throws(() => JSON.parse(RAW.c480fw));
  const m2070 = parseSyncThruPayload(RAW.m2070);
  assert.equal(m2070.identity.model_name, 'M2070 Series');
  assert.equal(m2070.toner_black.remaining, 58);
  assert.deepEqual(m2070.multibin, [['Bin', 100, 0]]);
  assert.equal(m2070.capability.ram.opt, 131072);
  assert.deepEqual(parseSyncThruPayload(RAW.m2070Counters), {
    GXI_BILLING_PRINT_TOTAL_IMP_CNT: 1337,
    GXI_BILLING_COPY_TOTAL_IMP_CNT: 42,
  });
});

test('raw line breaks inside a string are kept (C480FW)', () => {
  const c480fw = parseSyncThruPayload(RAW.c480fw);
  assert.match(c480fw.status.status1, /Warming Up\r?\n Please Wait/);
  assert.equal(c480fw.drum_color.remaining, 84);
  assert.equal(c480fw.identity.serial_num, 'xxxxxxxxxxxxxxxxxx');
});

test('plain JSON parses the same as JSON.parse', () => {
  assert.deepEqual(parseSyncThruPayload(RAW.c430w), JSON.parse(RAW.c430w));
});

test('the loose syntax: quotes, trailing commas, comments, hex, signs, words', () => {
  const value = parseSyncThruPayload(
    "﻿{ a: 'single \\'quoted\\'', \"b\" : [1, 2, ], /* note */ c: -0.5e1, // end\n d: 0x1F, e: true, f: false, g: null, h: undefined, i: +3, 12: 'n', j: '\\u0041\\x42\\n', };",
  );
  assert.deepEqual(value, {
    a: "single 'quoted'",
    b: [1, 2],
    c: -5,
    d: 31,
    e: true,
    f: false,
    g: null,
    h: null,
    i: 3,
    12: 'n',
    j: 'AB\n',
  });
});

test('nothing reaches a prototype', () => {
  const value = parseSyncThruPayload('{ __proto__: { polluted: 1 }, constructor: 2, ok: 3 }');
  assert.deepEqual(value, { ok: 3 });
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
});

test('broken documents are refused, never half-read', () => {
  for (const text of [
    '',
    '<html><body>Login</body></html>',
    '{ a: 1',
    '{ a 1 }',
    '{ a: "x }',
    '{ a: 1 } trailing',
    '{ a: foo }',
    '/* open',
    '{ a: "\\u12" }',
    '['.repeat(40) + ']'.repeat(40),
  ]) {
    assert.throws(() => parseSyncThruPayload(text), SyntaxError, JSON.stringify(text.slice(0, 20)));
  }
  assert.throws(() => parseSyncThruPayload(undefined), SyntaxError);
});
