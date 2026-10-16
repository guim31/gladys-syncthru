// -----------------------------------------------------------------------------
// The integration, wired on a Gladys client.
//
// registerIntegration() registers every SDK handler; index.js only creates the
// client, calls it and connects. The tests mount it on the SDK's fake Gladys
// (@gladysassistant/integration-sdk/testing) against a fake SyncThru HTTP
// server, with the timers off.
//
// Logs (CLAUDE.md, "journaux calmes"): at info, only the lifecycle — start,
// discovery asked by the user, a printer lost and back, a configuration, the
// test action. A poll, a published state, a scene event go to debug. A printer
// that stays off writes one warning, then one line when it answers again.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, pollIntervalMs } from './config.js';
import {
  HOST_PARAM,
  buildDevice,
  isPrinterId,
  offlineStates,
  printerIds,
  readingStates,
} from './devices.js';
import { SCAN_TIMEOUT_SECONDS, mapLimited, ssdpAddresses } from './discovery.js';
import { MESSAGES, WIDGET_TEXT, testFailedMessage, testMessage } from './i18n.js';
import { createIssueLog } from './issues.js';
import { createPoller } from './poller.js';
import { classifyState, readPrinter } from './printer.js';
import {
  SyncThruError,
  displayAddress,
  normalizeAddress,
  readCounters as defaultReadCounters,
  readHome as defaultReadHome,
} from './syncthru/client.js';
import { sceneEvents } from './triggers.js';
import { REFRESH_ACTION, WIDGET_KEY, buildPrinterContent } from './widgets.js';

export const TEST_ACTION = 'test_printer';

// A stable value is re-sent twice a day at least: Gladys shows "no recent
// value" past 48 h, and the CLAUDE.md rule asks for 12 h at most.
export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;
// Page counters move slowly, and not every model serves them.
export const COUNTERS_EVERY_MS = 15 * 60 * 1000;
// A printer that stopped answering may have a new DHCP lease: look again,
// not more often than this.
export const REDISCOVERY_EVERY_MS = 30 * 60 * 1000;
const REDISCOVER_AFTER_FAILURES = 3;

/**
 * @param {object} gladys GladysIntegration, or the SDK's fake Gladys
 * @param {object} [deps]
 * @param {Function} [deps.readHome]
 * @param {Function} [deps.readCounters]
 * @param {() => number} [deps.now]
 * @param {boolean} [deps.timers]
 * @param {object} [deps.logger]
 * @param {string} [deps.timeZone] the zone of Gladys (TZ, set by the supervisor)
 * @param {number} [deps.periodMs] a polling period overriding the configuration (tests)
 */
