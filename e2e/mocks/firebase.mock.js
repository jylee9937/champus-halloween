// SDK I/O only: src/lib/firebase.js still owns validation, timestamps, timeout and purge queries.
// The fixture initializes this before any app module runs. Fail closed outside the test harness.
const state = window.__e2e;
if (!state) throw new Error('Firebase E2E mock requires the Playwright fixture');

const copy = value => structuredClone(value);
const call = (op, detail = {}) => state.calls.push({ op, ...detail });
let authCallback;

export class Timestamp {
  constructor(ms) { this.ms = ms; }
  static fromMillis(ms) { return new Timestamp(ms); }
  toDate() { return new Date(this.ms); }
  toMillis() { return this.ms; }
}

export const initializeApp = () => { call('initializeApp'); return {}; };
export const getFirestore = () => ({});
export const getAuth = () => ({});
export const serverTimestamp = () => ({ __type: 'serverTimestamp' });
export const collection = (_db, path) => ({ path });
export const doc = (_db, path, id) => ({ path, id });
export const where = (field, op, value) => ({ field, op, value });
export const orderBy = (field, direction) => ({ field, direction });
export const query = (ref, ...constraints) => ({ ...ref, constraints });

export async function addDoc(ref, data) {
  if (ref.path !== 'responses') throw new Error('Unexpected collection: ' + ref.path);
  const attempt = { collection: ref.path, data: copy(data), at: Date.now() };
  state.attempts.push(attempt);
  call('addDoc');
  // Outcome belongs to this attempt, so changing the next outcome cannot alter a pending write.
  const { outcome, delayMs } = state.submit;
  if (outcome === 'pending') await new Promise(resolve => { state.releaseSubmit = resolve; });
  if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
  if (outcome === 'failure') throw new Error('E2E simulated network failure');
  state.writes.push(attempt);
  return { id: 'response-' + state.writes.length };
}

export class GoogleAuthProvider {
  setCustomParameters(params) { state.authParameters = params; }
}

export function onAuthStateChanged(_auth, callback) {
  authCallback = callback;
  call('watchAuth');
  queueMicrotask(() => callback(state.user));
  return () => { authCallback = undefined; };
}

export async function signInWithPopup() {
  call('signIn');
  if (state.signInError) throw Object.assign(new Error('Mock sign-in error'), { code: state.signInError });
  state.user = { email: state.signInEmail };
  await authCallback(state.user);
  return { user: state.user };
}

export async function signOut() {
  call('signOut');
  state.user = null;
  await authCallback(null);
}

export async function getDoc(ref) {
  if (ref.path !== 'admins') throw new Error('Unexpected document path');
  call('isAdmin', { email: ref.id });
  return { exists: () => state.adminEmails.includes(ref.id) };
}

export async function getDocs(ref) {
  if (ref.path !== 'responses') throw new Error('Unexpected collection');
  const filter = ref.constraints.find(c => c.op);
  call(filter ? 'purgeQuery' : 'fetchResponses', {
    constraints: ref.constraints.map(c => ({ ...c, value: c.value?.toMillis?.() ?? c.value })),
  });
  if (!filter && state.fetchError) throw new Error('Mock fetch failure');
  let rows = [...state.responses];
  if (filter) {
    if (filter.field !== 'expireAt' || filter.op !== '<') throw new Error('Unexpected purge query');
    rows = rows.filter(r => r.expireAt != null && new Date(r.expireAt).getTime() < filter.value.toMillis());
  }
  const order = ref.constraints.find(c => c.direction);
  if (order) {
    if (order.field !== 'createdAt' || order.direction !== 'desc') throw new Error('Unexpected response ordering');
    rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  return { docs: rows.map(row => ({
    id: row.id,
    ref: { id: row.id },
    data: () => {
      const { id, ...data } = copy(row);
      for (const key of ['createdAt', 'expireAt']) {
        data[key] = data[key] == null ? null : Timestamp.fromMillis(new Date(data[key]).getTime());
      }
      return data;
    },
  })) };
}

export function writeBatch() {
  const ids = [];
  return {
    delete: ref => ids.push(ref.id),
    async commit() {
      call('purgeCommit', { ids });
      if (state.purgeError) throw new Error('Mock purge failure');
      state.responses = state.responses.filter(r => !ids.includes(r.id));
      state.purgedIds.push(...ids);
    },
  };
}
