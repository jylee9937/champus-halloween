import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// In-memory stand-in for the Firestore SDK (no network): records queries, batch commits and setDoc calls.
let docsByCollection = {};
let calls;
let failCommit = null;
const stub = () => ({});
const SERVER_TS = { __serverTimestamp: true };

mock.module('firebase/app', { namedExports: { initializeApp: stub } });
mock.module('firebase/firestore', {
  namedExports: {
    getFirestore: () => 'db',
    collection: (db, name) => ({ collection: name }),
    doc: (db, path, id) => ({ path, id }),
    where: (field, op, value) => ({ field, op, value }),
    query: (col, ...constraints) => ({ ...col, constraints }),
    getDocs: async q => { calls.queries.push(q); return { docs: docsByCollection[q.collection] ?? [] }; },
    writeBatch: () => {
      const refs = [];
      return {
        delete: ref => refs.push(ref),
        commit: async () => {
          if (failCommit && refs[0]?.startsWith(failCommit)) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
          calls.batches.push(refs);
        },
      };
    },
    setDoc: async (ref, data, options) => { calls.setDocs.push({ ref, data, options }); },
    serverTimestamp: () => SERVER_TS,
    Timestamp: { fromMillis: ms => ({ ms }) },
    addDoc: stub, getDoc: stub, orderBy: stub,
  },
});

const { purgeExpired, writeSession } = await import('../src/lib/firebase.js');
const { emptyStats } = await import('../src/lib/tracker.js');

const NOW = Date.parse('2027-11-01T00:00:00Z');
const expired = (prefix, n) => Array.from({ length: n }, (_, i) => ({ ref: `${prefix}/${i}` }));
const silenceConsole = () => mock.method(console, 'error', () => {});

beforeEach(() => {
  calls = { queries: [], batches: [], setDocs: [] };
  failCommit = null;
  docsByCollection = {};
});

test('purge queries responses then sessions, only expireAt in the past (with a clock-skew margin)', async () => {
  await purgeExpired(NOW);
  assert.deepEqual(calls.queries.map(q => q.collection), ['responses', 'sessions']);
  for (const q of calls.queries) {
    assert.deepEqual(q.constraints, [{ field: 'expireAt', op: '<', value: { ms: NOW - 10 * 60 * 1000 } }]);
  }
});

test('purge deletes in batches of at most 500 and returns both counts', async () => {
  docsByCollection = { responses: expired('responses', 1203), sessions: expired('sessions', 2) };
  assert.deepEqual(await purgeExpired(NOW), { responses: 1203, sessions: 2 });
  assert.deepEqual(calls.batches.map(b => b.length), [500, 500, 203, 2]);
  assert.deepEqual(calls.batches.flat(), [...docsByCollection.responses, ...docsByCollection.sessions].map(d => d.ref));
});

test('nothing expired: no batch is committed', async () => {
  assert.deepEqual(await purgeExpired(NOW), { responses: 0, sessions: 0 });
  assert.equal(calls.batches.length, 0);
});

test('a rejected responses batch surfaces to the caller', async () => {
  docsByCollection = { responses: expired('responses', 3) };
  failCommit = 'responses';
  await assert.rejects(purgeExpired(NOW), { code: 'permission-denied' });
});

test('a failed sessions purge is logged and never hides the responses result', async () => {
  const err = silenceConsole();
  docsByCollection = { responses: expired('responses', 2), sessions: expired('sessions', 1) };
  failCommit = 'sessions';
  assert.deepEqual(await purgeExpired(NOW), { responses: 2, sessions: 0 });
  assert.equal(err.mock.callCount(), 1);
  err.mock.restore();
});

test('writeSession create: one full doc with server timestamps and a 365-day expireAt', async () => {
  const stats = emptyStats();
  const before = Date.now();
  await writeSession('S'.repeat(20), stats, { create: true });
  const { ref, data, options } = calls.setDocs[0];
  assert.deepEqual(ref, { path: 'sessions', id: 'S'.repeat(20) });
  assert.equal(options, undefined, 'create is a plain set, not a merge');
  assert.deepEqual(Object.keys(data).sort(), [
    'expireAt', 'infoOpens', 'infoSelects', 'instagramClicks', 'lastScreen', 'lessonCompleted', 'lessonRestarts',
    'maxLessonStep', 'maxSurveyStep', 'schemaVersion', 'sid', 'startedAt', 'submitAttempts', 'submitFailures',
    'submitted', 'updatedAt',
  ]);
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.sid, 'S'.repeat(20));
  assert.equal(data.startedAt, SERVER_TS);
  assert.equal(data.updatedAt, SERVER_TS);
  const days = (data.expireAt.ms - before) / 86_400_000;
  assert.ok(days > 364.99 && days < 365.01, `expireAt ~365d ahead, got ${days}`);
});

test('writeSession update: merge without startedAt/expireAt, fresh updatedAt', async () => {
  await writeSession('S'.repeat(20), emptyStats(), { create: false });
  const { data, options } = calls.setDocs[0];
  assert.deepEqual(options, { merge: true });
  assert.equal('startedAt' in data, false);
  assert.equal('expireAt' in data, false);
  assert.equal(data.updatedAt, SERVER_TS);
  assert.equal(Object.keys(data).length, 14);
});
