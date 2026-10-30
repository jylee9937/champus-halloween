// Firestore security rules tests. Run from this folder: `npm install && npm test`
// (starts the Firestore emulator for the offline demo project `demo-champus`).
import { readFileSync } from "node:fs";
import { test, after } from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, writeBatch, serverTimestamp, Timestamp, increment, deleteField,
  FieldPath,
} from "firebase/firestore";

const DAY = 24 * 60 * 60 * 1000;
const ADMIN = "admin@example.com";

const env = await initializeTestEnvironment({
  projectId: "demo-champus",
  firestore: {
    rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"),
    host: "127.0.0.1",
    port: 8080,
  },
});
after(() => env.cleanup());

const anon = env.unauthenticatedContext().firestore();
const user = env.authenticatedContext("u1", { email: "user@example.com", email_verified: true }).firestore();
const admin = env.authenticatedContext("a1", { email: ADMIN, email_verified: true }).firestore();
const adminUnverified = env.authenticatedContext("a2", { email: ADMIN, email_verified: false }).firestore();

const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
await seed(async (db) => {
  await setDoc(doc(db, "admins", ADMIN), { role: "admin" });
});

const allow = (name, fn) => test(`allow: ${name}`, () => assertSucceeds(fn()));
const deny = (name, fn) => test(`deny: ${name}`, () => assertFails(fn()));

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const newId = (n = 20) => Array.from({ length: n }, () => ALNUM[Math.floor(Math.random() * ALNUM.length)]).join("");

/* ====================================================================== */
/* responses                                                               */
/* ====================================================================== */

const response = (over = {}) => {
  const d = {
    schemaVersion: 1,
    activities: ["futsal", "book-club"],
    activityOther: null,
    days: ["mon", "fri"],
    participation: "regular",
    seekingFaithCommunity: false,
    comment: "",
    name: "테스트",
    department: "소프트웨어학과",
    studentId: "202312345",
    phone: "01012345678",
    consent: true,
    createdAt: serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + 365 * DAY),
  };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) delete d[k]; else d[k] = v;
  }
  return d;
};
const createResponse = (db, data) => () => addDoc(collection(db, "responses"), data);

await seed(async (db) => {
  await setDoc(doc(db, "responses", "seed"), { name: "seed" });
  const past = Timestamp.fromMillis(Date.now() - DAY);
  for (const id of ["exp1", "exp2", "exp3", "exp4", "exp5"]) {
    await setDoc(doc(db, "responses", id), { name: "old", expireAt: past });
  }
  await setDoc(doc(db, "responses", "fresh"), { name: "new", expireAt: Timestamp.fromMillis(Date.now() + 365 * DAY) });
  await setDoc(doc(db, "responses", "badexp"), { name: "bad", expireAt: "2000-01-01" });
});

