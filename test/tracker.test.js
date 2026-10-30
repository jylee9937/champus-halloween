import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, emptyStats, restoreState, newSid, createTracker, INFO_IDS, SURVEY_STEPS } from '../src/lib/tracker.js';

const screens = (s, ...ids) => ids.reduce((acc, id) => applyEvent(acc, { type: 'screen', id }), s);

test('screen views raise the maxes and never lower them', () => {
  let s = screens(emptyStats(), 's1', 's2', 's3', 's3_1', 's4');
  assert.equal(s.maxSurveyStep, 5);
  assert.equal(s.lastScreen, 's4');
  s = screens(s, 's2'); // back navigation
  assert.equal(s.maxSurveyStep, 5);
  assert.equal(s.lastScreen, 's2');
  s = screens(s, 's10', 'l1', 'l5', 'l2');
  assert.equal(s.maxSurveyStep, SURVEY_STEPS.length - 1);
  assert.equal(s.maxLessonStep, 5);
  assert.equal(s.lessonCompleted, false);
  s = screens(s, 'l11', 'l1');
  assert.equal(s.maxLessonStep, 11);
  assert.equal(s.lessonCompleted, true);
  assert.equal(s.lastScreen, 'l1');
});

test('the retired S5 is never recorded; S4 → S6 keeps the contract indices (s4=5, s6=7)', () => {
  let s = screens(emptyStats(), 's1', 's2', 's3', 's3_1', 's4');
  assert.equal(s.maxSurveyStep, 5);
  assert.equal(applyEvent(s, { type: 'screen', id: 's5' }), s);
  s = screens(s, 's6');
  assert.equal(s.maxSurveyStep, 7);
  assert.equal(s.lastScreen, 's6');
  // A tab restored from a snapshot taken on the old S5 never sends 's5' again.
  const r = restoreState({ sid: 'A'.repeat(20), created: true, stats: { ...emptyStats(), lastScreen: 's5', maxSurveyStep: 6 } });
  assert.equal(r.stats.lastScreen, 's0');
  assert.equal(r.stats.maxSurveyStep, 6);
});

test('unknown screens, activities and spots are ignored', () => {
  const s = emptyStats();
  assert.equal(applyEvent(s, { type: 'screen', id: 's3-1' }), s);
  assert.equal(applyEvent(s, { type: 'screen', id: 'l12' }), s);
  assert.equal(applyEvent(s, { type: 'infoOpen', id: 'undecided' }), s);
  assert.equal(applyEvent(s, { type: 'infoOpen', id: 'other' }), s);
  assert.equal(applyEvent(s, { type: 'instagram', where: 'elsewhere' }), s);
  assert.equal(applyEvent(s, { type: 'nope' }), s);
  assert.equal(applyEvent(s, { type: 'screen', id: 's0' }), s, 'unchanged screen returns the same object');
});

test('counters and flags', () => {
  let s = emptyStats();
  for (const e of [
    { type: 'infoOpen', id: 'futsal' }, { type: 'infoOpen', id: 'futsal' }, { type: 'infoSelect', id: 'futsal' },
    { type: 'submitAttempt' }, { type: 'submitFailure' }, { type: 'submitAttempt' }, { type: 'submitted' }, { type: 'submitted' },
    { type: 'lessonRestart' }, { type: 'instagram', where: 'done' }, { type: 'instagram', where: 'lessonEnd' },
  ]) s = applyEvent(s, e);
  assert.equal(s.infoOpens.futsal, 2);
  assert.equal(s.infoSelects.futsal, 1);
  assert.equal(s.infoOpens['book-club'], 0);
  assert.deepEqual([s.submitAttempts, s.submitFailures, s.submitted, s.lessonRestarts], [2, 1, true, 1]);
  assert.deepEqual(s.instagramClicks, { done: 1, lessonEnd: 1 });
});

test('maps always carry all 10 real activities and both Instagram spots', () => {
  const s = emptyStats();
  assert.deepEqual(Object.keys(s.infoOpens), INFO_IDS);
  assert.equal(INFO_IDS.length, 10);
  assert.ok(!INFO_IDS.includes('undecided') && !INFO_IDS.includes('other'));
  assert.deepEqual(Object.keys(s.instagramClicks), ['done', 'lessonEnd']);
});

test('restoreState rebuilds only known fields and rejects bad sids', () => {
  assert.equal(restoreState(null), null);
  assert.equal(restoreState({ sid: 'short' }), null);
  const sid = 'A'.repeat(20);
  const r = restoreState({ sid, created: true, stats: {
    maxSurveyStep: 7, maxLessonStep: 99, submitAttempts: -3, infoOpens: { futsal: 2, hacker: 9 }, name: '홍길동', lastScreen: 'evil',
  } });
  assert.equal(r.sid, sid);
  assert.equal(r.created, true);
  assert.equal(r.stats.maxSurveyStep, 7);
  assert.equal(r.stats.maxLessonStep, 11);
  assert.equal(r.stats.submitAttempts, 0);
  assert.equal(r.stats.infoOpens.futsal, 2);
  assert.equal('hacker' in r.stats.infoOpens, false);
  assert.equal('name' in r.stats, false);
  assert.equal(r.stats.lastScreen, 's0');
  assert.deepEqual(Object.keys(r.stats), Object.keys(emptyStats()));
});

