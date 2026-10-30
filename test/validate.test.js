import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyAnswers, toggleActivity, toggleDay, activitiesComplete, isValidStudentId, studentIdHasError,
  isValidPhone, phoneDigits, formatPhone, buildPayload, payloadErrors,
} from '../src/lib/validate.js';
import { ACTIVITIES, activityName } from '../src/survey/data.js';

const filled = () => ({
  ...emptyAnswers(),
  activities: ['futsal', 'book-club'], days: ['sat', 'mon'], participation: 'regular', seekingFaithCommunity: false,
  comment: '  궁금해요  ', name: ' 테스트 ', department: '소프트웨어학과', studentId: '00', phone: '010-0000-0000',
});

test('undecided is exclusive with every other activity', () => {
  assert.deepEqual(toggleActivity(['futsal', 'other'], 'undecided'), ['undecided']);
  assert.deepEqual(toggleActivity(['undecided'], 'futsal'), ['futsal']);
  assert.deepEqual(toggleActivity(['futsal'], 'futsal'), []);
  assert.deepEqual(toggleActivity(['futsal'], 'futsal', true), ['futsal']);
});

test('flexible is exclusive with weekdays', () => {
  assert.deepEqual(toggleDay(['mon', 'tue'], 'flexible'), ['flexible']);
  assert.deepEqual(toggleDay(['flexible'], 'wed'), ['wed']);
  assert.deepEqual(toggleDay(['wed'], 'wed'), []);
});

test('기타 needs text', () => {
  const a = { ...emptyAnswers(), activities: ['other'] };
  assert.equal(activitiesComplete(a), false);
  assert.equal(activitiesComplete({ ...a, activityOther: '   ' }), false);
  assert.equal(activitiesComplete({ ...a, activityOther: '보드게임' }), true);
  assert.equal(activitiesComplete({ ...a, activityOther: 'x'.repeat(101) }), false);
});

test('student id: 2–9 digits', () => {
  assert.equal(isValidStudentId('0'), false);
  assert.equal(isValidStudentId('00'), true);
  assert.equal(isValidStudentId('202612345'), true);
  assert.equal(isValidStudentId('2026123456'), false);
  assert.equal(studentIdHasError('2026'), false);
  assert.equal(studentIdHasError('2026a'), true);
  assert.equal(studentIdHasError('2026123456'), true);
});

test('phone digits and display', () => {
  assert.equal(phoneDigits('010-1234-5678'), '01012345678');
  assert.equal(phoneDigits('+82 10-1234-5678'), '01012345678');
  assert.equal(phoneDigits('0101234567899'), '01012345678');
  assert.equal(formatPhone('010'), '010');
  assert.equal(formatPhone('0101'), '010-1');
  assert.equal(formatPhone('0101234'), '010-1234');
  assert.equal(formatPhone('01012345'), '010-1234-5');
  assert.equal(formatPhone('01012345678'), '010-1234-5678');
  assert.equal(formatPhone('0111234567'), '011-123-4567');
  assert.equal(isValidPhone('01012345678'), true);
  assert.equal(isValidPhone('0111234567'), true);
  assert.equal(isValidPhone('0101234567'), true);
  assert.equal(isValidPhone('02123456789'), false);
});

test('payload matches the data contract exactly', () => {
  const p = buildPayload(filled());
  assert.deepEqual(p, {
    activities: ['book-club', 'futsal'],
    activityOther: null,
    days: ['mon', 'sat'],
    participation: 'regular',
    seekingFaithCommunity: false,
    comment: '궁금해요',
    name: '테스트',
    department: '소프트웨어학과',
    studentId: '00',
    phone: '01000000000',
  });
  assert.equal('consent' in p, false, 'the consent screen is gone, so consent is not sent');
  assert.deepEqual(payloadErrors(p), []);
});

test('activities follow the booth order; champs-study keeps its id and shows as 스터디 모임', () => {
  assert.deepEqual(ACTIVITIES.map(a => a.id), [
    'union-worship', 'small-group', 'book-club', 'vibe-coding', 'futsal', 'champs-study',
    'edu-volunteer', 'career-mentoring', 'happy-bridge', 'perfume-workshop', 'undecided', 'other',
  ]);
  assert.equal(activityName('champs-study'), '스터디 모임');
  const emoji = id => ACTIVITIES.find(a => a.id === id).emoji;
  assert.deepEqual(['champs-study', 'happy-bridge', 'edu-volunteer'].map(emoji), ['📝', '🌱', '✏️']);
  const p = buildPayload({ ...filled(), activities: ['career-mentoring', 'edu-volunteer', 'champs-study', 'futsal'] });
  assert.deepEqual(p.activities, ['futsal', 'champs-study', 'edu-volunteer', 'career-mentoring']);
  assert.deepEqual(payloadErrors(p), []);
});

test('activityOther is sent only when 기타 is selected', () => {
  const withOther = buildPayload({ ...filled(), activities: ['other'], activityOther: ' 보드게임 ' });
  assert.equal(withOther.activityOther, '보드게임');
  assert.deepEqual(payloadErrors(withOther), []);
  const without = buildPayload({ ...filled(), activityOther: '남은 글자' });
  assert.equal(without.activityOther, null);
});

test('payloadErrors catches contract violations', () => {
  const p = buildPayload(filled());
  assert.deepEqual(payloadErrors({ ...p, consent: true }), ['keys'], 'a stray consent field breaks the contract');
  assert.deepEqual(payloadErrors({ ...p, activities: [] }), ['activities']);
  assert.deepEqual(payloadErrors({ ...p, activities: ['nope'] }), ['activities']);
  assert.deepEqual(payloadErrors({ ...p, activities: ['other'], activityOther: null }), ['activityOther']);
  assert.deepEqual(payloadErrors({ ...p, days: ['mon', 'mon'] }), ['days']);
  assert.deepEqual(payloadErrors({ ...p, studentId: '1' }), ['studentId']);
  assert.deepEqual(payloadErrors({ ...p, phone: '010-0000-0000' }), ['phone']);
  assert.deepEqual(payloadErrors({ ...p, extra: 1 }), ['keys']);
  assert.deepEqual(payloadErrors({ ...p, comment: 'x'.repeat(1001) }), ['comment']);
});
