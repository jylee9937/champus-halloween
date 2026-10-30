// Drives the web app's real session tracker (src/lib/tracker.js: createTracker + sessionDoc) through a full
// visit against the emulator, so the exact client payloads are checked by firestore.rules.
// Run with the other rules tests: `npm install && npm test` in this folder.
import { readFileSync } from "node:fs";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, doc, getDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { createTracker, sessionDoc, newSid } from "../../src/lib/tracker.js";
import { buildPayload, emptyAnswers } from "../../src/lib/validate.js";

const env = await initializeTestEnvironment({
  projectId: "demo-champus-client",
  firestore: {
    rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"),
    host: "127.0.0.1",
    port: 8080,
  },
});
after(() => env.cleanup());
const anon = env.unauthenticatedContext().firestore();

const noTimers = { setTimeout: () => 0, clearTimeout: () => {} };

// A tracker whose writes go to the emulator as the anonymous booth visitor, recording every outcome.
function visitor(saved = null, sid = newSid()) {
  const outcomes = [];
  const store = { value: saved };
  const tracker = createTracker({
    load: () => store.value,
    save: (v) => { store.value = structuredClone(v); },
    makeSid: () => sid,
    timers: noTimers,
    async write(id, stats, { create }) {
      const data = sessionDoc(stats, { create, now: Date.now(), serverTimestamp, timestampFromMillis: Timestamp.fromMillis });
      try {
        await (create ? setDoc(doc(anon, "sessions", id), data) : setDoc(doc(anon, "sessions", id), data, { merge: true }));
        outcomes.push(create ? "create" : "update");
      } catch (err) {
        outcomes.push(`${create ? "create" : "update"} denied`);
        throw err;
      }
    },
  });
  const step = async (...events) => { for (const e of events) tracker.record(e); await tracker.flush(); };
  return { tracker, step, outcomes, store };
}

// withSecurityRulesDisabled resolves to void, so read the doc out through a closure.
async function stored(id) {
  let data;
  await env.withSecurityRulesDisabled(async (ctx) => { data = (await getDoc(doc(ctx.firestore(), "sessions", id))).data(); });
  return data;
}
const screen = (id) => ({ type: "screen", id });

test("a full visit: every client write is accepted and the doc matches what happened", async () => {
  const v = visitor();
  await v.step(screen("s0"));
  await v.step(screen("s1"), { type: "infoOpen", id: "futsal" }, { type: "infoSelect", id: "futsal" });
  await v.step({ type: "infoOpen", id: "book-club" });
  for (const id of ["s2", "s3", "s3_1", "s4", "s6", "s7", "s8", "s9"]) await v.step(screen(id));
  await v.step(screen("s8")); // back navigation: lastScreen moves, maxes stay
  await v.step(screen("s9"), { type: "submitAttempt" }, { type: "submitFailure" });
  await v.step({ type: "submitAttempt" }, { type: "submitted" }, screen("s10"), { type: "instagram", where: "done" });
  for (let n = 1; n <= 11; n++) await v.step(screen(`l${n}`));
  await v.step({ type: "instagram", where: "lessonEnd" }, { type: "lessonRestart" }, screen("l1"));

  assert.deepEqual(v.outcomes.filter((o) => o.includes("denied")), []);
  assert.equal(v.outcomes[0], "create");
  assert.ok(v.outcomes.slice(1).every((o) => o === "update"));

  const { startedAt, updatedAt, expireAt, infoOpens, infoSelects, ...rest } = await stored(v.tracker.state().sid);
  assert.ok(startedAt instanceof Timestamp && updatedAt instanceof Timestamp && expireAt instanceof Timestamp);
  assert.deepEqual(rest, {
    schemaVersion: 1, lastScreen: "l1", maxSurveyStep: 11, maxLessonStep: 11, lessonCompleted: true,
    lessonRestarts: 1, submitAttempts: 2, submitFailures: 1, submitted: true, instagramClicks: { done: 1, lessonEnd: 1 },
  });
  assert.equal(Object.keys(infoOpens).length, 10);
  assert.deepEqual([infoOpens.futsal, infoOpens["book-club"], infoOpens["union-worship"]], [1, 1, 0]);
  assert.deepEqual([infoSelects.futsal, infoSelects["book-club"]], [1, 0]);
});

test("a reload continues the same session from sessionStorage without lowering anything", async () => {
  const first = visitor();
  await first.step(screen("s0"));
  await first.step(screen("s6"), { type: "infoOpen", id: "futsal" });
  const again = visitor(first.store.value);
  await again.step(screen("s0")); // the survey restarts at S0 after a reload
  assert.deepEqual(again.outcomes, ["update"]);
  const d = await stored(first.tracker.state().sid);
  assert.equal(d.lastScreen, "s0");
  assert.equal(d.maxSurveyStep, 7);
  assert.equal(d.infoOpens.futsal, 1);
});

test("a create whose ack was lost is denied once, then the tracker switches to updates", async () => {
  const first = visitor();
  await first.step(screen("s0"));
  // The tab closed before `created` was saved: the doc exists but the stored state says otherwise.
  const lost = { ...first.store.value, created: false };
  const again = visitor(lost);
  await again.step(screen("s1"));   // create → denied (doc exists), flips to update mode
  await again.tracker.flush();      // the retry (normally after a backoff) goes out as an update
  await again.step(screen("s2"));
  assert.deepEqual(again.outcomes, ["create denied", "update", "update"]);
  assert.equal((await stored(first.tracker.state().sid)).maxSurveyStep, 2);
});

test("a survey response built by the app (no consent since S5 was removed) is accepted", async () => {
  const answers = {
    ...emptyAnswers(), activities: ["book-club", "other"], activityOther: "보드게임", days: ["tue"],
    participation: "regular", seekingFaithCommunity: true, comment: "e2e", name: "테스트",
    department: "테스트학과", studentId: "00", phone: "010-0000-0000",
  };
  // Same shape as submitResponse() in src/lib/firebase.js.
  const data = { schemaVersion: 1, ...buildPayload(answers), createdAt: serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 365 * 86_400_000) };
  assert.equal("consent" in data, false);
  assert.equal(Object.keys(data).length, 13);
  await addDoc(collection(anon, "responses"), data);
});
