import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  funnel, surveyFunnel, lessonFunnel, infoTable, pickTable, hasInfoHistory, submitStats, analyticsReport,
} from '../src/admin/analytics-report.js';
import { emptyStats } from '../src/lib/tracker.js';

const session = (over = {}) => {
  const base = emptyStats();
  return {
    ...base, ...over,
    infoOpens: { ...base.infoOpens, ...over.infoOpens },
    infoSelects: { ...base.infoSelects, ...over.infoSelects },
    instagramClicks: { ...base.instagramClicks, ...over.instagramClicks },
    startedAt: over.startedAt ?? new Date('2026-10-31T03:00:00Z'),
  };
};

test('funnel: share of start, drop from previous, single biggest drop flagged', () => {
  const rows = funnel([{ count: 100 }, { count: 90 }, { count: 50 }, { count: 45 }, { count: 45 }]);
  assert.deepEqual(rows.map(r => r.pct), [1, 0.9, 0.5, 0.45, 0.45]);
  assert.deepEqual(rows.map(r => r.drop), [0, 10, 40, 5, 0]);
  assert.equal(rows[2].dropRate, 40 / 90);
  assert.deepEqual(rows.map(r => r.biggestDrop), [false, false, true, false, false]);
});

test('funnel: no flag when nothing drops, and no division by zero', () => {
  assert.ok(funnel([{ count: 3 }, { count: 3 }]).every(r => !r.biggestDrop));
  const empty = funnel([{ count: 0 }, { count: 0 }]);
  assert.deepEqual(empty.map(r => [r.pct, r.dropRate]), [[0, 0], [0, 0]]);
});

test('survey funnel counts sessions with maxSurveyStep ≥ each step, without the retired S5', () => {
  const rows = surveyFunnel([
    session({ maxSurveyStep: 0 }), session({ maxSurveyStep: 1 }), session({ maxSurveyStep: 4 }), session({ maxSurveyStep: 11 }),
  ]);
  assert.equal(rows.length, 11);
  assert.deepEqual(rows.map(r => r.id), ['s0', 's1', 's2', 's3', 's3_1', 's4', 's6', 's7', 's8', 's9', 's10']);
  assert.deepEqual(rows.map(r => r.count), [4, 3, 2, 2, 2, 1, 1, 1, 1, 1, 1]);
  assert.equal(rows.filter(r => r.biggestDrop).length, 1);
  assert.equal(rows[0].label, '챔퍼스 소개');
  // The 성별 screen reports as s6 too, so this row covers both.
  assert.equal(rows[6].label, '이름·성별');
});

test('S4 → S6 drop is direct; old sessions that stopped on S5 still render (counted up to S4)', () => {
  const rows = surveyFunnel([
    session({ maxSurveyStep: 5, lastScreen: 's4' }),
    session({ maxSurveyStep: 6, lastScreen: 's5' }), // recorded before S5 was removed
    session({ maxSurveyStep: 7, lastScreen: 's6' }),
    session({ maxSurveyStep: 11, lastScreen: 's10' }),
  ]);
  const s4 = rows.find(r => r.id === 's4'), s6 = rows.find(r => r.id === 's6');
  assert.equal(rows.some(r => r.id === 's5'), false);
  assert.equal(s4.count, 4);
  assert.equal(s6.count, 2);
  assert.equal(s6.drop, 2);
  assert.equal(s6.dropRate, 0.5);
});