export function registerIntegration(gladys, deps = {}) {
  const readHome = deps.readHome ?? defaultReadHome;
  const readCounters = deps.readCounters ?? defaultReadCounters;
  const now = deps.now ?? (() => Date.now());
  const logger = deps.logger ?? createLogger({ name: 'syncthru' });
  const timeZone = deps.timeZone ?? process.env.TZ;
  const issues = createIssueLog(logger);

  let config = normalizeConfig();
  /** Address of each printer seen by a discovery, by device external id. */
  const addressById = new Map();
  /** Last reading of each printer, by device external id (widget, triggers). */
  const snapshots = new Map();
  let lastDiscoveryAt = null;
  let discovering = null;

  /** The printers the user added to Gladys. */
  const createdPrinters = () =>
    (gladys.devices ?? []).filter((device) => isPrinterId(gladys, device.external_id));

  function addressOf(device) {
    const known = addressById.get(device.external_id);
    if (known) {
      return known;
    }
    const param = (device.params ?? []).find((entry) => entry.name === HOST_PARAM)?.value;
    try {
      return param ? normalizeAddress(param) : null;
    } catch {
      return null;
    }
  }

  // --- Discovery -------------------------------------------------------------

  async function ssdpScan() {
    try {
      const results = await gladys.scanNetwork('ssdp', { timeoutSeconds: SCAN_TIMEOUT_SECONDS });
      issues.ok('ssdp', 'SSDP discovery works again');
      return ssdpAddresses(results);
    } catch (err) {
      // An older core, a refused capture: the manual list still works.
      issues.fail('ssdp', `SSDP discovery unavailable (${err.message}): manual addresses only`);
      return [];
    }
  }

  /**
   * Look for printers (SSDP, the configured addresses, the known ones) and
   * publish the ones that answer.
   */
  async function discover({ ssdp = true } = {}) {
    const fromSsdp = ssdp ? await ssdpScan() : [];
    const known = createdPrinters().map(addressOf).filter(Boolean);
    const candidates = [...new Set([...config.addresses, ...known, ...fromSsdp])];
    const readings = await mapLimited(candidates, async (baseUrl) => {
      try {
        return { baseUrl, home: await readHome(baseUrl) };
      } catch (err) {
        logger.debug(`${displayAddress(baseUrl)}: no SyncThru answer (${err.message})`);
        return null;
      }
    });
    const devices = new Map();
    for (const reading of readings.filter(Boolean)) {
      const counters = await readCounters(reading.baseUrl);
      const printer = readPrinter(reading.home, counters);
      const ids = printerIds(gladys, printer, reading.baseUrl);
      if (devices.has(ids.device)) {
        // The same printer under two addresses: the first one wins.
        continue;
      }
      addressById.set(ids.device, reading.baseUrl);
      devices.set(ids.device, buildDevice(gladys, { baseUrl: reading.baseUrl, printer }, config));
    }
    lastDiscoveryAt = now();
    await gladys.publishDiscoveredDevices([...devices.values()]);
    return { candidates, devices: [...devices.values()] };
  }

  /** One discovery at a time: a second caller shares the running one. */
  function discoverOnce(options) {
    if (!discovering) {
      discovering = discover(options).finally(() => {
        discovering = null;
      });
    }
    return discovering;
  }

  // --- Polling ---------------------------------------------------------------

  async function publish(states) {
    await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
  }

  async function fireScenes(device, previous, printer, state) {
    const { events, memory } = sceneEvents({
      device: device.external_id,
      name: device.name,
      previous,
      printer,
      state,
      config,
    });
    for (const event of events) {
      try {
        await gladys.publishSceneEvent(event.key, event.data);
        issues.ok(`scene:${event.key}`, `scene trigger ${event.key} accepted again`);
        logger.debug(`${device.name}: scene event ${event.key}`);
      } catch (err) {
        issues.fail(`scene:${event.key}`, `scene trigger ${event.key} refused (${err.message})`);
      }
    }
    return memory;
  }

  /** Only the states of features the created device has: the rest is dropped by Gladys. */
  function forDevice(device, states) {
    const created = new Set((device.features ?? []).map((feature) => feature.external_id));
    return created.size === 0
      ? states
      : states.filter((entry) => created.has(entry.device_feature_external_id));
  }

  /**
   * Read one created printer and publish what changed.
   * @returns {Promise<{ ok: boolean, stateChanged: boolean }>}
   */
  async function pollPrinter(device, { force = false } = {}) {
    const baseUrl = addressOf(device);
    const previous = snapshots.get(device.external_id);
    const key = `printer:${device.external_id}`;
    const ids = {
      device: device.external_id,
      feature: (featureKey) => `${device.external_id}:${featureKey}`,
    };
    let home;
    try {
      if (!baseUrl) {
        throw new SyncThruError('invalid_address', 'no address known');
      }
      home = await readHome(baseUrl);
    } catch (err) {
      const failures = (previous?.failures ?? 0) + 1;
      issues.fail(key, `${device.name}: printer unreachable (${err.message})`);
      const memory = await fireScenes(device, previous?.memory, null, 'offline');
      snapshots.set(device.external_id, {
        ...(previous ?? { printer: null, readAt: null, countersAt: null }),
        state: 'offline',
        failures,
        memory,
      });
      await publish(forDevice(device, offlineStates(ids, config.language)));
      if (
        failures >= REDISCOVER_AFTER_FAILURES &&
        (lastDiscoveryAt === null || now() - lastDiscoveryAt >= REDISCOVERY_EVERY_MS)
      ) {
        // A new address will be used from the next poll on.
        discoverOnce().catch((discoveryError) =>
          logger.debug(`Rediscovery failed (${discoveryError.message})`),
        );
      }
      return { ok: false, stateChanged: previous?.state !== 'offline' };
    }

    const wantsCounters = (device.features ?? []).some((feature) =>
      /:pages_(printed|copied)$/.test(feature.external_id),
    );
    let counters = null;
    let countersAt = previous?.countersAt ?? null;
    if (
      wantsCounters &&
      (force || countersAt === null || now() - countersAt >= COUNTERS_EVERY_MS)
    ) {
      counters = await readCounters(baseUrl);
      countersAt = now();
    }
    const printer = readPrinter(home, counters);
    if (!counters && previous?.printer) {
      // Between two counter readings, keep the last values.
      printer.counters = previous.printer.counters;
    }
    const state = classifyState(printer, { lowThreshold: config.low_threshold });
    if (issues.isFailing(key)) {
      issues.ok(key, `${device.name}: printer answers again`);
    }
    logger.debug(`${device.name}: ${state}, ${printer.supplies.length} supplies`);

    const memory = await fireScenes(device, previous?.memory, printer, state);
    snapshots.set(device.external_id, {
      printer,
      state,
      readAt: now(),
      countersAt,
      failures: 0,
      memory,
    });
    await publish(forDevice(device, readingStates(ids, printer, state, config.language)));
    const levelsChanged =
      JSON.stringify(previous?.printer?.supplies ?? null) !== JSON.stringify(printer.supplies);
    return { ok: true, stateChanged: previous?.state !== state || levelsChanged };
  }

  const poller = createPoller({
    devices: createdPrinters,
    periodMs: () => deps.periodMs ?? pollIntervalMs(config),
    connected: () => gladys.connected !== false,
    timers: deps.timers ?? true,
    now,
    logger,
    poll: async (device, options) => {
      const result = await pollPrinter(device, options);
      if (result.stateChanged) {
        // Gauges bound to features follow the states live; the status rows
        // are cached by the core until the TTL.
        refreshWidget();
      }
      return result;
    },
  });

  function refreshWidget() {
    try {
      gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget refresh not sent (${err.message})`);
    }
  }

  // --- Handlers --------------------------------------------------------------

  gladys.onScanRequest(async () => {
    const { candidates, devices } = await discoverOnce();
    logger.info(
      `Discovery: ${devices.length} SyncThru printer(s) out of ${candidates.length} address(es)`,
    );
  });

  // The core's scheduler: a fallback, skipped while the container's timer runs.
  gladys.onPoll(async (device) => {
    if (!isPrinterId(gladys, device.external_id)) {
      return;
    }
    const created = createdPrinters().find((entry) => entry.external_id === device.external_id);
    await poller.pollFromCore(created ?? device);
  });

  // A printer just added (or updated): Gladys dropped the states published
  // before its features existed, and the SDK forgot them. Send all now.
  const onCreatedOrUpdated = async (device) => {
    if (!isPrinterId(gladys, device.external_id)) {
      return;
    }
    logger.info(`${device.name}: added to Gladys, reading it now`);
    await poller.pollNow(device).catch(() => {});
    refreshWidget();
  };
  gladys.onDeviceCreated(onCreatedOrUpdated);
  gladys.onDeviceUpdated(onCreatedOrUpdated);
  gladys.onDeviceDeleted((device) => {
    snapshots.delete(device.external_id);
    poller.forget(device.external_id);
  });

  gladys.onAction(TEST_ACTION, async (fields) => {
    let baseUrl;
    try {
      baseUrl = normalizeAddress(fields?.address);
    } catch {
      logger.info('Test action: invalid address');
      return MESSAGES.invalidAddress;
    }
    const address = displayAddress(baseUrl);
    try {
      const home = await readHome(baseUrl);
      const printer = readPrinter(home, await readCounters(baseUrl));
      const state = classifyState(printer, { lowThreshold: config.low_threshold });
      logger.info(`Test action: ${address} answers (${printer.identity.model || 'SyncThru'})`);
      return testMessage({ address, printer, state, lowThreshold: config.low_threshold });
    } catch (err) {
      logger.info(`Test action: ${address} does not answer (${err.message})`);
      return testFailedMessage({ address, code: err.code });
    }
  });

  gladys.onWidgetGet(WIDGET_KEY, async ({ settings, language } = {}) => {
    const printers = createdPrinters();
    const device =
      printers.find((entry) => entry.external_id === settings?.printer) ?? printers[0] ?? null;
    return buildPrinterContent({
      device,
      ids: device ? { feature: (featureKey) => `${device.external_id}:${featureKey}` } : null,
      snapshot: device ? (snapshots.get(device.external_id) ?? null) : null,
      language,
      lowThreshold: config.low_threshold,
      timeZone,
    });
  });

  gladys.onWidgetAction(WIDGET_KEY, async (actionKey, _params, { settings } = {}) => {
    if (actionKey !== REFRESH_ACTION) {
      throw new Error(`Unknown widget action ${actionKey}`);
    }
    const printers = createdPrinters();
    const device = printers.find((entry) => entry.external_id === settings?.printer) ?? printers[0];
    if (!device) {
      return WIDGET_TEXT.noPrinter;
    }
    logger.info(`${device.name}: refresh asked from the dashboard`);
    const result = await poller.pollNow(device);
    return result?.ok ? WIDGET_TEXT.refreshed : WIDGET_TEXT.refreshFailed;
  });

  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('Configuration updated');
    config = normalizeConfig(newConfig);
    await start();
  });

  // --- Lifecycle -------------------------------------------------------------

  async function start() {
    if (config.invalidAddresses.length > 0) {
      logger.warn(`Ignored invalid printer address(es): ${config.invalidAddresses.join(', ')}`);
    }
    const { devices } = await discoverOnce();
    logger.info(
      `Ready: ${devices.length} printer(s) found, ${createdPrinters().length} added to Gladys, ` +
        `read every ${config.poll_interval} s`,
    );
    await gladys.setConnectionStatus(true);
    await poller.restart();
  }

  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      await start();
    } catch (err) {
      logger.error(`Startup failed (${err.message})`);
      await gladys.setConnectionStatus(false, MESSAGES.initFailed).catch(() => {});
    }
  });

  return {
    stop: () => poller.stop(),
    poller,
    snapshots,
    discover: discoverOnce,
    get config() {
      return config;
    },
  };
}
