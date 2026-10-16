// -----------------------------------------------------------------------------
// Scene triggers (manifest `scene_triggers`; keys are forever).
//
//   supply_low     a toner or a drum crosses the configured threshold downwards.
//                  Gladys can already trigger on one level feature; this one
//                  covers every cartridge of every printer in one scene card and
//                  says which one, by name, for the notification.
//   paper_problem  the printer enters a paper jam or runs out of paper. The
//                  `state` feature is a text in the user's language: a scene on
//                  it would compare words. This trigger filters on a stable key.
//
// One event per transition, never at the first reading after a start (the
// previous state is unknown, and a restart must not notify again).
// -----------------------------------------------------------------------------

import { FEATURE_NAMES, STATE_LABELS } from './i18n.js';
import { isLow } from './printer.js';

export const TRIGGER = {
  SUPPLY_LOW: 'supply_low',
  PAPER_PROBLEM: 'paper_problem',
};

export const SCENE_TRIGGER_KEYS = Object.values(TRIGGER);

const PAPER_STATES = ['jam', 'out_of_paper'];

/**
 * The scene events a new reading causes.
 * @param {object} options
 * @param {string} options.device the printer's device external id
 * @param {string} options.name the printer's name in Gladys
 * @param {{ state?: string, low?: Set<string> } | undefined} options.previous
 * @param {object} options.printer readPrinter()
 * @param {string} options.state classifyState(), or 'offline'
 * @param {{ language: string, low_threshold: number }} options.config
 * @returns {{ events: Array<{ key: string, data: object }>, memory: { state: string, low: Set<string> | null } }}
 */
export function sceneEvents({ device, name, previous, printer, state, config }) {
  const lang = config.language;
  const events = [];
  const low = new Set(
    (printer?.supplies ?? [])
      .filter((supply) => isLow(supply, config.low_threshold))
      .map((supply) => supply.key),
  );

  if (previous && PAPER_STATES.includes(state) && previous.state !== state) {
    events.push({
      key: TRIGGER.PAPER_PROBLEM,
      data: {
        printer: device,
        problem: state,
        printer_name: name,
        problem_label: STATE_LABELS[lang][state],
        display_text: printer?.display || '',
      },
    });
  }

  if (previous?.low && printer) {
    for (const supply of printer.supplies) {
      if (low.has(supply.key) && !previous.low.has(supply.key)) {
        events.push({
          key: TRIGGER.SUPPLY_LOW,
          data: {
            printer: device,
            kind: supply.kind,
            printer_name: name,
            supply: FEATURE_NAMES[lang][supply.key],
            level: supply.level,
          },
        });
      }
    }
  }

  // An unreachable printer reports no level: keep what was low before, so
  // that its return does not count as a new crossing.
  const memory = { state, low: printer ? low : (previous?.low ?? null) };
  return { events, memory };
}
