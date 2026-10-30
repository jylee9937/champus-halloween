import { test, expect } from './fixtures.js';

const response = (id, extra = {}) => ({
  id, schemaVersion: 1, activities: ['futsal'], activityOther: null, days: [],
  participation: 'regular', seekingFaithCommunity: false, comment: '', consent: true,
  name: '이름' + id, department: '학과', studentId: '20261234', phone: '01011112222',
  createdAt: '2026-10-30T01:00:00Z', expireAt: '2027-10-30T01:00:00Z', ...extra,
});
const seeds = [
  response('old', { name: '이전응답', seekingFaithCommunity: true, activities: ['perfume-workshop'], gender: 'male' }),
  response('other', {
    name: '박다른', phone: '01033334444', studentId: '20260002',
    activities: ['futsal', 'other'], activityOther: '보드게임', days: ['flexible'], participation: 'info-only',
    createdAt: '2026-10-30T02:00:00Z',
  }),
  response('latest', {
    name: '김최신', department: '소프트웨어학과', activities: ['book-club', 'futsal', 'champs-study'],
    days: ['mon', 'sat'], seekingFaithCommunity: true, comment: '최신 의견', createdAt: '2026-10-30T03:00:00Z',
    gender: 'female',
  }),
];
// '박다른' was saved before the 성별 question existed, so it has no gender.

test.use({ mockOptions: { responses: seeds } });

async function login(page) {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Google로 로그인' }).click();
  await expect(page.getByRole('heading', { name: '🐑 챔퍼스 설문 응답' })).toBeVisible();
}

const rows = page => page.getByRole('table').locator('tbody').getByRole('row');

test('SC-45 로그인 전에는 설문 데이터·관리자 조회·삭제 요청 없음', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  expect(await page.evaluate(() => window.__e2e.calls.map(c => c.op))).toEqual(['initializeApp', 'watchAuth']);
  // Decorative lamb, not a pumpkin, on the admin gate and tab icon.
  await expect(page.locator('.adm-logo')).toHaveText('🐑');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /🐑/);
});

test('SC-46 비관리자 접근 거절·데이터 미조회·로그아웃', async ({ page }) => {
  await page.goto('/admin');
  await page.evaluate(() => { window.__e2e.signInEmail = 'student@example.test'; });
  await page.getByRole('button', { name: 'Google로 로그인' }).click();
  await expect(page.getByRole('heading', { name: '관리자 권한이 없어요' })).toBeVisible();
  await expect(page.getByText('student@example.test 계정은 관리자로 등록되어 있지 않아요.')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  const calls = await page.evaluate(() => window.__e2e.calls);
  expect(calls.filter(c => c.op === 'isAdmin')).toEqual([{ op: 'isAdmin', email: 'student@example.test' }]);
  expect(calls.some(c => ['fetchResponses', 'purgeQuery', 'purgeCommit'].includes(c.op))).toBe(false);
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible();
});

test('SC-47 관리자 허용 목록 확인 후 정리·조회, 로그아웃 시 개인정보 제거', async ({ page }) => {
  await login(page);
  const state = await page.evaluate(() => window.__e2e);
  expect(state.authParameters).toEqual({ prompt: 'select_account' });
  expect(state.calls.filter(c => ['signIn', 'isAdmin', 'purgeQuery', 'fetchResponses'].includes(c.op)).map(c => c.op))
    .toEqual(['signIn', 'isAdmin', 'purgeQuery', 'fetchResponses']);
  expect(state.calls.find(c => c.op === 'isAdmin').email).toBe('admin@example.test');
  await expect(page.getByText('admin@example.test', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByText('김최신', { exact: true })).toHaveCount(0);
});

test.describe('이미 로그인한 관리자', () => {
  test.use({ mockOptions: { responses: seeds, user: { email: 'admin@example.test' } } });
  test('SC-48 기존 로그인 상태에서 /admin 바로 열기', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: '🐑 챔퍼스 설문 응답' })).toBeVisible();
    await expect(rows(page)).toHaveCount(2);
    expect(await page.evaluate(() => window.__e2e.calls.some(c => c.op === 'signIn'))).toBe(false);
  });
});

test('SC-49 전화번호 기준 최신 응답·중복 토글·최신순·배지', async ({ page }) => {
  await login(page);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText('김최신');
  await expect(rows(page).nth(1)).toContainText('박다른');
  // 성별 column right after 이름: 여 for the new response, — for the one saved before the question.
  await expect(page.getByRole('columnheader').nth(2)).toHaveText('성별');
  await expect(rows(page).nth(0).getByRole('cell').nth(2)).toHaveText('여');
  await expect(rows(page).nth(1).getByRole('cell').nth(2)).toHaveText('—');
  await expect(page.getByRole('table')).not.toContainText('이전응답');
  await expect(page.getByText('2건 표시', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /중복 응답도 보기/ }).check();
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(2)).toContainText('이전응답');
  await expect(rows(page).nth(2)).toContainText('중복');
  await expect(rows(page).nth(2).getByRole('cell').nth(2)).toHaveText('남');
  await expect(page.getByText('3건 표시', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /중복 응답도 보기/ }).uncheck();
  await expect(rows(page)).toHaveCount(2);
});

