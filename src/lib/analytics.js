// Anonymous usage analytics: one sessions/{sid} doc per browser tab, no personal data, no quiz answers.
// Tracking must never block or break the UI, so every call is fire-and-forget and swallows errors.
//
// Off unless Firebase is configured and this is a production build:
// - `vite dev` stays off (set VITE_ANALYTICS=on to try it against the real project on purpose);
// - `--mode e2e` stays off unless a fixture sets `window.__e2e.analytics = true` (writes then go to the SDK mock);
// - VITE_ANALYTICS=off turns it off in any build.
import { firebaseConfig } from './firebase-config.js';
import { createTracker } from './tracker.js';

const STORE_KEY = 'champus:analytics';

function enabled() {
  if (!firebaseConfig || typeof window === 'undefined') return false;
  const env = import.meta.env;
  if (env.MODE === 'e2e') return window.__e2e?.analytics === true;
  if (env.VITE_ANALYTICS === 'off') return false;
  return env.PROD || env.VITE_ANALYTICS === 'on';
}

function start() {
  const tracker = createTracker({
    load() {
      try { return JSON.parse(sessionStorage.getItem(STORE_KEY)); } catch { return null; }
    },
    save(state) {
      try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* private mode: memory only */ }
    },
    async write(sid, stats, opts) {
      const { writeSession } = await import('./firebase.js');
      return writeSession(sid, stats, opts);
    },
  });
  // Best effort: push what's pending when the tab is hidden or closed.
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') tracker.flush(); });
  addEventListener('pagehide', () => tracker.flush());
  return tracker;
}

let tracker = null;
try {
  if (enabled()) tracker = start();
} catch { /* analytics must never stop the app from loading */ }

const send = event => {
  try { tracker?.record(event); } catch { /* ignore */ }
};

export const track = {
  /** 's0'…'s10' (s3-1 is 's3_1') or 'l1'…'l11'. */
  screen: id => send({ type: 'screen', id }),
  submitAttempt: () => send({ type: 'submitAttempt' }),
  submitFailure: () => send({ type: 'submitFailure' }),
  submitted: () => send({ type: 'submitted' }),
  lessonRestart: () => send({ type: 'lessonRestart' }),
  /** 'done' (S10) or 'lessonEnd'. */
  instagram: where => send({ type: 'instagram', where }),
};
