import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPrinter } from '../src/printer.js';
import { sceneEvents } from '../src/triggers.js';
import { c430wWith } from './helpers/printers.js';

const config = { language: 'fr', low_threshold: 10 };
const base = { device: 'ext:x:printer:1', name: 'Bureau', config };

function step(previous, doc, state) {
  return sceneEvents({ ...base, previous, printer: doc ? readPrinter(doc) : null, state });
}

test('nothing at the first reading, even jammed and low', () => {
  const { events, memory } = step(undefined, c430wWith({ hr: 3, display: 'Paper Jam' }), 'jam');
  assert.deepEqual(events, []);
  assert.deepEqual([...memory.low], ['toner_black']);
});

test('one event per transition', () => {
  let { memory } = step(undefined, c430wWith({ hr: 2 }), 'ready');
  let result = step(memory, c430wWith({ hr: 3, display: 'Paper Jam' }), 'jam');
  assert.deepEqual(
    result.events.map((event) => [event.key, event.data.problem, event.data.problem_label]),
    [['paper_problem', 'jam', 'Bourrage papier']],
  );
  result = step(result.memory, c430wWith({ hr: 3, display: 'Paper Jam' }), 'jam');
  assert.deepEqual(result.events, []);
  memory = result.memory;
  result = step(memory, c430wWith({ hr: 3, toner: { yellow: { remaining: 3 } } }), 'toner_low');
  assert.deepEqual(result.events, [
    {
      key: 'supply_low',
      data: {
        printer: base.device,
        kind: 'toner',
        printer_name: 'Bureau',
        supply: 'Toner jaune',
        level: 3,
      },
    },
  ]);
});

test('offline in between: neither a new crossing nor a lost memory', () => {
  const first = step(undefined, c430wWith({ hr: 3 }), 'toner_low');
  const off = step(first.memory, null, 'offline');
  assert.deepEqual(off.events, []);
  assert.deepEqual([...off.memory.low], ['toner_black']);
  const back = step(off.memory, c430wWith({ hr: 3 }), 'toner_low');
  assert.deepEqual(back.events, []);
});

test('offline from the start: the return does not fire for supplies already low', () => {
  const off = step(undefined, null, 'offline');
  assert.equal(off.memory.low, null);
  const back = step(off.memory, c430wWith({ hr: 3, display: 'Out of paper' }), 'out_of_paper');
  assert.deepEqual(
    back.events.map((event) => event.key),
    ['paper_problem'],
  );
});