// valid creates
allow("response: anon create", createResponse(anon, response()));
allow("response: signed-in create", createResponse(user, response()));
allow("response: other with text", createResponse(anon, response({ activities: ["other"], activityOther: "보드게임" })));
allow("response: 100-char other", createResponse(anon, response({ activities: ["other", "futsal"], activityOther: "가".repeat(100) })));
allow("response: empty days", createResponse(anon, response({ days: [] })));
allow("response: all 8 days", createResponse(anon, response({ days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun", "flexible"] })));
allow("response: all 12 activities", createResponse(anon, response({ activities: ["union-worship", "small-group", "book-club", "vibe-coding", "futsal", "career-mentoring", "edu-volunteer", "champs-study", "happy-bridge", "perfume-workshop", "undecided", "other"], activityOther: "x" })));
allow("response: 1000-char comment", createResponse(anon, response({ comment: "a".repeat(1000) })));
allow("response: 30-char name", createResponse(anon, response({ name: "가".repeat(30) })));
allow("response: 50-char department", createResponse(anon, response({ department: "a".repeat(50) })));
allow("response: 2-digit studentId", createResponse(anon, response({ studentId: "00" })));
allow("response: 10-digit phone", createResponse(anon, response({ phone: "0101234567" })));
allow("response: expireAt 364.5d", createResponse(anon, response({ expireAt: Timestamp.fromMillis(Date.now() + 364.5 * DAY) })));
allow("response: info-only + seeking", createResponse(anon, response({ participation: "info-only", seekingFaithCommunity: true })));
allow("response: create with custom id", () => setDoc(doc(anon, "responses", "custom1"), response()));

// key set, types, values
deny("response: missing field", createResponse(anon, response({ comment: undefined })));
deny("response: missing activityOther", createResponse(anon, response({ activityOther: undefined })));
deny("response: extra field", createResponse(anon, response({ isAdmin: true })));
deny("response: schemaVersion 2", createResponse(anon, response({ schemaVersion: 2 })));
deny("response: schemaVersion string", createResponse(anon, response({ schemaVersion: "1" })));
deny("response: schemaVersion 1.5", createResponse(anon, response({ schemaVersion: 1.5 })));
deny("response: activities empty", createResponse(anon, response({ activities: [] })));
deny("response: activities bad value", createResponse(anon, response({ activities: ["hacking"] })));
deny("response: activities duplicate", createResponse(anon, response({ activities: ["futsal", "futsal"] })));
deny("response: activities 13 items", createResponse(anon, response({ activities: Array(13).fill("futsal") })));
deny("response: activities not a list", createResponse(anon, response({ activities: "futsal" })));
deny("response: other without text", createResponse(anon, response({ activities: ["other"], activityOther: null })));
deny("response: other with empty text", createResponse(anon, response({ activities: ["other"], activityOther: "" })));
deny("response: other text 101 chars", createResponse(anon, response({ activities: ["other"], activityOther: "a".repeat(101) })));
deny("response: other text without other", createResponse(anon, response({ activities: ["futsal"], activityOther: "x" })));
deny("response: other text not a string", createResponse(anon, response({ activities: ["other"], activityOther: 5 })));
deny("response: days bad value", createResponse(anon, response({ days: ["holiday"] })));
deny("response: days duplicate", createResponse(anon, response({ days: ["mon", "mon"] })));
deny("response: days 9 items", createResponse(anon, response({ days: Array(9).fill("mon") })));
deny("response: days null", createResponse(anon, response({ days: null })));
deny("response: participation bad", createResponse(anon, response({ participation: "always" })));
deny("response: seeking not bool", createResponse(anon, response({ seekingFaithCommunity: "yes" })));
deny("response: comment 1001 chars", createResponse(anon, response({ comment: "a".repeat(1001) })));
deny("response: comment null", createResponse(anon, response({ comment: null })));
deny("response: name empty", createResponse(anon, response({ name: "" })));
deny("response: name 31 chars", createResponse(anon, response({ name: "가".repeat(31) })));
deny("response: department empty", createResponse(anon, response({ department: "" })));
deny("response: department 51 chars", createResponse(anon, response({ department: "a".repeat(51) })));
deny("response: studentId 1 digit", createResponse(anon, response({ studentId: "1" })));
deny("response: studentId 10 digits", createResponse(anon, response({ studentId: "1234567890" })));
deny("response: studentId letters", createResponse(anon, response({ studentId: "12a45" })));
deny("response: studentId number type", createResponse(anon, response({ studentId: 202312345 })));
deny("response: phone 9 digits", createResponse(anon, response({ phone: "010123456" })));
deny("response: phone 12 digits", createResponse(anon, response({ phone: "010123456789" })));
deny("response: phone with dashes", createResponse(anon, response({ phone: "010-1234-5678" })));
deny("response: phone 02 prefix", createResponse(anon, response({ phone: "02012345678" })));
deny("response: phone trailing newline", createResponse(anon, response({ phone: "01012345678\n" })));
deny("response: consent false", createResponse(anon, response({ consent: false })));
deny("response: consent string", createResponse(anon, response({ consent: "true" })));
deny("response: createdAt client time", createResponse(anon, response({ createdAt: Timestamp.now() })));
deny("response: expireAt 300d", createResponse(anon, response({ expireAt: Timestamp.fromMillis(Date.now() + 300 * DAY) })));
deny("response: expireAt 363d", createResponse(anon, response({ expireAt: Timestamp.fromMillis(Date.now() + 363 * DAY) })));
deny("response: expireAt 367d", createResponse(anon, response({ expireAt: Timestamp.fromMillis(Date.now() + 367 * DAY) })));
deny("response: expireAt 10y", createResponse(anon, response({ expireAt: Timestamp.fromMillis(Date.now() + 3650 * DAY) })));
deny("response: expireAt string", createResponse(anon, response({ expireAt: "2027-10-30" })));
deny("response: expireAt serverTimestamp", createResponse(anon, response({ expireAt: serverTimestamp() })));

// read / update / delete
deny("response: anon get", () => getDoc(doc(anon, "responses", "seed")));
deny("response: anon list", () => getDocs(collection(anon, "responses")));
deny("response: user get", () => getDoc(doc(user, "responses", "seed")));
deny("response: user list", () => getDocs(collection(user, "responses")));
deny("response: unverified admin list", () => getDocs(collection(adminUnverified, "responses")));
allow("response: admin get", () => getDoc(doc(admin, "responses", "seed")));
allow("response: admin list", () => getDocs(collection(admin, "responses")));
deny("response: anon update", () => updateDoc(doc(anon, "responses", "seed"), { name: "x" }));
deny("response: admin update", () => updateDoc(doc(admin, "responses", "seed"), { name: "x" }));
deny("response: anon delete", () => deleteDoc(doc(anon, "responses", "seed")));
deny("response: admin delete without expireAt", () => deleteDoc(doc(admin, "responses", "seed")));
deny("response: anon overwrite existing", () => setDoc(doc(anon, "responses", "seed"), response()));

// expired purge
allow("response: admin query expired", () => getDocs(query(collection(admin, "responses"), where("expireAt", "<", Timestamp.now()))));
deny("response: anon query expired", () => getDocs(query(collection(anon, "responses"), where("expireAt", "<", Timestamp.now()))));
deny("response: anon delete expired", () => deleteDoc(doc(anon, "responses", "exp1")));
deny("response: user delete expired", () => deleteDoc(doc(user, "responses", "exp1")));
deny("response: unverified admin delete expired", () => deleteDoc(doc(adminUnverified, "responses", "exp1")));
deny("response: admin update expired", () => updateDoc(doc(admin, "responses", "exp1"), { expireAt: Timestamp.now() }));
deny("response: admin delete not expired", () => deleteDoc(doc(admin, "responses", "fresh")));
deny("response: admin delete non-timestamp expireAt", () => deleteDoc(doc(admin, "responses", "badexp")));
allow("response: admin delete expired", () => deleteDoc(doc(admin, "responses", "exp1")));
allow("response: admin batch purge expired", async () => {
  const b = writeBatch(admin);
  for (const id of ["exp2", "exp3", "exp4"]) b.delete(doc(admin, "responses", id));
  await b.commit();
});
deny("response: admin batch with one unexpired", async () => {
  const b = writeBatch(admin);
  b.delete(doc(admin, "responses", "exp5"));
  b.delete(doc(admin, "responses", "fresh"));
  await b.commit();
});

/* ====================================================================== */
/* sessions                                                                */
/* ====================================================================== */

const ACTIVITY_IDS = [
  "union-worship", "small-group", "book-club", "vibe-coding", "futsal",
  "career-mentoring", "edu-volunteer", "champs-study", "happy-bridge", "perfume-workshop",
];
// Maps as the client sends them: every key present, zeros included.
const activityMap = (vals = {}) => Object.fromEntries(ACTIVITY_IDS.map((k) => [k, vals[k] ?? 0]));
const igMap = (vals = {}) => ({ done: vals.done ?? 0, lessonEnd: vals.lessonEnd ?? 0 });

// Client-side session state (what the web app keeps in memory).
const freshState = () => ({
  schemaVersion: 1,
  lastScreen: "s0",
  maxSurveyStep: 0,
  maxLessonStep: 0,
  lessonCompleted: false,
  lessonRestarts: 0,
  submitAttempts: 0,
  submitFailures: 0,
  submitted: false,
  infoOpens: activityMap(),
  infoSelects: activityMap(),
  instagramClicks: igMap(),
});
const withOver = (d, over) => {
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) delete d[k]; else d[k] = v;
  }
  return d;
};

// Web-dev write pattern 1: create = one setDoc (no merge) with all 15 fields.
const createPayload = (state = freshState(), over = {}) => withOver({
  ...state,
  startedAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  expireAt: Timestamp.fromMillis(Date.now() + 365 * DAY),
}, over);
const createSession = (db, over = {}, id = newId(), state = freshState()) =>
  () => setDoc(doc(db, "sessions", id), createPayload(state, over));

// Web-dev write pattern 2: update = setDoc(merge) with everything except
// startedAt/expireAt, absolute values, updatedAt = serverTimestamp().
const mergePayload = (state, over = {}) => withOver({ ...state, updatedAt: serverTimestamp() }, over);
const mergeUpdate = (db, id, state, over = {}) => setDoc(doc(db, "sessions", id), mergePayload(state, over), { merge: true });

// A session that has already progressed (seeded with rules disabled).
const progressed = () => ({
  ...freshState(),
  lastScreen: "s5",
  maxSurveyStep: 6,
  maxLessonStep: 3,
  lessonCompleted: true,
  lessonRestarts: 2,
  submitAttempts: 2,
  submitFailures: 1,
  submitted: true,
  infoOpens: activityMap({ futsal: 3, "book-club": 1 }),
  infoSelects: activityMap({ futsal: 2 }),
  instagramClicks: igMap({ done: 1, lessonEnd: 1 }),
});
const progressedDoc = () => ({
  ...progressed(),
  startedAt: Timestamp.fromMillis(Date.now() - 3600 * 1000),
  updatedAt: Timestamp.fromMillis(Date.now() - 60 * 1000),
  expireAt: Timestamp.fromMillis(Date.now() + 364.9 * DAY),
});
const seedSession = async (data = progressedDoc()) => {
  const id = newId();
  await seed((db) => setDoc(doc(db, "sessions", id), data));
  return id;
};
// Merge-update a freshly seeded progressed session (anon by default).
// `next` receives the progressed state and returns the state to send.
const step = (next, { over = {}, db = anon } = {}) => async () => {
  const id = await seedSession();
  return mergeUpdate(db, id, next(progressed()), over);
};
// Raw updateDoc on a seeded progressed session (for shapes the app never sends).
const rawUpdate = (changes, { stamp = true } = {}) => async () => {
  const id = await seedSession();
  return updateDoc(doc(anon, "sessions", id), stamp ? { updatedAt: serverTimestamp(), ...changes } : changes);
};

// --- create: valid
allow("session: create (web-dev pattern, full zero maps)", createSession(anon));
allow("session: create by signed-in user", createSession(user));
allow("session: create with empty maps (key subset)", createSession(anon, { infoOpens: {}, infoSelects: {}, instagramClicks: {} }));
allow("session: create with partial map keys", createSession(anon, { infoOpens: { futsal: 0 }, instagramClicks: { done: 0 } }));
allow("session: create mid-flow (returning visitor on s10)", createSession(anon, { lastScreen: "s10", maxSurveyStep: 11 }));
allow("session: create on lesson screen l11", createSession(anon, { lastScreen: "l11", maxLessonStep: 11 }));
allow("session: create on s3_1", createSession(anon, { lastScreen: "s3_1", maxSurveyStep: 4 }));
allow("session: create carrying progress (update->create fallback)", createSession(anon, {}, newId(), progressed()));
allow("session: create expireAt 364.5d", createSession(anon, { expireAt: Timestamp.fromMillis(Date.now() + 364.5 * DAY) }));
allow("session: create with Firestore auto-id", () => setDoc(doc(collection(anon, "sessions")), createPayload()));

// --- create: doc id
deny("session: id 19 chars", createSession(anon, {}, newId(19)));
deny("session: id 21 chars", createSession(anon, {}, newId(21)));
deny("session: id with dash", createSession(anon, {}, newId(19) + "-"));
deny("session: id with underscore", createSession(anon, {}, newId(19) + "_"));

// --- create: key set, types, ranges
deny("session: create missing key", createSession(anon, { instagramClicks: undefined }));
deny("session: create missing startedAt", createSession(anon, { startedAt: undefined }));
deny("session: create extra key", createSession(anon, { userAgent: "x" }));
deny("session: create schemaVersion 2", createSession(anon, { schemaVersion: 2 }));
deny("session: create schemaVersion string", createSession(anon, { schemaVersion: "1" }));
deny("session: create startedAt client time", createSession(anon, { startedAt: Timestamp.now() }));
deny("session: create updatedAt client time", createSession(anon, { updatedAt: Timestamp.now() }));
deny("session: create startedAt string", createSession(anon, { startedAt: "now" }));
deny("session: create expireAt 300d", createSession(anon, { expireAt: Timestamp.fromMillis(Date.now() + 300 * DAY) }));
deny("session: create expireAt 367d", createSession(anon, { expireAt: Timestamp.fromMillis(Date.now() + 367 * DAY) }));
deny("session: create expireAt string", createSession(anon, { expireAt: "2027-10-30" }));
deny("session: create expireAt serverTimestamp", createSession(anon, { expireAt: serverTimestamp() }));
deny("session: create lastScreen s11", createSession(anon, { lastScreen: "s11" }));
deny("session: create lastScreen l0", createSession(anon, { lastScreen: "l0" }));
deny("session: create lastScreen l12", createSession(anon, { lastScreen: "l12" }));
deny("session: create lastScreen number", createSession(anon, { lastScreen: 0 }));
deny("session: create maxSurveyStep 12", createSession(anon, { maxSurveyStep: 12 }));
deny("session: create maxSurveyStep -1", createSession(anon, { maxSurveyStep: -1 }));
deny("session: create maxSurveyStep 1.5", createSession(anon, { maxSurveyStep: 1.5 }));
deny("session: create maxLessonStep string", createSession(anon, { maxLessonStep: "3" }));
deny("session: create lessonCompleted string", createSession(anon, { lessonCompleted: "false" }));
deny("session: create submitted null", createSession(anon, { submitted: null }));
deny("session: create counter 501", createSession(anon, { submitAttempts: 501 }));
deny("session: create counter negative", createSession(anon, { lessonRestarts: -1 }));
deny("session: create map value 501", createSession(anon, { infoOpens: activityMap({ futsal: 501 }) }));
deny("session: create map key 'other'", createSession(anon, { infoSelects: { ...activityMap(), other: 0 } }));
deny("session: create instagram unknown key", createSession(anon, { instagramClicks: { ...igMap(), share: 0 } }));
deny("session: create infoOpens list", createSession(anon, { infoOpens: [] }));
deny("session: create instagramClicks string", createSession(anon, { instagramClicks: "" }));

// --- write-pattern toggling (pattern 4)
deny("session: merge-update before the doc exists (client then creates)", () => mergeUpdate(anon, newId(), freshState()));
deny("session: second create on an existing doc (client then merge-updates)", async () => {
  const id = await seedSession();
  return setDoc(doc(anon, "sessions", id), createPayload(progressed()));
});
allow("session: create then merge-update (full lifecycle)", async () => {
  const id = newId();
  const s = freshState();
  await setDoc(doc(anon, "sessions", id), createPayload(s));
  Object.assign(s, { lastScreen: "s1", maxSurveyStep: 1 });
  await mergeUpdate(anon, id, s);
  s.infoOpens = activityMap({ futsal: 1 });
  s.infoSelects = activityMap({ futsal: 1 });
  Object.assign(s, { lastScreen: "s9", maxSurveyStep: 10, submitAttempts: 1 });
  await mergeUpdate(anon, id, s);
  Object.assign(s, { lastScreen: "s10", maxSurveyStep: 11, submitted: true });
  await mergeUpdate(anon, id, s);
  Object.assign(s, { lastScreen: "l11", maxLessonStep: 11, lessonCompleted: true, instagramClicks: igMap({ lessonEnd: 1 }) });
  return mergeUpdate(anon, id, s);
});

// --- update: valid (merge pattern, absolute values)
allow("session: merge-update advances screen and steps", step((s) => ({ ...s, lastScreen: "s7", maxSurveyStep: 8, maxLessonStep: 4 })));
allow("session: merge-update lastScreen backwards (Back button)", step((s) => ({ ...s, lastScreen: "s2" })));
allow("session: merge-update with no changes", step((s) => s));
allow("session: merge-update counters", step((s) => ({ ...s, lessonRestarts: 3, submitAttempts: 3, submitFailures: 2 })));
allow("session: merge-update map values", step((s) => ({ ...s, infoOpens: activityMap({ futsal: 4, "book-club": 1, "vibe-coding": 1 }), infoSelects: activityMap({ futsal: 2, "happy-bridge": 1 }), instagramClicks: igMap({ done: 2, lessonEnd: 1 }) })));
allow("session: merge-update counters to cap 500", step((s) => ({ ...s, lessonRestarts: 500, submitAttempts: 500, submitFailures: 500, infoOpens: activityMap({ futsal: 500, "book-club": 500 }), instagramClicks: igMap({ done: 500, lessonEnd: 500 }) })));
allow("session: merge-update max steps to 11", step((s) => ({ ...s, maxSurveyStep: 11, maxLessonStep: 11 })));
allow("session: merge-update by signed-in user", step((s) => ({ ...s, lastScreen: "s6" }), { db: user }));
allow("session: merge-update resending unchanged startedAt/expireAt", async () => {
  const data = progressedDoc();
  const id = await seedSession(data);
  return mergeUpdate(anon, id, progressed(), { startedAt: data.startedAt, expireAt: data.expireAt });
});
// Heavy updates vs the 1,000-expression rules limit. Measured headroom: one
// update may change all 20 activity-map entries when nothing else changes, or
// 12 of them when every other field changes too. The app writes after each
// interaction, so real updates change 1-3 values.
const allIds = (v) => activityMap(Object.fromEntries(ACTIVITY_IDS.map((k) => [k, v])));
allow("session: heavy update, all 20 activity-map entries change", step((s) => ({
  ...s, infoOpens: allIds(500), infoSelects: allIds(500),
})));
allow("session: heavy update, every field + all 10 infoOpens entries change", async () => {
  const id = newId();
  await setDoc(doc(anon, "sessions", id), createPayload());
  return mergeUpdate(anon, id, {
    schemaVersion: 1, lastScreen: "l11", maxSurveyStep: 11, maxLessonStep: 11,
    lessonCompleted: true, lessonRestarts: 500, submitAttempts: 500, submitFailures: 500, submitted: true,
    infoOpens: allIds(500), infoSelects: activityMap(), instagramClicks: igMap({ done: 500, lessonEnd: 500 }),
  });
});
allow("session: worst case, create with every value at cap", createSession(anon, {
  lastScreen: "l11", maxSurveyStep: 11, maxLessonStep: 11, lessonCompleted: true, submitted: true,
  lessonRestarts: 500, submitAttempts: 500, submitFailures: 500,
  infoOpens: allIds(500), infoSelects: allIds(500), instagramClicks: igMap({ done: 500, lessonEnd: 500 }),
}));
deny("session: worst case with one infoSelects value decreasing", step((s) => ({
  ...s, lastScreen: "l11", maxSurveyStep: 11, maxLessonStep: 11, lessonRestarts: 500, submitAttempts: 500, submitFailures: 500,
  infoOpens: allIds(500), infoSelects: { ...allIds(500), futsal: 1 }, instagramClicks: igMap({ done: 500, lessonEnd: 500 }),
})));
deny("session: map gains a key outside the 10 ids on update",step((s) => ({ ...s, infoOpens: { ...allIds(1), futsal: 3, "book-club": 1, undecided: 1 } })));
allow("session: updateDoc with increment() also works",rawUpdate({ submitAttempts: increment(1), "infoOpens.futsal": increment(1) }));

// --- update: monotonic violations
deny("session: maxSurveyStep decreases", step((s) => ({ ...s, maxSurveyStep: 5 })));
deny("session: maxLessonStep decreases", step((s) => ({ ...s, maxLessonStep: 2 })));
deny("session: lessonRestarts decreases", step((s) => ({ ...s, lessonRestarts: 1 })));
deny("session: submitAttempts decreases", step((s) => ({ ...s, submitAttempts: 1 })));
deny("session: submitFailures decreases", step((s) => ({ ...s, submitFailures: 0 })));
deny("session: submitted true -> false", step((s) => ({ ...s, submitted: false })));
deny("session: lessonCompleted true -> false", step((s) => ({ ...s, lessonCompleted: false })));
deny("session: infoOpens value decreases", step((s) => ({ ...s, infoOpens: activityMap({ futsal: 2, "book-club": 1 }) })));
deny("session: infoOpens hyphenated value decreases", step((s) => ({ ...s, infoOpens: activityMap({ futsal: 3, "book-club": 0 }) })));
deny("session: infoSelects value decreases", step((s) => ({ ...s, infoSelects: activityMap({ futsal: 1 }) })));
deny("session: instagramClicks done decreases", step((s) => ({ ...s, instagramClicks: igMap({ done: 0, lessonEnd: 1 }) })));
deny("session: instagramClicks lessonEnd decreases", step((s) => ({ ...s, instagramClicks: igMap({ done: 1, lessonEnd: 0 }) })));
deny("session: client restarted from zero state", step(() => freshState()));
deny("session: infoOpens key removed", rawUpdate({ "infoOpens.futsal": deleteField() }));
deny("session: infoOpens map replaced without a key", rawUpdate({ infoOpens: { futsal: 3 } }));
deny("session: infoSelects emptied", rawUpdate({ infoSelects: {} }));
deny("session: instagramClicks key removed", rawUpdate({ instagramClicks: { done: 1 } }));

// --- update: immutable fields and timestamps
deny("session: startedAt changed", step((s) => s, { over: { startedAt: Timestamp.now() } }));
deny("session: startedAt reset to serverTimestamp", step((s) => s, { over: { startedAt: serverTimestamp() } }));
deny("session: expireAt changed", step((s) => s, { over: { expireAt: Timestamp.fromMillis(Date.now() + 365 * DAY) } }));
deny("session: schemaVersion changed", step((s) => ({ ...s, schemaVersion: 2 })));
deny("session: updatedAt client time", step((s) => s, { over: { updatedAt: Timestamp.now() } }));
deny("session: updatedAt omitted", step((s) => s, { over: { updatedAt: undefined } }));

// --- update: caps, keys, types
deny("session: lessonRestarts 501", step((s) => ({ ...s, lessonRestarts: 501 })));
deny("session: submitAttempts 501", step((s) => ({ ...s, submitAttempts: 501 })));
deny("session: submitFailures 501", step((s) => ({ ...s, submitFailures: 501 })));
deny("session: infoOpens value 501", step((s) => ({ ...s, infoOpens: activityMap({ futsal: 501, "book-club": 1 }) })));
deny("session: infoSelects value 501", step((s) => ({ ...s, infoSelects: activityMap({ futsal: 501 }) })));
deny("session: instagramClicks value 501", step((s) => ({ ...s, instagramClicks: igMap({ done: 1, lessonEnd: 501 }) })));
deny("session: maxSurveyStep 12", step((s) => ({ ...s, maxSurveyStep: 12 })));
deny("session: maxLessonStep 12", step((s) => ({ ...s, maxLessonStep: 12 })));
deny("session: infoOpens key 'other'", step((s) => ({ ...s, infoOpens: { ...s.infoOpens, other: 1 } })));
deny("session: infoSelects key 'undecided'", step((s) => ({ ...s, infoSelects: { ...s.infoSelects, undecided: 1 } })));
deny("session: instagramClicks unknown key", step((s) => ({ ...s, instagramClicks: { ...s.instagramClicks, profile: 1 } })));
deny("session: map value string", step((s) => ({ ...s, infoOpens: { ...s.infoOpens, futsal: "4" } })));
deny("session: map value float", step((s) => ({ ...s, infoOpens: { ...s.infoOpens, futsal: 3.5 } })));
deny("session: map value negative", step((s) => ({ ...s, infoSelects: { ...s.infoSelects, "happy-bridge": -1 } })));
deny("session: map replaced by list", rawUpdate({ infoSelects: ["futsal"] }));
deny("session: counter float", step((s) => ({ ...s, submitAttempts: 2.5 })));
deny("session: counter string", step((s) => ({ ...s, lessonRestarts: "3" })));
deny("session: submitted string", step((s) => ({ ...s, submitted: "true" })));
deny("session: lastScreen invalid", step((s) => ({ ...s, lastScreen: "admin" })));
deny("session: extra field", step((s) => ({ ...s, ip: "1.2.3.4" })));
deny("session: field deleted", rawUpdate({ submitFailures: deleteField() }));

// --- read / delete
await seed(async (db) => {
  const past = Timestamp.fromMillis(Date.now() - DAY);
  await setDoc(doc(db, "sessions", "SeedSessionAAAAAAAAA"), progressedDoc());
  for (const id of ["ExpiredSessionAAAAA1", "ExpiredSessionAAAAA2"]) {
    await setDoc(doc(db, "sessions", id), { ...progressedDoc(), expireAt: past });
  }
});
deny("session: anon get", () => getDoc(doc(anon, "sessions", "SeedSessionAAAAAAAAA")));
deny("session: anon list", () => getDocs(collection(anon, "sessions")));
deny("session: user get", () => getDoc(doc(user, "sessions", "SeedSessionAAAAAAAAA")));
deny("session: user list", () => getDocs(collection(user, "sessions")));
deny("session: unverified admin list", () => getDocs(collection(adminUnverified, "sessions")));
allow("session: admin get", () => getDoc(doc(admin, "sessions", "SeedSessionAAAAAAAAA")));
allow("session: admin list", () => getDocs(collection(admin, "sessions")));
allow("session: admin query expired", () => getDocs(query(collection(admin, "sessions"), where("expireAt", "<", Timestamp.now()))));
deny("session: anon delete", () => deleteDoc(doc(anon, "sessions", "SeedSessionAAAAAAAAA")));
deny("session: anon delete expired", () => deleteDoc(doc(anon, "sessions", "ExpiredSessionAAAAA1")));
deny("session: user delete expired", () => deleteDoc(doc(user, "sessions", "ExpiredSessionAAAAA1")));
deny("session: unverified admin delete expired", () => deleteDoc(doc(adminUnverified, "sessions", "ExpiredSessionAAAAA1")));
deny("session: admin delete not expired", () => deleteDoc(doc(admin, "sessions", "SeedSessionAAAAAAAAA")));
allow("session: admin delete expired", () => deleteDoc(doc(admin, "sessions", "ExpiredSessionAAAAA1")));
allow("session: admin batch delete expired", async () => {
  const b = writeBatch(admin);
  b.delete(doc(admin, "sessions", "ExpiredSessionAAAAA2"));
  await b.commit();
});

/* ====================================================================== */
/* admins and everything else                                              */
/* ====================================================================== */

allow("admins: get own entry", () => getDoc(doc(admin, "admins", ADMIN)));
allow("admins: get own (missing) entry", () => getDoc(doc(user, "admins", "user@example.com")));
deny("admins: get someone else's entry", () => getDoc(doc(user, "admins", ADMIN)));
deny("admins: anon get", () => getDoc(doc(anon, "admins", ADMIN)));
deny("admins: list", () => getDocs(collection(admin, "admins")));
deny("admins: self-add", () => setDoc(doc(user, "admins", "user@example.com"), { role: "admin" }));
deny("admins: admin adds another", () => setDoc(doc(admin, "admins", "x@example.com"), { role: "admin" }));
deny("admins: admin deletes self", () => deleteDoc(doc(admin, "admins", ADMIN)));

deny("other: anon write unknown collection", () => setDoc(doc(anon, "other", "x"), { a: 1 }));
deny("other: admin read unknown collection", () => getDoc(doc(admin, "other", "x")));
deny("other: anon write subcollection", () => setDoc(doc(anon, "responses", "seed", "sub", "x"), { a: 1 }));
deny("other: anon write session subcollection", () => setDoc(doc(anon, "sessions", "SeedSessionAAAAAAAAA", "sub", "x"), { a: 1 }));
