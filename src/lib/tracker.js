// Session analytics core: a pure reducer over anonymous counters plus a write scheduler.
// No DOM and no Firebase here, so it runs under `node --test`; analytics.js wires the real I/O.
import { ACTIVITIES } from '../survey/data.js';

// Survey order for maxSurveyStep: s0=0 … s10=11. The indices are part of the sessions contract.
export const SURVEY_STEPS = ['s0', 's1', 's2', 's3', 's3_1', 's4', 's5', 's6', 's7', 's8', 's9', 's10'];
// S5 (privacy notice/consent) was removed from the survey. Its index stays so s6=7 … s10=11 keep their meaning,
// but it is never recorded: S4 (5) goes straight to S6 (7).
export const RETIRED_STEPS = new Set(['s5']);
export const LESSON_STEPS = 11;
// The 10 real activities (the ones with an ⓘ sheet).
export const INFO_IDS = ACTIVITIES.filter(a => !a.exclusive && !a.needsText).map(a => a.id);
const INSTAGRAM_SPOTS = ['done', 'lessonEnd'];

const counts = keys => Object.fromEntries(keys.map(k => [k, 0]));

/** The client-owned fields of sessions/{sid}. Maps always carry every key so rules can compare them. */
export function emptyStats() {
  return {
    lastScreen: 's0', maxSurveyStep: 0, maxLessonStep: 0, lessonCompleted: false, lessonRestarts: 0,
    submitAttempts: 0, submitFailures: 0, submitted: false,
    infoOpens: counts(INFO_IDS), infoSelects: counts(INFO_IDS), instagramClicks: counts(INSTAGRAM_SPOTS),
  };
}

const lessonIndex = id => {
  const m = /^l(\d{1,2})$/.exec(id);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= LESSON_STEPS ? n : 0;
};
const bump = (map, key) => (key in map ? { ...map, [key]: map[key] + 1 } : map);

/** Applies one event. Returns the same object when nothing changed; values never decrease. */
export function applyEvent(s, e) {
  switch (e?.type) {
    case 'screen': {
      if (RETIRED_STEPS.has(e.id)) return s;
      const survey = SURVEY_STEPS.indexOf(e.id);
      const lesson = lessonIndex(e.id);
      if (survey < 0 && !lesson) return s;
      const next = {
        ...s,
        lastScreen: e.id,
        maxSurveyStep: Math.max(s.maxSurveyStep, survey),
        maxLessonStep: Math.max(s.maxLessonStep, lesson),
        lessonCompleted: s.lessonCompleted || lesson === LESSON_STEPS,
      };
      const changed = ['lastScreen', 'maxSurveyStep', 'maxLessonStep', 'lessonCompleted'].some(k => next[k] !== s[k]);
      return changed ? next : s;
    }
    case 'infoOpen': return INFO_IDS.includes(e.id) ? { ...s, infoOpens: bump(s.infoOpens, e.id) } : s;
    case 'infoSelect': return INFO_IDS.includes(e.id) ? { ...s, infoSelects: bump(s.infoSelects, e.id) } : s;
    case 'instagram': return INSTAGRAM_SPOTS.includes(e.where) ? { ...s, instagramClicks: bump(s.instagramClicks, e.where) } : s;
    case 'submitAttempt': return { ...s, submitAttempts: s.submitAttempts + 1 };
    case 'submitFailure': return { ...s, submitFailures: s.submitFailures + 1 };
    case 'submitted': return s.submitted ? s : { ...s, submitted: true };
    case 'lessonRestart': return { ...s, lessonRestarts: s.lessonRestarts + 1 };
    default: return s;
  }
}

const isCount = v => Number.isInteger(v) && v >= 0;
const restoreMap = (base, saved) =>
  Object.fromEntries(Object.keys(base).map(k => [k, isCount(saved?.[k]) ? saved[k] : 0]));

