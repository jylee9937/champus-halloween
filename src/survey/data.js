// Survey option data. Ids are part of the Firestore data contract — never rename them.
// Array order is the tile order (Figma S1-A 21:1439) and the order activities are saved in.
// champs-study is shown as '스터디 모임'; only the label and icon changed, the id stays.

export const ACTIVITIES = [
  { id: 'union-worship', emoji: '⛪', name: '캠퍼스 연합예배', intro: '아주대, 경희대, 성균관대, 동남보건대, 수원여대, 한세대 캠퍼스가 연합하여 예배하는 자리!', when: '11월 3일 저녁 7시 30분 · 수원여대 미림관' },
  { id: 'small-group', emoji: '🙏', name: '소그룹 예배', intro: '따뜻한 공동체를 경험하고, 하나님과 친밀해지는 시간!', when: '매주 목요일 7시 · 저녁 식사 제공!' },
  { id: 'book-club', emoji: '📚', name: '독서모임', intro: '자유롭게 책을 읽고 생각을 나누며 함께 성장하는 자기계발 모임!', when: '매주 수·목·토·일 (네 타임 운영)' },
  { id: 'vibe-coding', emoji: '💻', name: '바이브 코딩', intro: 'AI를 활용하는 방법을 배우고, 서로 활용하는 방법을 공유하는 시간', when: '매주 목요일 4시 30분' },
  { id: 'futsal', emoji: '⚽', name: '풋살 모임', intro: '가볍게 공 차면서 스트레스 푸는 시간', when: '매주 토요일 저녁' },
  { id: 'champs-study', emoji: '📝', name: '스터디 모임', intro: '함께 밥 먹고, 각자의 공부·과제·할 일을 해요. 누구나 부담 없이 편하게 함께해요!', when: '매주 화요일 저녁 7시 30분' },
  { id: 'edu-volunteer', emoji: '✏️', name: '교육 봉사', intro: '교육 봉사를 통해 자아를 실현하고, 사랑을 전하는 시간', when: '매주 1회 · 수원 지역 아동센터' },
  { id: 'career-mentoring', emoji: '💼', name: '취업 멘토링', intro: '진로와 취업에 대한 고민을 나누고 함께 준비하는 시간!', when: '일정은 신청자들과 조율 예정' },
  { id: 'happy-bridge', emoji: '🌱', name: '해피브릿지', intro: '맛있는 저녁과 함께 또래 대학생들과 삶을 나누고 친해지는 시간!', when: '매주 토요일 저녁 7시 30분' },
  { id: 'perfume-workshop', emoji: '🌸', name: '향수공방', intro: '나만의 향수를 만들어 보는 특별한 시간!', when: '일정은 신청자들과 조율 예정' },
  { id: 'undecided', emoji: '🤔', name: '아직 고민 중이에요', exclusive: true },
  { id: 'other', emoji: '✍️', name: '기타', needsText: true },
];

export const DAYS = [
  { id: 'mon', label: '월' },
  { id: 'tue', label: '화' },
  { id: 'wed', label: '수' },
  { id: 'thu', label: '목' },
  { id: 'fri', label: '금' },
  { id: 'sat', label: '토' },
  { id: 'sun', label: '일' },
];
export const FLEXIBLE = { id: 'flexible', label: '일정에 따라 달라요' };

export const PARTICIPATION = [
  { id: 'regular', label: '정기적으로 함께하고 싶어요' },
  { id: 'occasional', label: '일정이 맞는 활동에 가끔 참여하고 싶어요' },
  { id: 'info-only', label: '우선 활동 안내를 받아보고 싶어요' },
];

export const activityName = id => ACTIVITIES.find(a => a.id === id)?.name ?? id;
export const dayLabel = id => (id === FLEXIBLE.id ? FLEXIBLE.label : DAYS.find(d => d.id === id)?.label ?? id);
export const participationLabel = id => PARTICIPATION.find(p => p.id === id)?.label ?? id ?? '';
