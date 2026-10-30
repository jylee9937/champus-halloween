// Answer rules and the Firestore payload builder. Pure functions — no DOM — so they run under `node --test`.
import { ACTIVITIES, DAYS, FLEXIBLE, PARTICIPATION } from '../survey/data.js';

export const LIMITS = { activityOther: 100, comment: 1000, name: 30, department: 50 };

const ACTIVITY_IDS = ACTIVITIES.map(a => a.id);
const DAY_IDS = [...DAYS.map(d => d.id), FLEXIBLE.id];
const PARTICIPATION_IDS = PARTICIPATION.map(p => p.id);

const STUDENT_ID_RE = /^[0-9]{2,9}$/;
const PHONE_RE = /^01[0-9]{8,9}$/;

const within = (s, max) => s.length >= 1 && s.length <= max;

export const isValidName = v => within(v.trim(), LIMITS.name);
export const isValidDepartment = v => within(v.trim(), LIMITS.department);
export const isValidStudentId = v => STUDENT_ID_RE.test(v);
// Show the red error as soon as the input can no longer become valid (letters, or more than 9 digits).
export const studentIdHasError = v => /\D/.test(v) || v.length > 9;
export const isValidPhone = digits => PHONE_RE.test(digits);

// Keeps digits only, maps an autofilled +82 number back to 0…, caps at 11 digits.
export function phoneDigits(v) {
  let d = String(v).replace(/\D/g, '');
  const intl = d.match(/^82(1\d{8,9})$/);
  if (intl) d = '0' + intl[1];
  return d.slice(0, 11);
}

// 010-1234-5678 while typing; ten-digit legacy numbers become 011-123-4567.
export function formatPhone(d) {
  if (d.length < 4) return d;
  if (d.length === 10 && !d.startsWith('010')) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

export function emptyAnswers() {
  return {
    activities: [], activityOther: '', days: [], participation: null, seekingFaithCommunity: null,
    comment: '', name: '', department: '', studentId: '', phone: '',
  };
}

// Toggling keeps "아직 고민 중이에요" exclusive with every other activity.
export function toggleActivity(list, id, on = !list.includes(id)) {
  if (!on) return list.filter(x => x !== id);
  if (list.includes(id)) return list;
  const exclusive = ACTIVITIES.find(a => a.id === id)?.exclusive;
  if (exclusive) return [id];
  return [...list.filter(x => !ACTIVITIES.find(a => a.id === x)?.exclusive), id];
}

// "일정에 따라 달라요" is exclusive with the weekdays.
export function toggleDay(list, id) {
  if (list.includes(id)) return list.filter(x => x !== id);
  if (id === FLEXIBLE.id) return [id];
  return [...list.filter(x => x !== FLEXIBLE.id), id];
}

export const activitiesComplete = a =>
  a.activities.length > 0 && (!a.activities.includes('other') || within(a.activityOther.trim(), LIMITS.activityOther));

const ordered = (ids, order) => [...ids].sort((x, y) => order.indexOf(x) - order.indexOf(y));

// Exactly the client-written fields of the data contract; firebase.js adds schemaVersion, createdAt and expireAt.
export function buildPayload(a) {
  return {
    activities: ordered(a.activities, ACTIVITY_IDS),
    activityOther: a.activities.includes('other') ? a.activityOther.trim() : null,
    days: ordered(a.days, DAY_IDS),
    participation: a.participation,
    seekingFaithCommunity: a.seekingFaithCommunity,
    comment: a.comment.trim(),
    name: a.name.trim(),
    department: a.department.trim(),
    studentId: a.studentId,
    phone: phoneDigits(a.phone),
  };
}

const PAYLOAD_KEYS = ['activities', 'activityOther', 'days', 'participation', 'seekingFaithCommunity', 'comment', 'name', 'department', 'studentId', 'phone'];

// Returns the names of fields that break the contract (empty when the payload is good to send).
export function payloadErrors(p) {
  const bad = [];
  const keys = Object.keys(p);
  if (keys.length !== PAYLOAD_KEYS.length || !PAYLOAD_KEYS.every(k => keys.includes(k))) bad.push('keys');
  const acts = p.activities;
  if (!Array.isArray(acts) || acts.length < 1 || acts.length > ACTIVITY_IDS.length || new Set(acts).size !== acts.length
    || !acts.every(x => ACTIVITY_IDS.includes(x))) bad.push('activities');
  if (acts?.includes?.('other')
    ? !(typeof p.activityOther === 'string' && within(p.activityOther, LIMITS.activityOther))
    : p.activityOther !== null) bad.push('activityOther');
  if (!Array.isArray(p.days) || p.days.length > DAY_IDS.length || new Set(p.days).size !== p.days.length
    || !p.days.every(x => DAY_IDS.includes(x))) bad.push('days');
  if (!PARTICIPATION_IDS.includes(p.participation)) bad.push('participation');
  if (typeof p.seekingFaithCommunity !== 'boolean') bad.push('seekingFaithCommunity');
  if (typeof p.comment !== 'string' || p.comment.length > LIMITS.comment) bad.push('comment');
  if (typeof p.name !== 'string' || !within(p.name, LIMITS.name)) bad.push('name');
  if (typeof p.department !== 'string' || !within(p.department, LIMITS.department)) bad.push('department');
  if (typeof p.studentId !== 'string' || !STUDENT_ID_RE.test(p.studentId)) bad.push('studentId');
  if (typeof p.phone !== 'string' || !PHONE_RE.test(p.phone)) bad.push('phone');
  return bad;
}