test('SC-50 요약은 중복 제외 응답자·성별·신앙 네·활동별 인원, 토글해도 유지', async ({ page }) => {
  await login(page);
  const summary = page.getByRole('region', { name: '요약' });
  for (const showDupes of [false, true]) {
    await page.getByRole('checkbox', { name: /중복 응답도 보기/ }).setChecked(showDupes);
    await expect(summary.getByText('응답자', { exact: true }).locator('..')).toContainText('2명');
    await expect(summary.getByText("신앙 공동체 '네'", { exact: true }).locator('..')).toContainText('1명');
    // Unique respondents only: the superseded '남' response does not count; 박다른 predates the question.
    const genders = summary.getByText('성별', { exact: true }).locator('..');
    await expect(genders.locator('b')).toHaveText('남 0 · 여 1');
    await expect(genders).toContainText('성별 없는 이전 응답 1명');
    for (const [name, count] of [['독서모임', 1], ['풋살 모임', 2], ['스터디 모임', 1], ['기타', 1], ['향수공방', 0], ['아직 고민 중이에요', 0]]) {
      await expect(summary.getByRole('listitem').filter({ hasText: name })).toHaveText(new RegExp(name + '\\s*' + count + '$'));
    }
    // Booth order (Figma S1-A), with champs-study shown as 📝 스터디 모임 and happy-bridge as 🌱.
    await expect(summary.getByRole('listitem')).toHaveText([
      '⛪ 캠퍼스 연합예배', '🙏 소그룹 예배', '📚 독서모임', '💻 바이브 코딩', '⚽ 풋살 모임', '📝 스터디 모임',
      '✏️ 교육 봉사', '💼 취업 멘토링', '🌱 해피브릿지', '🌸 향수공방', '🤔 아직 고민 중이에요', '✍️ 기타',
    ].map(label => new RegExp('^' + label + '\\s*\\d+$')));
    await expect(summary).not.toContainText("챔'S");
  }
});

