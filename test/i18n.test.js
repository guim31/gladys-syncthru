// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code, the feature names, and the four docs with the same sections. German
// says "du", never the polite "Sie"; Spanish says "usted".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FAILURES,
  FEATURE_NAMES,
  GAUGE_LABELS,
  LANGUAGES,
  MESSAGES,
  STATE_LABELS,
  TRAY_LABELS,
  WIDGET_TEXT,
  testFailedMessage,
  testMessage,
} from '../src/i18n.js';
import { STATES, classifyState, readPrinter } from '../src/printer.js';
import { home } from './helpers/printers.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const docs = Object.fromEntries(
  await Promise.all(
    ['en', 'fr', 'de', 'es'].map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;
// "tú" forms Spanish must not use where "usted" is meant.
const FAMILIAR_SPANISH = /(?<!\p{L})(tu|tus|tú|puedes|quieres|tienes|añade|escribe)(?!\p{L})/iu;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 500,
  message: 200,
  short: 24,
  status: 40,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  if (lang === 'es' && FAMILIAR_SPANISH.test(text)) {
    found.push(`${path} uses "tú" instead of "usted": "${text}"`);
  }
  return found;
}

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(value, `${name}.${lang}.${key}`, lang, max));
    }
  }
  return found;
}

test('the code offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 40, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the name is the same everywhere; the catalog description holds 10 characters at least', () => {
  assert.equal(typeof manifest.name, 'string');
  for (const lang of LANGS) {
    assert.ok(manifest.description[lang].length >= 10, `description.${lang} is too short`);
  }
});

test('the feature names, gauges, states and trays exist in every language', () => {
  assert.deepEqual(
    [
      ...tableProblems(FEATURE_NAMES, 'FEATURE_NAMES', MAX.featureName),
      ...tableProblems(GAUGE_LABELS, 'GAUGE_LABELS', MAX.short),
      ...tableProblems(STATE_LABELS, 'STATE_LABELS', MAX.status),
      ...tableProblems(TRAY_LABELS, 'TRAY_LABELS', MAX.status),
    ],
    [],
  );
  assert.deepEqual(sorted(Object.keys(STATE_LABELS.en)), sorted(STATES));
  for (const lang of LANGS) {
    const names = Object.values(FEATURE_NAMES[lang]);
    assert.equal(new Set(names).size, names.length, `two features share a name in ${lang}`);
  }
});

test('every message table of the code has the four languages', () => {
  const short = new Set(['state', 'display', 'pages', 'lastReading', 'never', 'refresh']);
  const found = [
    ...Object.entries(WIDGET_TEXT).flatMap(([key, value]) =>
      problems(value, `WIDGET_TEXT.${key}`, short.has(key) ? MAX.short : MAX.message),
    ),
    ...Object.entries(MESSAGES).flatMap(([key, value]) =>
      problems(value, `MESSAGES.${key}`, MAX.message),
    ),
    ...Object.entries(FAILURES).flatMap(([key, value]) =>
      problems(value, `FAILURES.${key}`, MAX.message),
    ),
  ];
  assert.deepEqual(found, []);
});

test('the test action messages, in every language', () => {
  const printer = readPrinter(home('c430w'));
  const ok = testMessage({
    address: '192.0.2.11',
    printer,
    state: classifyState(printer),
    lowThreshold: 10,
  });
  assert.deepEqual(problems(ok, 'testMessage', 400), []);
  assert.match(ok.de, /^C430W antwortet unter 192\.0\.2\.11: Toner niedrig\. Toner Schwarz 8 %/);
  assert.match(ok.es, /Tambor de color 44 %\. 1 por debajo del umbral\.$/);
  const empty = testMessage({
    address: '192.0.2.11',
    printer: readPrinter({ status: { hrDeviceStatus: 2 }, identity: {} }),
    state: 'ready',
    lowThreshold: 10,
  });
  assert.deepEqual(problems(empty, 'testMessage', 400), []);
  for (const code of [...Object.keys(FAILURES), 'other']) {
    assert.deepEqual(
      problems(testFailedMessage({ address: '192.0.2.11', code }), code, MAX.message),
      [],
    );
  }
});

const headings = (text) => text.split('\n').filter((line) => /^#{1,3} /.test(line));

test('the four docs are complete and have the same sections', () => {
  const shape = (text) => headings(text).map((line) => line.match(/^#+/)[0].length);
  for (const lang of LANGS) {
    const text = docs[lang];
    assert.ok(text.length >= 300, `docs/${lang}.md is too short for the store`);
    assert.deepEqual(
      shape(text),
      shape(docs.en),
      `docs/${lang}.md sections differ from docs/en.md`,
    );
    assert.ok(headings(text).length >= 10, `docs/${lang}.md misses sections`);
    // Same tables and examples: as many table rows and list items.
    const count = (re) => (text.match(re) ?? []).length;
    assert.equal(count(/^\|/gm), (docs.en.match(/^\|/gm) ?? []).length, `${lang}: table rows`);
    assert.equal(count(/^- /gm), (docs.en.match(/^- /gm) ?? []).length, `${lang}: list items`);
    assert.match(text, /SyncThru/);
  }
  assert.match(docs.en, /Developed without the hardware: feedback welcome/);
  assert.match(docs.fr, /Développée sans le matériel/);
  assert.match(docs.de, /Ohne die Hardware entwickelt/);
  assert.match(docs.es, /Desarrollada sin el hardware/);
  assert.match(docs.en, /Not affiliated with Samsung or HP/);
  for (const line of docs.de.split('\n')) {
    assert.ok(!POLITE_GERMAN.test(line), `docs/de.md uses the polite form: "${line}"`);
  }
  for (const line of docs.es.split('\n')) {
    assert.ok(!FAMILIAR_SPANISH.test(line), `docs/es.md uses "tú": "${line}"`);
  }
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'Printer', fr: 'Imprimante', de: 'Drucker' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: '', es: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Drucker', 'Ihre IP', 'mit Ihrem', 'Ihren', 'Ihrer']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.equal(
    problems({ en: 'a', fr: 'a', de: 'a', es: 'Enciende tu impresora' }, 'x', 60).length,
    1,
  );
  // Words that only contain the letters stay allowed.
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  // A manifest text forgotten in German is found.
  const forgotten = structuredClone(manifest);
  delete forgotten.actions[0].fields[0].placeholder.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.actions[0].fields[0].placeholder has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});