/** Rebuilds a stored snapshot field by field, so a stale or tampered value can never reach Firestore. */
export function restoreState(saved) {
  if (!saved || typeof saved !== 'object' || !/^[A-Za-z0-9]{20}$/.test(saved.sid)) return null;
  const base = emptyStats(), v = saved.stats ?? {};
  const stats = {
    lastScreen: (SURVEY_STEPS.includes(v.lastScreen) && !RETIRED_STEPS.has(v.lastScreen)) || lessonIndex(v.lastScreen)
      ? v.lastScreen : base.lastScreen,
    maxSurveyStep: isCount(v.maxSurveyStep) ? Math.min(v.maxSurveyStep, SURVEY_STEPS.length - 1) : 0,
    maxLessonStep: isCount(v.maxLessonStep) ? Math.min(v.maxLessonStep, LESSON_STEPS) : 0,
    lessonCompleted: v.lessonCompleted === true,
    lessonRestarts: isCount(v.lessonRestarts) ? v.lessonRestarts : 0,
    submitAttempts: isCount(v.submitAttempts) ? v.submitAttempts : 0,
    submitFailures: isCount(v.submitFailures) ? v.submitFailures : 0,
    submitted: v.submitted === true,
    infoOpens: restoreMap(base.infoOpens, v.infoOpens),
    infoSelects: restoreMap(base.infoSelects, v.infoSelects),
    instagramClicks: restoreMap(base.instagramClicks, v.instagramClicks),
  };
  return { sid: saved.sid, created: saved.created === true, stats };
}

const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * The Firestore document for sessions/{sid} (the sid is the doc ID, not a field), matching firestore.rules:
 * create = all 15 fields; update = the same minus startedAt/expireAt, sent with merge.
 * The SDK sentinels are passed in so the rules tests can build the exact same payload against the emulator.
 */
export function sessionDoc(stats, { create, now, serverTimestamp, timestampFromMillis }) {
  const data = { schemaVersion: 1, ...stats, updatedAt: serverTimestamp() };
  if (!create) return data;
  return { ...data, startedAt: serverTimestamp(), expireAt: timestampFromMillis(now + RETENTION_MS) };
}

const SID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** 20 random [A-Za-z0-9] characters (rejection sampling keeps them uniform). */
export function newSid(random = n => crypto.getRandomValues(new Uint8Array(n))) {
  let sid = '';
  while (sid.length < 20) for (const b of random(32)) if (b < 248 && sid.length < 20) sid += SID_CHARS[b % 62];
  return sid;
}

/**
 * Keeps one session's stats in memory, persists them via `save`, and writes them with `write(sid, stats, {create})`.
 * Writes are debounced, serialized (one in flight at most) and never throw to the caller.
 * A permission-denied/not-found reply flips create↔update for the next try (the doc existed, or didn't).
 */
export function createTracker({ load, save, write, makeSid = newSid, debounceMs = 800, retryLimit = 3, timers = globalThis }) {
  const st = restoreState(load()) ?? { sid: makeSid(), created: false, stats: emptyStats() };
  let dirty = false, timer = null, inFlight = null, failures = 0;

  const persist = () => save({ sid: st.sid, created: st.created, stats: st.stats });

  function schedule(ms = debounceMs) {
    timers.clearTimeout(timer);
    timer = timers.setTimeout(flush, ms);
  }

  function record(event) {
    const next = applyEvent(st.stats, event);
    // The very first event creates the doc even when it changes nothing (a fresh session's s0 view).
    if (next === st.stats && (st.created || dirty)) return;
    st.stats = next;
    dirty = true;
    persist();
    schedule();
  }

  /** Sends pending changes now. Resolves when that write settles; never rejects. */
  function flush() {
    timers.clearTimeout(timer);
    timer = null;
    if (!dirty || inFlight || failures >= retryLimit) return inFlight ?? Promise.resolve();
    dirty = false;
    const create = !st.created, stats = st.stats;
    inFlight = Promise.resolve()
      .then(() => write(st.sid, stats, { create }))
      .then(() => {
        failures = 0;
        if (create) { st.created = true; persist(); }
      }, err => {
        dirty = true;
        failures++;
        if (err?.code === 'permission-denied' || err?.code === 'not-found') { st.created = create; persist(); }
      })
      .finally(() => {
        inFlight = null;
        if (dirty && failures < retryLimit) schedule(debounceMs * 2 ** failures);
      });
    return inFlight;
  }

  return { record, flush, state: () => ({ sid: st.sid, created: st.created, stats: st.stats }) };
}
