// -----------------------------------------------------------------------------
// A whole world for the end-to-end tests: fake SyncThru printers over real
// HTTP, the SDK's fake Gladys, and the integration registered on it with its
// timers off and a recording logger.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerIntegration } from '../../src/app.js';
import { startFakePrinter } from './fakeSyncThru.js';
import { RAW } from './printers.js';

/** A logger that keeps every line, by level. */
export function recordingLogger() {
  const lines = [];
  const log =
    (level) =>
    (...parts) =>
      lines.push({
        level,
        text: parts.map((part) => (part instanceof Error ? part.message : String(part))).join(' '),
      });
  return {
    lines,
    at: (level) => lines.filter((line) => line.level === level).map((line) => line.text),
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    clear: () => lines.splice(0, lines.length),
  };
}

export const DEFAULT_PRINTERS = [
  { home: RAW.c430w },
  { home: RAW.m2070, counters: RAW.m2070Counters },
  { home: RAW.c480fw },
];

/**
 * @param {object} [options]
 * @param {Array<{ home, counters? }>} [options.printers]
 * @param {object} [options.config] merged over the printer addresses
 * @param {Array} [options.ssdp] raw SSDP results served by the fake core
 * @param {() => number} [options.now]
 */
export async function createWorld({ printers = DEFAULT_PRINTERS, config = {}, ssdp, now } = {}) {
  const fakes = [];
  for (const documents of printers) {
    fakes.push(await startFakePrinter(documents));
  }
  const gladys = createFakeGladys({
    config: { printers: fakes.map((printer) => printer.url).join(', '), ...config },
    scanResults: ssdp ? { ssdp } : {},
  });
  const logger = recordingLogger();
  const app = registerIntegration(gladys, { timers: false, logger, now, timeZone: 'UTC' });
  await gladys.connect();

  /** The user adds every discovered printer (or the given ones) to Gladys. */
  async function addAll(devices = gladys.fake.discoveredDevices) {
    for (const device of devices) {
      await gladys.fake.deviceCreated(device);
    }
    return devices;
  }

  return {
    gladys,
    fake: gladys.fake,
    app,
    printers: fakes,
    logger,
    addAll,
    async stop() {
      app.stop();
      await Promise.all(fakes.map((printer) => printer.close()));
    },
  };
}
