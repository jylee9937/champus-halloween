import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeByPhone, summarize, toCells, toCsv, formatTime, COLUMNS } from '../src/admin/report.js';

const row = (id, phone, iso, extra = {}) => ({
  id, phone, createdAt: new Date(iso), name: '이름' + id, department: '학과', studentId: '20261234',
  activities: ['futsal'], activityOther: null, days: [], participation: 'regular', seekingFaithCommunity: false, comment: '',
  gender: 'male', ...extra,
});

test('dedupe by phone keeps the latest submission, newest first', () => {
  const rows = [
    row('a', '01011112222', '2026-10-31T01:00:00Z'),
    row('b', '01011112222', '2026-10-31T03:00:00Z'),
    row('c', '01033334444', '2026-10-31T02:00:00Z'),
  ];
  assert.deepEqual(dedupeByPhone(rows).map(r => r.id), ['b', 'c']);
});

test('summary counts unique people per activity, faith yes and gender', () => {
  const s = summarize([
    row('a', '1', '2026-10-31T01:00:00Z', { activities: ['futsal', 'book-club'], seekingFaithCommunity: true }),
    row('b', '2', '2026-10-31T02:00:00Z', { activities: ['futsal'], gender: 'female' }),
    row('c', '3', '2026-10-31T03:00:00Z', { activities: ['futsal'], gender: 'female' }),
    row('d', '4', '2026-10-31T04:00:00Z', { activities: ['futsal'], gender: undefined }), // before the 성별 question
  ]);
  assert.equal(s.respondents, 4);
  assert.equal(s.faithYes, 1);
  assert.deepEqual([s.male, s.female], [1, 2]);
  assert.equal(s.activities.find(x => x.id === 'futsal').count, 4);
  assert.equal(s.activities.find(x => x.id === 'book-club').count, 1);
  assert.equal(s.activities.find(x => x.id === 'perfume-workshop').count, 0);
});

test('summary lists activities in booth order with 📝 스터디 모임 for champs-study', () => {
  const s = summarize([row('a', '1', '2026-10-31T01:00:00Z', { activities: ['champs-study'] })]);
  assert.deepEqual(s.activities.slice(4, 9).map(x => [x.id, x.emoji, x.name, x.count]), [
    ['futsal', '⚽', '풋살 모임', 0], ['champs-study', '📝', '스터디 모임', 1], ['edu-volunteer', '✏️', '교육 봉사', 0],
    ['career-mentoring', '💼', '취업 멘토링', 0], ['happy-bridge', '🌱', '해피브릿지', 0],
  ]);
  const cells = toCells(row('a', '1', '2026-10-31T01:00:00Z', { activities: ['champs-study', 'career-mentoring'] }));
  assert.equal(cells[6], '스터디 모임, 취업 멘토링');
  assert.ok(toCsv([row('a', '1', '2026-10-31T01:00:00Z', { activities: ['champs-study'] })]).includes('"스터디 모임"'));
});

test('cells are Korean labels in column order', () => {
  const cells = toCells(row('a', '01012345678', '2026-10-31T05:30:00Z', {
    activities: ['other', 'undecided'], activityOther: '보드게임', days: ['mon', 'flexible'],
    participation: 'info-only', seekingFaithCommunity: true, comment: '궁금',
  }));
  assert.equal(cells.length, COLUMNS.length);
  assert.deepEqual(cells, [
    '2026-10-31 14:30', '이름a', '남', '학과', '20261234', '010-1234-5678', '기타, 아직 고민 중이에요', '보드게임',
    '월, 일정에 따라 달라요', '우선 활동 안내를 받아보고 싶어요', '네', '궁금',
  ]);
  assert.equal(COLUMNS[2], '성별');
  assert.equal(toCells(row('b', '1', '2026-10-31T05:30:00Z', { gender: 'female' }))[2], '여');
  // Responses saved before the 성별 question show a dash, in the table and the CSV.
  const old = row('c', '1', '2026-10-31T05:30:00Z', { gender: undefined });
  assert.equal(toCells(old)[2], '—');
  assert.ok(toCsv([old]).includes('"이름c","—","학과"'));
});

test('CSV has a BOM, quotes cells and defuses formulas', () => {
  const csv = toCsv([row('a', '01012345678', '2026-10-31T05:30:00Z', { name: '=HYPERLINK("x")', comment: 'a,"b"\nc' })]);
  assert.ok(csv.startsWith('﻿"제출 시각","이름","성별","학과"'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes('"a,""b""\nc"'));
  assert.ok(csv.endsWith('\r\n'));
});

test('formatTime uses Korea time', () => {
  assert.equal(formatTime(new Date('2026-10-30T15:05:00Z')), '2026-10-31 00:05');
  assert.equal(formatTime(null), '');
});
