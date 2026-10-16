// -----------------------------------------------------------------------------
// One Gladys device per printer.
//
// Features (keys are forever, see CLAUDE.md):
//   state                text/text, the state in words ("Prête", "Bourrage papier")
//   online               presence-sensor/binary, 1 when the printer answers
//   toner_<color>        level-sensor/liquid-level-percent, 0-100 %, like gladys-ipp
//   drum_<color>, drum_color  same, the imaging units
//   tray_<n|mp|manual>   text/text, "Prêt", "Vide" or the printer's code
//   tray_<n>_level       level-sensor %, only on models reporting a paper level
//   pages_printed, pages_copied  counter-sensor/integer, when counters.json answers
//
// Only what the printer reports at discovery becomes a feature: a mono laser
// has one toner, a colour one four toners and a drum.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { FEATURE_NAMES, STATE_LABELS, TRAY_LABELS } from './i18n.js';
import { platformIdOf, printerName } from './printer.js';

export const DEVICE_TYPE = 'printer';
export const HOST_PARAM = 'SYNCTHRU_URL';

// The container polls by itself (src/poller.js); the core's onPoll is only a
// fallback, at the slowest pace it schedules (Gladys#3198).
export const DEVICE_POLL_FREQUENCY_MS = DEVICE_POLL_FREQUENCIES.EVERY_MINUTES;

// Large enough for any office printer; a display bound, never enforced.
const COUNTER_MAX = 1_000_000_000;

const TRAY_EMPTY_CODE = /^M\d-5/i;

function readOnly(feature) {
  return { read_only: true, has_feedback: false, ...feature };
}

/** The ids of one printer. */
export function printerIds(gladys, printer, baseUrl) {
  return gladys.externalIds(DEVICE_TYPE, platformIdOf(printer, baseUrl));
}

/** Is this external id one of our printers. */
export function isPrinterId(gladys, externalId) {
  return String(externalId ?? '').startsWith(gladys.externalId(`${DEVICE_TYPE}:`));
}

/** The feature keys a reading supports, in display order. */
export function featureKeys(printer) {
  const keys = ['state', 'online'];
  for (const supply of printer.supplies) {
    if (supply.level !== null) {
      keys.push(supply.key);
    }
  }
  for (const tray of printer.trays) {
    keys.push(tray.key);
    if (tray.level !== null) {
      keys.push(`${tray.key}_level`);
    }
  }
  if (printer.counters.printed !== null) {
    keys.push('pages_printed');
  }
  if (printer.counters.copied !== null) {
    keys.push('pages_copied');
  }
  return keys;
}

function featureOf(key, name, externalId) {
  if (key === 'state' || /^tray_[a-z0-9]+$/.test(key)) {
    return readOnly({
      name,
      external_id: externalId,
      category: CATEGORIES.TEXT,
      type: TYPES.TEXT.TEXT,
      // NOT NULL in t_device_feature, even for a text (HTTP 422 otherwise).
      min: 0,
      max: 0,
    });
  }
  if (key === 'online') {
    return readOnly({
      name,
      external_id: externalId,
      category: CATEGORIES.PRESENCE_SENSOR,
      type: TYPES.SENSOR.BINARY,
      min: 0,
      max: 1,
    });
  }
  if (key.startsWith('pages_')) {
    return readOnly({
      name,
      external_id: externalId,
      category: CATEGORIES.COUNTER_SENSOR,
      type: TYPES.SENSOR.INTEGER,
      min: 0,
      max: COUNTER_MAX,
    });
  }
  return readOnly({
    name,
    external_id: externalId,
    category: CATEGORIES.LEVEL_SENSOR,
    type: TYPES.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
    unit: UNITS.PERCENT,
    min: 0,
    max: 100,
  });
}

/**
 * The discovered device of a printer.
 * @param {object} gladys
 * @param {{ baseUrl: string, printer: object }} entry
 * @param {{ language: string }} config
 */
export function buildDevice(gladys, { baseUrl, printer }, config) {
  const ids = printerIds(gladys, printer, baseUrl);
  const names = FEATURE_NAMES[config.language];
  return {
    name: printerName(printer, baseUrl),
    external_id: ids.device,
    model: printer.identity.model || undefined,
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCY_MS,
    params: [{ name: HOST_PARAM, value: baseUrl }],
    features: featureKeys(printer).map((key) => featureOf(key, names[key], ids.feature(key))),
  };
}

/** The value of a tray text feature. */
export function trayLabel(tray, lang) {
  const labels = TRAY_LABELS[lang];
  if (!tray.code) {
    return labels.ready;
  }
  if (TRAY_EMPTY_CODE.test(tray.code)) {
    return labels.empty;
  }
  return `${labels.alert} ${tray.code}`.slice(0, 40);
}

/**
 * Every state of a reading, as publishChangedStates entries.
 * @param {{ device: string, feature: (key: string) => string }} ids
 * @param {object} printer readPrinter()
 * @param {string} state classifyState()
 * @param {string} lang
 */
export function readingStates(ids, printer, state, lang) {
  const states = [
    { device_feature_external_id: ids.feature('state'), text: STATE_LABELS[lang][state] },
    { device_feature_external_id: ids.feature('online'), state: 1 },
  ];
  for (const supply of printer.supplies) {
    if (supply.level !== null) {
      states.push({ device_feature_external_id: ids.feature(supply.key), state: supply.level });
    }
  }
  for (const tray of printer.trays) {
    states.push({ device_feature_external_id: ids.feature(tray.key), text: trayLabel(tray, lang) });
    if (tray.level !== null) {
      states.push({
        device_feature_external_id: ids.feature(`${tray.key}_level`),
        state: tray.level,
      });
    }
  }
  if (printer.counters.printed !== null) {
    states.push({
      device_feature_external_id: ids.feature('pages_printed'),
      state: printer.counters.printed,
    });
  }
  if (printer.counters.copied !== null) {
    states.push({
      device_feature_external_id: ids.feature('pages_copied'),
      state: printer.counters.copied,
    });
  }
  return states;
}

/** The states of a printer that does not answer: the rest keeps its last value. */
export function offlineStates(ids, lang) {
  return [
    { device_feature_external_id: ids.feature('state'), text: STATE_LABELS[lang].offline },
    { device_feature_external_id: ids.feature('online'), state: 0 },
  ];
}
