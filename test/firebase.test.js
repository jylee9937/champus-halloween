import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// In-memory stand-in for the Firestore SDK: records the query and every batch commit.
let docs = [];
let calls;
let failCommit = false;
const stub = () => ({});

mock.module('firebase/app', { namedExports: { initializeApp: stub } });
mock.module('firebase/firestore', {
  namedExports: {
    getFirestore: () => 'db',
    collection: (db, name) => ({ collection: name }),
    where: (field, op, value) => ({ field, op, value }),
    query: (col, ...constraints) => ({ ...col, constraints }),
    getDocs: async q => { calls.query = q; return { docs }; },
    writeBatch: () => {
      const refs = [];
      return {
        delete: ref => refs.push(ref),
        commit: async () => {
          if (failCommit) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
          calls.batches.push(refs);
        },
      };
    },
    Timestamp: { fromMillis: ms => ({ ms }) },
    addDoc: stub, getDoc: stub, doc: stub, orderBy: stub, serverTimestamp: stub,
  },
});

const { purgeExpired } = await import('../src/lib/firebase.js');

const NOW = Date.parse('2027-11-01T00:00:00Z');
const expired = n => Array.from({ length: n }, (_, i) => ({ ref: `responses/${i}` }));

beforeEach(() => {
  calls = { query: null, batches: [] };
  failCommit = false;
});

test('queries only responses whose expireAt is past (with a clock-skew margin)', async () => {
  docs = expired(1);
  await purgeExpired(NOW);
  assert.equal(calls.query.collection, 'responses');
  assert.deepEqual(calls.query.constraints, [{ field: 'expireAt', op: '<', value: { ms: NOW - 10 * 60 * 1000 } }]);
});

test('deletes every expired doc in batches of at most 500 and returns the count', async () => {
  docs = expired(1203);
  assert.equal(await purgeExpired(NOW), 1203);
  assert.deepEqual(calls.batches.map(b => b.length), [500, 500, 203]);
  assert.deepEqual(calls.batches.flat(), docs.map(d => d.ref));
});

test('nothing expired: no batch is committed', async () => {
  docs = [];
  assert.equal(await purgeExpired(NOW), 0);
  assert.equal(calls.batches.length, 0);
});

test('a rejected batch surfaces to the caller', async () => {
  docs = expired(3);
  failCommit = true;
  await assert.rejects(purgeExpired(NOW), { code: 'permission-denied' });
});
