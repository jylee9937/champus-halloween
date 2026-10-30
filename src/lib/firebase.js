// Firestore + Auth client. The booth page loads this module lazily (only when submitting);
// Auth is imported on demand so it never ships to booth visitors.
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, addDoc, getDocs, getDoc, doc, query, where, orderBy, writeBatch, serverTimestamp, Timestamp,
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

/** Deletes responses whose expireAt has passed (admins only). Resolves with how many were deleted. */
export async function purgeExpired(now = Date.now()) {
  const cutoff = Timestamp.fromMillis(now - PURGE_MARGIN_MS);
  const snap = await getDocs(query(collection(db(), 'responses'), where('expireAt', '<', cutoff)));
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db());
    for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) batch.delete(d.ref);
    await batch.commit();
  }
  return snap.docs.length;
}

/** All responses, newest first. `createdAt`/`expireAt` come back as Dates. */
export async function fetchResponses() {
  const snap = await getDocs(query(collection(db(), 'responses'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => {
    const v = d.data();
    return { id: d.id, ...v, createdAt: v.createdAt?.toDate?.() ?? null, expireAt: v.expireAt?.toDate?.() ?? null };
  });
}
