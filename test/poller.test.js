import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPoller } from '../src/poller.js';

const silent = { debug() {}, error() {} };

test('the timer polls every device by itself, one cycle after the other', async () => {
  const polled = [];
  const poller = createPoller({
    devices: () => [{ external_id: 'a' }, { external_id: 'b' }],
    poll: async (device) => polled.push(device.external_id),
    periodMs: () => 20,
    logger: silent,
  });
  await poller.restart();
  assert.deepEqual(polled, ['a', 'b']);
  await new Promise((resolve) => setTimeout(resolve, 70));
  poller.stop();
  const count = polled.length;
  assert.ok(count >= 4, `only ${count} polls`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(polled.length, count, 'stopped');
});

test('one poll at a time per device; the core is skipped while the timer keeps up', async () => {
  let current = 0;
  let calls = 0;
  let release;
  const poller = createPoller({
    devices: () => [],
    poll: () => {
      calls += 1;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    periodMs: () => 1000,
    now: () => current,
    timers: false,
    logger: silent,
  });
  const device = { external_id: 'a' };
  const first = poller.pollNow(device);
  const second = poller.pollFromCore(device);
  release('done');
  assert.equal(await first, 'done');
  assert.equal(await second, 'done');
  assert.equal(calls, 1);
  current = 500;
  assert.equal(await poller.pollFromCore(device), undefined);
  assert.equal(calls, 1);
  current = 1000;
  const third = poller.pollFromCore(device);
  release('again');
  assert.equal(await third, 'again');
  assert.equal(calls, 2);
});

test('a disconnected Gladys skips the cycle; a failing poll never escapes', async () => {
  let connected = false;
  let calls = 0;
  const poller = createPoller({
    devices: () => [{ external_id: 'a' }],
    poll: async () => {
      calls += 1;
      throw new Error('boom');
    },
    periodMs: () => 1000,
    connected: () => connected,
    timers: false,
    logger: silent,
  });
  await poller.cycle({ force: true });
  assert.equal(calls, 0);
  connected = true;
  await poller.cycle({ force: true });
  assert.equal(calls, 1);
});
