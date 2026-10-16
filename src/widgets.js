// -----------------------------------------------------------------------------
// Dashboard widget `printer` (Gladys 5.1+; the key is forever).
//
// Budget of the core: 8 components, 2 texts, 6 tiles, 1 status, 4 buttons.
// Heading + 5 gauges + status + refresh button = 8, the gladys-ipp layout:
//   - gauges: the toners first, then the drums (the printer's order), at most
//     5; a gauge is bound to the device feature when the created device has it
//     (it then follows the states live), inline otherwise (a drum that appeared
//     since the device was added);
//   - status rows: state (coloured), panel display, trays, page counter, last
//     reading — what did not fit in a gauge goes there too, never dropped.
// The content comes from the last reading kept in memory: rendering never
// queries the printer, only the refresh button does.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURE_NAMES, GAUGE_LABELS, STATE_LABELS, WIDGET_TEXT, localeOf, pick } from './i18n.js';
import { trayLabel } from './devices.js';

export const WIDGET_KEY = 'printer';
export const REFRESH_ACTION = 'refresh';
export const MAX_GAUGES = 5;
const MAX_STATUS_ITEMS = 10;
const TTL_SECONDS = 60;

const STATE_COLORS = {
  ready: WIDGET_COLORS.SUCCESS,
  printing: WIDGET_COLORS.INFO,
  sleeping: WIDGET_COLORS.SUCCESS,
  warming_up: WIDGET_COLORS.INFO,
  busy: WIDGET_COLORS.INFO,
  toner_low: WIDGET_COLORS.WARNING,
  warning: WIDGET_COLORS.WARNING,
  jam: WIDGET_COLORS.DANGER,
  out_of_paper: WIDGET_COLORS.DANGER,
  error: WIDGET_COLORS.DANGER,
  offline: WIDGET_COLORS.NEUTRAL,
  unknown: WIDGET_COLORS.NEUTRAL,
};

/** Colour of a level against the low threshold. */
export function levelColor(level, lowThreshold) {
  if (level <= lowThreshold) {
    return WIDGET_COLORS.DANGER;
  }
  if (level <= lowThreshold * 2) {
    return WIDGET_COLORS.WARNING;
  }
  return WIDGET_COLORS.SUCCESS;
}

/** The supplies shown as gauges, and the ones left for the status list. */
export function splitSupplies(supplies) {
  const known = supplies.filter((supply) => supply.level !== null);
  const ordered = [
    ...known.filter((supply) => supply.kind === 'toner'),
    ...known.filter((supply) => supply.kind !== 'toner'),
  ];
  return { gauges: ordered.slice(0, MAX_GAUGES), rest: ordered.slice(MAX_GAUGES) };
}

function clock(date, lang, timeZone) {
  try {
    return new Intl.DateTimeFormat(lang, {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/**
 * The widget content of one printer.
 * @param {object} options
 * @param {{ name: string, features?: Array<{ external_id: string }> } | null} options.device
 * @param {{ feature: (key: string) => string } | null} options.ids
 * @param {{ printer: object|null, state: string, readAt: number|null } | null} options.snapshot
 * @param {string} options.language the language of the request
 * @param {number} options.lowThreshold
 * @param {string} [options.timeZone]
 */
export function buildPrinterContent({ device, ids, snapshot, language, lowThreshold, timeZone }) {
  const lang = localeOf(language, 'en');
  if (!device) {
    return {
      ttl_seconds: TTL_SECONDS,
      components: [{ type: 'text', variant: 'body', text: pick(WIDGET_TEXT.noPrinter, lang) }],
    };
  }
  const created = new Set((device.features ?? []).map((feature) => feature.external_id));
  const printer = snapshot?.printer ?? null;
  const state = snapshot?.state ?? 'unknown';
  const components = [{ type: 'text', variant: 'heading', text: device.name.slice(0, 40) }];

  const { gauges, rest } = splitSupplies(printer?.supplies ?? []);
  for (const supply of gauges) {
    const featureId = ids.feature(supply.key);
    const gauge = {
      type: 'gauge',
      label: GAUGE_LABELS[lang][supply.key],
      color: levelColor(supply.level, lowThreshold),
    };
    if (created.has(featureId)) {
      gauge.device_feature = featureId;
    } else {
      Object.assign(gauge, { value: supply.level, min: 0, max: 100, unit: '%' });
    }
    components.push(gauge);
  }

  const items = [
    {
      label: pick(WIDGET_TEXT.state, lang),
      value: STATE_LABELS[lang][state],
      color: STATE_COLORS[state],
    },
  ];
  if (printer?.display && state !== 'offline') {
    items.push({
      label: pick(WIDGET_TEXT.display, lang),
      value: printer.display.slice(0, 40),
      icon: 'monitor',
    });
  }
  for (const supply of rest) {
    items.push({
      label: FEATURE_NAMES[lang][supply.key],
      value: `${supply.level} %`,
      color: levelColor(supply.level, lowThreshold),
    });
  }
  for (const tray of printer?.trays ?? []) {
    const label = trayLabel(tray, lang);
    items.push({
      label: FEATURE_NAMES[lang][tray.key],
      value: tray.level !== null ? `${label} · ${tray.level} %` : label,
      color: tray.code ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
      icon: 'file',
    });
  }
  if (printer?.counters.printed !== null && printer?.counters.printed !== undefined) {
    items.push({
      label: pick(WIDGET_TEXT.pages, lang),
      value: printer.counters.printed,
      icon: 'printer',
    });
  }
  items.push({
    label: pick(WIDGET_TEXT.lastReading, lang),
    value: snapshot?.readAt
      ? clock(new Date(snapshot.readAt), lang, timeZone)
      : pick(WIDGET_TEXT.never, lang),
    icon: 'clock',
  });
  // The last reading stays visible: it is the last row, after the cut.
  const capped =
    items.length > MAX_STATUS_ITEMS
      ? [...items.slice(0, MAX_STATUS_ITEMS - 1), items[items.length - 1]]
      : items;
  components.push({ type: 'status', items: capped });

  components.push({
    type: 'button',
    label: pick(WIDGET_TEXT.refresh, lang),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: REFRESH_ACTION },
  });
  return { ttl_seconds: TTL_SECONDS, components };
}
