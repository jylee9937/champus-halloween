// Admin-side shaping of survey responses: dedupe, summary, table cells and CSV. Pure — runs under `node --test`.
import { ACTIVITIES, activityName, dayLabel, genderLabel, participationLabel } from '../survey/data.js';
import { formatPhone } from '../lib/validate.js';

export const COLUMNS = ['제출 시각', '이름', '성별', '학과', '학번', '연락처', '활동', '기타 활동', '요일', '참여 방식', '신앙 공동체', '궁금한 점'];

const time = r => r.createdAt?.getTime?.() ?? 0;
export const newestFirst = rows => [...rows].sort((x, y) => time(y) - time(x));

/** One row per phone number, keeping the latest submission. Result is newest first. */
export function dedupeByPhone(rows) {
  const seen = new Set();
  return newestFirst(rows).filter(r => {
    if (seen.has(r.phone)) return false;
    seen.add(r.phone);
    return true;
  });
}

/** Expects already-deduped rows, so every count is in unique people. */
export function summarize(rows) {
  const counts = new Map(ACTIVITIES.map(a => [a.id, 0]));
  for (const r of rows) for (const id of new Set(r.activities ?? [])) counts.set(id, (counts.get(id) ?? 0) + 1);
  return {
    respondents: rows.length,
    faithYes: rows.filter(r => r.seekingFaithCommunity === true).length,
    // Responses from before the 성별 question have no gender; they count in neither.
    male: rows.filter(r => r.gender === 'male').length,
    female: rows.filter(r => r.gender === 'female').length,
    activities: ACTIVITIES.map(a => ({ id: a.id, emoji: a.emoji, name: a.name, count: counts.get(a.id) })),
  };
}

const KST = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
/** "2026-10-31 14:05" in Korea time. */
export function formatTime(date) {
  if (!date) return '';
  const p = Object.fromEntries(KST.formatToParts(date).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Display strings in COLUMNS order. */
export function toCells(r) {
  return [
    formatTime(r.createdAt),
    r.name ?? '',
    genderLabel(r.gender), // '—' for responses from before the question
    r.department ?? '',
    r.studentId ?? '',
    formatPhone(r.phone ?? ''),
    (r.activities ?? []).map(activityName).join(', '),
    r.activityOther ?? '',
    (r.days ?? []).map(dayLabel).join(', '),
    participationLabel(r.participation),
    r.seekingFaithCommunity === true ? '네' : r.seekingFaithCommunity === false ? '아니요' : '',
    r.comment ?? '',
  ];
}

// Quote every cell, and defuse anything Excel would run as a formula.
function csvCell(v) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/** UTF-8 CSV with a BOM so Excel opens Korean correctly. */
export function toCsv(rows) {
  const lines = [COLUMNS, ...rows.map(toCells)].map(cells => cells.map(csvCell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export const csvFilename = (now = new Date()) => `champus-responses-${formatTime(now).slice(0, 10)}.csv`;
