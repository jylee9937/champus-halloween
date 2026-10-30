// Analytics tab math over sessions/{sid} docs (one per browser tab). Pure — runs under `node --test`.
import { ACTIVITIES } from '../survey/data.js';
import { SURVEY_STEPS, RETIRED_STEPS, LESSON_STEPS, INFO_IDS } from '../lib/tracker.js';
import { dedupeByPhone, summarize, formatTime } from './report.js';

export const SURVEY_LABELS = {
  s0: '챔퍼스 소개', s1: '관심 활동', s2: '편한 요일', s3: '참여 방식', s3_1: '신앙 공동체', s4: '궁금한 점',
  // s6 covers the name and the 성별 screens: both report as s6 (no new step in the sessions contract).
  s6: '이름·성별', s7: '학과', s8: '학번', s9: '연락처', s10: '신청 완료',
};
export const LESSON_LABELS = [
  '시작 화면', '귀신의 날?', '퀴즈 1', '이름 속 비밀', '11월 1일', '성인이란?',
  '할로윈 밤', '퀴즈 2', '시간이 흐르며', '퀴즈 3', '마무리',
];

const num = v => (Number.isFinite(v) ? v : 0);
const sum = (rows, pick) => rows.reduce((t, r) => t + num(pick(r)), 0);

/** Adds share of the first step, the drop from the previous step, and flags the single biggest drop. */
export function funnel(steps) {
  const first = steps[0]?.count ?? 0;
  let biggest = null;
  const out = steps.map((st, i) => {
    const prev = i ? steps[i - 1].count : st.count;
    const drop = Math.max(0, prev - st.count);
    const row = { ...st, pct: first ? st.count / first : 0, drop, dropRate: prev ? drop / prev : 0, biggestDrop: false };
    if (drop > 0 && (!biggest || drop > biggest.drop)) biggest = row;
    return row;
  });
  if (biggest) biggest.biggestDrop = true;
  return out;
}

/**
 * Sessions reaching each survey screen (maxSurveyStep ≥ its index), s0 → s10. The retired S5 has no row,
 * so the S4 → S6 drop is computed directly; old sessions that stopped on S5 (max 6) count as reaching S4.
 */
export const surveyFunnel = sessions => funnel(SURVEY_STEPS
  .map((id, i) => ({ id, i }))
  .filter(({ id }) => !RETIRED_STEPS.has(id))
  .map(({ id, i }) => ({ id, label: SURVEY_LABELS[id], count: sessions.filter(s => num(s.maxSurveyStep) >= i).length })));

/** Of submitted sessions: how far into the lesson they got, plus completions and restarts. */
export function lessonFunnel(sessions) {
  const base = sessions.filter(s => s.submitted === true);
  const steps = [{ id: 'submitted', label: '신청 완료', count: base.length }];
  for (let n = 1; n <= LESSON_STEPS; n++) {
    steps.push({ id: 'l' + n, label: `${n}. ${LESSON_LABELS[n - 1]}`, count: base.filter(s => num(s.maxLessonStep) >= n).length });
  }
  return {
    steps: funnel(steps),
    completed: base.filter(s => s.lessonCompleted === true).length,
    restarts: sum(base, s => s.lessonRestarts),
    restartSessions: base.filter(s => num(s.lessonRestarts) > 0).length,
  };
}

/**
 * Picks per activity from responses deduped by phone, with the share of those respondents.
 * All 12 choices (아직 고민 중이에요 and 기타 included), most picked first.
 */
export function pickTable(responses) {
  const unique = dedupeByPhone(responses);
  const rows = summarize(unique).activities.map((a, order) => ({
    ...a, order, share: unique.length ? a.count / unique.length : null,
  }));
  return { respondents: unique.length, rows: rows.sort((x, y) => y.count - x.count || x.order - y.order) };
}

/** True when any session still carries ⓘ counts from before S1 showed the details inline. */
export const hasInfoHistory = sessions =>
  sessions.some(s => INFO_IDS.some(id => num(s.infoOpens?.[id]) > 0 || num(s.infoSelects?.[id]) > 0));

/** Legacy (ⓘ sheet era): opens, sessions that opened it, sheet selects and the share who picked after reading. */
export function infoTable(sessions, responses) {
  const picks = Object.fromEntries(summarize(dedupeByPhone(responses)).activities.map(a => [a.id, a.count]));
  return INFO_IDS.map((id, order) => {
    const act = ACTIVITIES.find(a => a.id === id);
    const opened = sessions.filter(s => num(s.infoOpens?.[id]) > 0);
    const selectedAfter = opened.filter(s => num(s.infoSelects?.[id]) > 0).length;
    return {
      id, emoji: act.emoji, name: act.name, order,
      opens: sum(sessions, s => s.infoOpens?.[id]),
      openedSessions: opened.length,
      selects: sum(sessions, s => s.infoSelects?.[id]),
      selectRate: opened.length ? selectedAfter / opened.length : null,
      picks: picks[id] ?? 0,
    };
  }).sort((x, y) => y.opens - x.opens || x.order - y.order);
}

export function submitStats(sessions) {
  return {
    attempts: sum(sessions, s => s.submitAttempts),
    successes: sessions.filter(s => s.submitted === true).length,
    failures: sum(sessions, s => s.submitFailures),
    instagramDone: sum(sessions, s => s.instagramClicks?.done),
    instagramLessonEnd: sum(sessions, s => s.instagramClicks?.lessonEnd),
  };
}

const kstDay = date => (date ? formatTime(date).slice(0, 10) : '');

/** range 'today' keeps sessions started (and responses created) on today's date in Korea time. */
export function analyticsReport(sessions, responses, { range = 'all', now = new Date() } = {}) {
  const today = kstDay(now);
  const s = range === 'today' ? sessions.filter(x => kstDay(x.startedAt) === today) : sessions;
  const r = range === 'today' ? responses.filter(x => kstDay(x.createdAt) === today) : responses;
  return {
    day: today,
    sessions: s.length,
    survey: surveyFunnel(s),
    lesson: lessonFunnel(s),
    picks: pickTable(r),
    info: hasInfoHistory(s) ? infoTable(s, r) : null,
    submit: submitStats(s),
  };
}
