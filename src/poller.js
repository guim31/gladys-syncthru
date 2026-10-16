// -----------------------------------------------------------------------------
// The container's own polling timer.
//
// The printers are published with `should_poll: true` and a valid
// `poll_frequency`, but the core cannot be trusted to call onPoll: Gladys
// 5.2.x skips a device created without `should_poll`, and a device keeps the
// polling fields it was created with (GladysAssistant/Gladys#3198, not fixed
// in 5.2.1). So the container polls by itself, at the configured pace, and the
// core's onPoll stays as a fallback.
//
// No double work: the timer skips a printer polled less than half a period
// ago, the core's onPoll skips one polled less than a period ago — while the
// timer runs, the core never reaches the printer; it takes over only if the
// timer stalls. One poll at a time per printer: a second caller (the widget's
// refresh button, the core) waits for the one in progress.
//
// The timer re-arms itself at the end of a cycle, never on a fixed beat: a
// slow printer cannot pile requests up.
// -----------------------------------------------------------------------------

/**
 * @param {object} options
 * @param {() => Array<{ external_id: string }>} options.devices the printers to poll
 * @param {(device: object, options: { force: boolean }) => Promise<unknown>} options.poll
 * @param {() => number} options.periodMs
 * @param {() => boolean} [options.connected]
 * @param {boolean} [options.timers] run the periodic timer (tests may turn it off)
 * @param {() => number} [options.now]
 * @param {{ debug: Function, error: Function }} options.logger
 */
export function createPoller({
  devices,
  poll,
  periodMs,
  connected = () => true,
  timers = true,
  now = () => Date.now(),
  logger,
}) {
  /** Start of the last poll, by device external id. */
  const lastPolledAt = new Map();
  /** Polls in progress, by device external id. */
  const inFlight = new Map();
  let timer = null;
  let stopped = true;

  /**
   * Poll one printer unless it was polled less than `minGap` periods ago.
   * Forced: waits for a poll in progress (it may predate a change), then polls.
   */
  async function pollOne(device, { force = false, minGap = 0.5 } = {}) {
    const id = device.external_id;
    let running = inFlight.get(id);
    while (running && force) {
      await running.catch(() => {});
      running = inFlight.get(id);
    }
    if (running) {
      return running;
    }
    const last = lastPolledAt.get(id);
    if (!force && last !== undefined && now() - last < periodMs() * minGap) {
      logger.debug(`${id}: polled ${now() - last} ms ago, skipped`);
      return undefined;
    }
    lastPolledAt.set(id, now());
    const run = poll(device, { force });
    inFlight.set(id, run);
    try {
      return await run;
    } finally {
      inFlight.delete(id);
    }
  }

  /** One cycle: every printer, in parallel; errors never escape. */
  async function cycle({ force = false } = {}) {
    if (!connected()) {
      logger.debug('Gladys unreachable: poll skipped');
      return;
    }
    await Promise.all(devices().map((device) => pollOne(device, { force }).catch(() => {})));
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      try {
        await cycle();
      } catch (err) {
        logger.error(`Polling cycle failed (${err.message})`);
      } finally {
        schedule();
      }
    }, periodMs());
    timer.unref?.();
  }

  return {
    /** (Re)start: polls every printer now, then every period. */
    async restart() {
      stopped = false;
      lastPolledAt.clear();
      schedule();
      await cycle({ force: true });
    },

    /** One cycle now, as the timer would run it (tests, rediscovery). */
    cycle,

    /** The core's onPoll: skipped while the timer keeps up. */
    pollFromCore(device) {
      return pollOne(device, { minGap: 1 });
    },

    /** Poll now: a device just added, the widget's refresh button. */
    pollNow(device) {
      return pollOne(device, { force: true });
    },

    /** Forget a deleted printer. */
    forget(externalId) {
      lastPolledAt.delete(externalId);
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
  };
}
