// Firestore + Auth client. The booth page loads this module lazily (first analytics write or submit);
// Auth is imported on demand so it never ships to booth visitors.
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, addDoc, setDoc, getDocs, getDoc, doc, query, where, orderBy, writeBatch, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';
import { payloadErrors } from './validate.js';

export class NotConfiguredError extends Error {
  constructor() {
    super('Firebase is not configured: set firebaseConfig in src/lib/firebase-config.js');
    this.name = 'NotConfiguredError';
  }
}

const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
// Rules allow deleting only when expireAt < request.time (server clock), and a batch fails as a whole,
// so leave a margin for an admin laptop whose clock runs ahead. Anything skipped goes on the next load.
const PURGE_MARGIN_MS = 10 * 60 * 1000;
const BATCH_LIMIT = 500;
// addDoc never rejects while offline (the write just waits in the queue), so give up after a while and let the user retry.
const SUBMIT_TIMEOUT_MS = 15000;

let app;
function getApp() {
  if (!firebaseConfig) throw new NotConfiguredError();
  app ??= initializeApp(firebaseConfig);
  return app;
}
const db = () => getFirestore(getApp());

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Writes one survey response and resolves with the new document ID. */
export async function submitResponse(payload) {
  const errors = payloadErrors(payload);
  if (errors.length) throw new Error('Invalid payload: ' + errors.join(', '));
  const data = {
    schemaVersion: 1,
    ...payload,
    createdAt: serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + RETENTION_MS),
  };
  const ref = await withTimeout(addDoc(collection(db(), 'responses'), data), SUBMIT_TIMEOUT_MS);
  return ref.id;
}

/**
 * Writes this tab's anonymous analytics doc. The first write creates it with every field; later writes merge
 * everything except startedAt/expireAt, which rules keep fixed. `stats` comes from tracker.js (absolute values).
 */
export async function writeSession(sid, stats, { create }) {
  const ref = doc(db(), 'sessions', sid);
  const data = { sid, schemaVersion: 1, ...stats, updatedAt: serverTimestamp() };
  if (!create) return setDoc(ref, data, { merge: true });
  return setDoc(ref, { ...data, startedAt: serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + RETENTION_MS) });
}

async function auth() {
  const mod = await import('firebase/auth');
  return { mod, auth: mod.getAuth(getApp()) };
}

/** Calls `cb(user|null)` on every sign-in change. Returns an unsubscribe function. */
export async function watchAuth(cb) {
  const { mod, auth: a } = await auth();
  return mod.onAuthStateChanged(a, cb);
}

export async function signInWithGoogle() {
  const { mod, auth: a } = await auth();
  const provider = new mod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await mod.signInWithPopup(a, provider);
  return cred.user;
}

export async function signOut() {
  const { mod, auth: a } = await auth();
  await mod.signOut(a);
}

/** True when `admins/{email}` exists. Rules let a signed-in user read only their own admins doc. */
export async function isAdmin(email) {
  if (!email) return false;
  try {
    const snap = await getDoc(doc(db(), 'admins', email));
    return snap.exists();
  } catch (err) {
    if (err?.code === 'permission-denied') return false;
    throw err;
  }
}

async function purgeCollection(name, cutoff) {
  const snap = await getDocs(query(collection(db(), name), where('expireAt', '<', cutoff)));
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db());
    for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) batch.delete(d.ref);
    await batch.commit();
  }
  return snap.docs.length;
}

/**
 * Deletes responses and analytics sessions whose expireAt has passed (admins only).
 * Resolves with how many of each were deleted. A failed sessions purge is logged and counted as 0,
 * so it never hides the responses result.
 */
export async function purgeExpired(now = Date.now()) {
  const cutoff = Timestamp.fromMillis(now - PURGE_MARGIN_MS);
  const responses = await purgeCollection('responses', cutoff);
  let sessions = 0;
  try {
    sessions = await purgeCollection('sessions', cutoff);
  } catch (err) {
    console.error('[admin] sessions purge failed', err);
  }
  return { responses, sessions };
}

const toDate = v => v?.toDate?.() ?? null;

/** All responses, newest first. `createdAt`/`expireAt` come back as Dates. */
export async function fetchResponses() {
  const snap = await getDocs(query(collection(db(), 'responses'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => {
    const v = d.data();
    return { id: d.id, ...v, createdAt: toDate(v.createdAt), expireAt: toDate(v.expireAt) };
  });
}

/** All analytics sessions (one read per doc). Timestamps come back as Dates. */
export async function fetchSessions() {
  const snap = await getDocs(collection(db(), 'sessions'));
  return snap.docs.map(d => {
    const v = d.data();
    return { ...v, id: d.id, startedAt: toDate(v.startedAt), updatedAt: toDate(v.updatedAt), expireAt: toDate(v.expireAt) };
  });
}