test('SC-51 CSV 실제 다운로드·UTF-8 BOM·한국어·따옴표·개행·수식 방지·항상 중복 제외', async ({ page }) => {
  await page.goto('/admin');
  await page.evaluate(() => {
    const other = window.__e2e.responses.find(r => r.id === 'other');
    other.name = '=HYPERLINK("x")';
    other.comment = '첫 줄,"인용"\n다음 줄';
  });
  await page.getByRole('button', { name: 'Google로 로그인' }).click();
  await expect(rows(page)).toHaveCount(2);
  const header = '"제출 시각","이름","성별","학과","학번","연락처","활동","기타 활동","요일","참여 방식","신앙 공동체","궁금한 점"';
  const expected = '\uFEFF' + [
    header,
    '"2026-10-30 12:00","김최신","여","소프트웨어학과","20261234","010-1111-2222","독서모임, 풋살 모임, 스터디 모임","","월, 토","정기적으로 함께하고 싶어요","네","최신 의견"',
    '"2026-10-30 11:00","\'=HYPERLINK(""x"")","—","학과","20260002","010-3333-4444","풋살 모임, 기타","보드게임","일정에 따라 달라요","우선 활동 안내를 받아보고 싶어요","아니요","첫 줄,""인용""\n다음 줄"',
    '',
  ].join('\r\n');
  for (const includeDupes of [false, true]) {
    await page.getByRole('checkbox', { name: /중복 응답도 보기/ }).setChecked(includeDupes);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '엑셀(CSV) 다운로드' }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('champus-responses-2026-10-31.csv');
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    expect([...bytes.subarray(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
    expect(bytes.toString('utf8')).toBe(expected);
  }
});

test('SC-52 만료 정리·10분 시계 오차 경계·알림·유효 응답 보존', async ({ page }) => {
  await page.goto('/admin');
  await page.evaluate(() => {
    const base = window.__e2e.responses[0];
    const now = Date.now();
    window.__e2e.responses = [
      ...window.__e2e.responses,
      ...[
        ['expired', now - 365 * 24 * 60 * 60 * 1000], ['before-cutoff', now - 600_001],
        ['at-cutoff', now - 600_000], ['recently-expired', now - 1], ['future', now + 1], ['no-expiry', null],
      ].map(([id, ms], i) => ({ ...base, id, name: id, phone: '0109999000' + i, expireAt: ms == null ? null : new Date(ms).toISOString() })),
    ];
  });
  await page.getByRole('button', { name: 'Google로 로그인' }).click();
  await expect(page.getByRole('status')).toHaveText('🧹 1년 지난 응답 2개를 정리했어요');
  await expect(rows(page)).toHaveCount(6);
  const state = await page.evaluate(() => window.__e2e);
  expect(state.purgedIds).toEqual(['expired', 'before-cutoff']);
  expect(state.calls.find(c => c.op === 'purgeQuery').constraints).toEqual([
    { field: 'expireAt', op: '<', value: Date.parse('2026-10-31T05:20:00Z') },
  ]);
  expect(state.calls.filter(c => ['purgeQuery', 'purgeCommit', 'fetchResponses'].includes(c.op)).map(c => c.op))
    .toEqual(['purgeQuery', 'purgeCommit', 'fetchResponses']);
  await expect(page.getByRole('table')).toContainText('recently-expired');
  await expect(page.getByRole('table')).toContainText('at-cutoff');
});

test('SC-53 만료 정리 실패 시 응답 화면은 계속 표시', async ({ page }) => {
  await page.goto('/admin');
  await page.evaluate(() => {
    window.__e2e.purgeError = true;
    window.__e2e.responses[0].expireAt = '2025-01-01T00:00:00Z';
  });
  await page.getByRole('button', { name: 'Google로 로그인' }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(await page.evaluate(() => window.__e2e.purgedIds)).toEqual([]);
  expect(await page.evaluate(() => window.__e2e.calls.some(c => c.op === 'fetchResponses'))).toBe(true);
});

test.describe('조회 실패', () => {
  test.use({ mockOptions: { user: { email: 'admin@example.test' }, responses: seeds } });
  test('SC-54 조회 실패와 다시 시도', async ({ page }) => {
    await page.goto('/admin');
    await expect(rows(page)).toHaveCount(2);
    await page.evaluate(() => { window.__e2e.fetchError = true; });
    await page.getByRole('button', { name: '새로고침', exact: true }).click();
    await expect(page.getByRole('heading', { name: '문제가 생겼어요' })).toBeVisible();
    // Reload receives the healthy initial mock seed, matching a recovered backend.
    await page.getByRole('button', { name: '다시 시도' }).click();
    await expect(rows(page)).toHaveCount(2);
  });
});

for (const code of ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/network-request-failed']) {
  test(`SC-55 Google 로그인 취소·실패 ${code}`, async ({ page }) => {
    await page.goto('/admin');
    await page.evaluate(value => { window.__e2e.signInError = value; }, code);
    await page.getByRole('button', { name: 'Google로 로그인' }).click();
    if (code === 'auth/network-request-failed') {
      await expect(page.getByText('로그인에 실패했어요: ' + code, { exact: true })).toBeVisible();
    } else {
      await expect.poll(() => page.evaluate(() => window.__e2e.calls.filter(c => c.op === 'signIn').length)).toBe(1);
      await expect(page.getByText(/로그인에 실패했어요:/)).toBeHidden();
    }
    await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
  });
}

test('SC-56 새로고침 버튼은 새 응답·요약 갱신', async ({ page }) => {
  await login(page);
  await page.evaluate(() => {
    const base = window.__e2e.responses[0];
    window.__e2e.responses.push({ ...base, id: 'new', phone: '01055556666', name: '신규', createdAt: '2026-10-31T05:00:00Z' });
  });
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).first()).toContainText('신규');
  await expect(page.getByRole('region', { name: '요약' }).getByText('응답자', { exact: true }).locator('..')).toContainText('3명');
});

test.describe('응답 없음', () => {
  test.use({ mockOptions: { responses: [] } });
  test('SC-57 빈 목록·0명·CSV 비활성·정리 알림 없음', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('table')).toContainText('아직 응답이 없어요');
    await expect(page.getByText('0건 표시', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '엑셀(CSV) 다운로드' })).toBeDisabled();
    await expect(page.getByRole('region', { name: '요약' }).getByText('응답자', { exact: true }).locator('..')).toContainText('0명');
    await expect(page.getByRole('status')).toHaveCount(0);
    expect(await page.evaluate(() => window.__e2e.calls.filter(c => c.op === 'purgeCommit'))).toEqual([]);
  });
});

test('SC-58 관리자 사용자 입력은 HTML로 실행하지 않고 표시', async ({ page }) => {
  await page.goto('/admin');
  await page.evaluate(() => {
    window.__e2e.responses.find(r => r.id === 'latest').name = '<img src=x onerror=alert(1)>';
    window.__e2e.responses.find(r => r.id === 'latest').comment = '<script>alert(1)</script>';
  });
  await page.getByRole('button', { name: 'Google로 로그인' }).click();
  await expect(page.getByRole('table')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.getByRole('table')).toContainText('<script>alert(1)</script>');
  await expect(page.getByRole('table').locator('img, script')).toHaveCount(0);
});