test('newSid makes 20 [A-Za-z0-9] characters', () => {
  for (let i = 0; i < 50; i++) assert.match(newSid(), /^[A-Za-z0-9]{20}$/);
  assert.notEqual(newSid(), newSid());
});

// ---- scheduler ----

function fakeTimers() {
  let now = 0, seq = 0;
  const queue = new Map();
  return {
    setTimeout(fn, ms) { const id = ++seq; queue.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { queue.delete(id); },
    async advance(ms) {
      now += ms;
      for (const [id, t] of [...queue].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now) { queue.delete(id); t.fn(); }
      }
      await new Promise(r => setImmediate(r)); // let write promises settle
    },
    pending: () => queue.size,
  };
}

function setup({ saved = null, write } = {}) {
  const timers = fakeTimers();
  const writes = [];
  const store = { value: saved };
  const tracker = createTracker({
    load: () => store.value,
    save: v => { store.value = structuredClone(v); },
    write: write ?? (async (sid, stats, opts) => { writes.push({ sid, stats: structuredClone(stats), ...opts }); }),
    makeSid: () => 'S'.repeat(20),
    timers,
  });
  return { tracker, timers, writes, store };
}

test('first screen view creates the doc after the debounce; bursts batch into one write', async () => {
  const { tracker, timers, writes } = setup();
  tracker.record({ type: 'screen', id: 's0' });
  await timers.advance(799);
  assert.equal(writes.length, 0);
  await timers.advance(1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].create, true);
  assert.equal(writes[0].sid, 'S'.repeat(20));

  tracker.record({ type: 'screen', id: 's1' });
  tracker.record({ type: 'infoOpen', id: 'futsal' });
  tracker.record({ type: 'infoSelect', id: 'futsal' });
  await timers.advance(800);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].create, false);
  assert.equal(writes[1].stats.maxSurveyStep, 1);
  assert.equal(writes[1].stats.infoSelects.futsal, 1);
});

test('nothing changed after the doc exists: no write', async () => {
  const { tracker, timers, writes } = setup();
  tracker.record({ type: 'screen', id: 's0' });
  await timers.advance(800);
  tracker.record({ type: 'screen', id: 's0' });
  await timers.advance(5000);
  assert.equal(writes.length, 1);
  assert.equal(timers.pending(), 0);
});

test('writes are serialized: changes during an in-flight write go out after it settles', async () => {
  let release;
  const writes = [];
  const { tracker, timers } = setup({
    write: (sid, stats, opts) => { writes.push({ stats: structuredClone(stats), ...opts }); return new Promise(r => { release = r; }); },
  });
  tracker.record({ type: 'screen', id: 's0' });
  await timers.advance(800);
  tracker.record({ type: 'screen', id: 's1' });
  await timers.advance(800);
  tracker.flush();
  assert.equal(writes.length, 1, 'second write waits for the first');
  release();
  await timers.advance(0);
  await timers.advance(800);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].create, false, 'the create was acknowledged before the update');
  assert.equal(writes[1].stats.lastScreen, 's1');
});

test('flush() sends immediately (pagehide) and never rejects', async () => {
  const { tracker, writes } = setup({ write: async () => { writes.push(1); throw new Error('offline'); } });
  tracker.record({ type: 'screen', id: 's0' });
  await tracker.flush();
  assert.equal(writes.length, 1);
});

test('a failed write retries with backoff, then gives up after 3 failures', async () => {
  let calls = 0;
  const { tracker, timers } = setup({ write: async () => { calls++; throw new Error('boom'); } });
  tracker.record({ type: 'screen', id: 's0' });
  await timers.advance(800);
  assert.equal(calls, 1);
  await timers.advance(1600);
  assert.equal(calls, 2);
  await timers.advance(3200);
  assert.equal(calls, 3);
  tracker.record({ type: 'screen', id: 's1' });
  await timers.advance(60000);
  assert.equal(calls, 3);
});

test('permission-denied flips create↔update for the next attempt', async () => {
  const modes = [];
  let fail = true;
  const { tracker, timers, store } = setup({
    write: async (sid, stats, { create }) => {
      modes.push(create);
      if (fail) { fail = false; throw Object.assign(new Error('denied'), { code: 'permission-denied' }); }
    },
  });
  tracker.record({ type: 'screen', id: 's0' });
  await timers.advance(800);
  await timers.advance(1600);
  assert.deepEqual(modes, [true, false], 'create rejected (doc already existed) → retried as update');
  assert.equal(store.value.created, true);
});

test('state persists, so a reload continues the same session without lowering anything', async () => {
  const first = setup();
  first.tracker.record({ type: 'screen', id: 's0' });
  first.tracker.record({ type: 'screen', id: 's6' });
  first.tracker.record({ type: 'infoOpen', id: 'futsal' });
  await first.timers.advance(800);
  const saved = first.store.value;
  assert.equal(saved.created, true);

  const second = setup({ saved });
  assert.equal(second.tracker.state().sid, 'S'.repeat(20));
  second.tracker.record({ type: 'screen', id: 's0' }); // the survey restarts at S0 after a reload
  await second.timers.advance(800);
  assert.equal(second.writes.length, 1);
  assert.equal(second.writes[0].create, false);
  assert.equal(second.writes[0].stats.maxSurveyStep, 7);
  assert.equal(second.writes[0].stats.infoOpens.futsal, 1);
  assert.equal(second.writes[0].stats.lastScreen, 's0');
});
