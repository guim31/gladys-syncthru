// -----------------------------------------------------------------------------
// Integration configuration, filled in by the user from the manifest
// `config_schema`. DEFAULT_CONFIG mirrors the manifest defaults
// (test/manifest.test.js checks it); normalizeConfig types and bounds what the
// form sends, so the rest of the code never sees a string or an undefined.
// -----------------------------------------------------------------------------

import { DEFAULT_LANGUAGE, localeOf } from './i18n.js';
import { normalizeAddress } from './syncthru/client.js';

export const DEFAULT_CONFIG = {
  printers: '',
  language: DEFAULT_LANGUAGE,
  poll_interval: 60,
  low_threshold: 10,
};

export const POLL_INTERVAL_BOUNDS = [30, 3600];
export const LOW_THRESHOLD_BOUNDS = [1, 50];

function bounded(value, fallback, [min, max]) {
  const number = Number(String(value ?? '').replace(',', '.'));
  if (value === '' || value === null || value === undefined || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * The addresses typed by the user, normalized, without duplicates; the
 * invalid ones apart (they are reported, never polled).
 * @param {string} text comma, semicolon, space or line separated
 */
export function parsePrinterList(text) {
  const addresses = [];
  const invalid = [];
  for (const item of String(text ?? '').split(/[\s,;]+/)) {
    if (!item) {
      continue;
    }
    try {
      const address = normalizeAddress(item);
      if (!addresses.includes(address)) {
        addresses.push(address);
      }
    } catch {
      // Shown in the logs: never with the credentials someone typed in it.
      invalid.push(item.replace(/\/\/[^/@]*@/, '//***@').slice(0, 60));
    }
  }
  return { addresses, invalid };
}

/** @param {Record<string, unknown>} [raw] the config returned by the SDK */
export function normalizeConfig(raw = {}) {
  const source = raw ?? {};
  const { addresses, invalid } = parsePrinterList(source.printers);
  return {
    printers: typeof source.printers === 'string' ? source.printers : DEFAULT_CONFIG.printers,
    addresses,
    invalidAddresses: invalid,
    language: localeOf(source.language, DEFAULT_CONFIG.language),
    poll_interval: bounded(
      source.poll_interval,
      DEFAULT_CONFIG.poll_interval,
      POLL_INTERVAL_BOUNDS,
    ),
    low_threshold: bounded(
      source.low_threshold,
      DEFAULT_CONFIG.low_threshold,
      LOW_THRESHOLD_BOUNDS,
    ),
  };
}

/** Polling period, in ms. */
export function pollIntervalMs(config) {
  return config.poll_interval * 1000;
}