test('lesson funnel is based on submitted sessions only', () => {
  const l = lessonFunnel([
    session({ submitted: false, maxLessonStep: 0 }),
    session({ submitted: true, maxLessonStep: 0 }),
    session({ submitted: true, maxLessonStep: 3 }),
    session({ submitted: true, maxLessonStep: 11, lessonCompleted: true, lessonRestarts: 2 }),
  ]);
  assert.equal(l.steps.length, 12);
  assert.deepEqual(l.steps.map(s => s.count), [3, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.equal(l.steps[1].label, '1. 시작 화면');
  assert.equal(l.completed, 1);
  assert.equal(l.restarts, 2);
  assert.equal(l.restartSessions, 1);
});

test('ⓘ table: opens, sessions, selects, rate after reading, picks from deduped responses; sorted by opens', () => {
  const sessions = [
    session({ infoOpens: { futsal: 3 }, infoSelects: { futsal: 1 } }),
    session({ infoOpens: { futsal: 1, 'book-club': 1 } }),
    session({ infoOpens: { 'book-club': 1 }, infoSelects: { 'book-club': 2 } }),
  ];
  const responses = [
    { phone: '01011112222', createdAt: new Date('2026-10-31T04:00:00Z'), activities: ['futsal'] },
    { phone: '01011112222', createdAt: new Date('2026-10-31T05:00:00Z'), activities: ['futsal', 'book-club'] },
    { phone: '01033334444', createdAt: new Date('2026-10-31T05:00:00Z'), activities: ['futsal'] },
  ];
  const rows = infoTable(sessions, responses);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.slice(0, 2).map(r => r.id), ['futsal', 'book-club']);
  const futsal = rows[0], book = rows[1];
  assert.deepEqual([futsal.opens, futsal.openedSessions, futsal.selects, futsal.selectRate, futsal.picks], [4, 2, 1, 0.5, 2]);
  assert.deepEqual([book.opens, book.openedSessions, book.selects, book.selectRate, book.picks], [2, 2, 2, 0.5, 1]);
  assert.equal(rows.find(r => r.id === 'perfume-workshop').selectRate, null);
  assert.ok(!rows.some(r => r.id === 'undecided' || r.id === 'other'));
});

test('submit and Instagram totals', () => {
  assert.deepEqual(submitStats([
    session({ submitAttempts: 2, submitFailures: 1, submitted: true, instagramClicks: { done: 1 } }),
    session({ submitAttempts: 1, submitFailures: 1, instagramClicks: { lessonEnd: 2 } }),
    session(),
  ]), { attempts: 3, successes: 1, failures: 2, instagramDone: 1, instagramLessonEnd: 2 });
});

test("'today' keeps sessions and responses from today's Korea date only", () => {
  const now = new Date('2026-10-31T05:30:00Z'); // 14:30 KST
  const sessions = [
    session({ startedAt: new Date('2026-10-30T15:30:00Z'), maxSurveyStep: 11, submitted: true }), // 00:30 KST on the 31st
    session({ startedAt: new Date('2026-10-30T14:30:00Z'), maxSurveyStep: 2 }),                    // 23:30 KST on the 30th
  ];
  const responses = [
    { phone: '01011112222', createdAt: new Date('2026-10-31T01:00:00Z'), activities: ['futsal'] },
    { phone: '01033334444', createdAt: new Date('2026-10-30T10:00:00Z'), activities: ['futsal'] },
  ];
  const today = analyticsReport(sessions, responses, { range: 'today', now });
  assert.equal(today.day, '2026-10-31');
  assert.equal(today.sessions, 1);
  assert.equal(today.survey.at(-1).count, 1);
  assert.equal(today.picks.rows.find(r => r.id === 'futsal').count, 1);
  assert.equal(today.picks.respondents, 1);
  assert.equal(today.info, null, 'no ⓘ history → no legacy table');
  const all = analyticsReport(sessions, responses, { range: 'all', now });
  assert.equal(all.sessions, 2);
  assert.equal(all.picks.rows.find(r => r.id === 'futsal').count, 2);
});

test('활동별 선택: picks per activity from deduped responses, share of respondents, most picked first', () => {
  const { respondents, rows } = pickTable([
    { phone: '01011112222', createdAt: new Date('2026-10-31T04:00:00Z'), activities: ['futsal'] },
    { phone: '01011112222', createdAt: new Date('2026-10-31T05:00:00Z'), activities: ['futsal', 'book-club'] }, // latest wins
    { phone: '01033334444', createdAt: new Date('2026-10-31T05:00:00Z'), activities: ['futsal', 'other'] },
    { phone: '01055556666', createdAt: new Date('2026-10-31T05:00:00Z'), activities: ['undecided'] },
  ]);
  assert.equal(respondents, 3);
  assert.equal(rows.length, 12, 'all 12 choices, 아직 고민 중이에요 and 기타 included');
  assert.deepEqual(rows.slice(0, 4).map(r => [r.id, r.count]), [['futsal', 2], ['book-club', 1], ['undecided', 1], ['other', 1]]);
  assert.equal(rows[0].id, 'futsal');
  assert.equal(rows[0].share, 2 / 3);
  assert.deepEqual(rows.slice(1, 4).map(r => r.id), ['book-club', 'undecided', 'other'], 'ties keep the card order');
  assert.equal(rows.find(r => r.id === 'perfume-workshop').count, 0);
  assert.equal(pickTable([]).rows[0].share, null, 'no respondents → no share');
});

test('legacy ⓘ table only when some session still has ⓘ counts', () => {
  assert.equal(hasInfoHistory([session(), session()]), false);
  assert.equal(hasInfoHistory([session(), session({ infoSelects: { futsal: 1 } })]), true);
  const report = analyticsReport([session({ infoOpens: { futsal: 2 } })], [], { range: 'all' });
  assert.equal(report.info.find(r => r.id === 'futsal').opens, 2);
});
