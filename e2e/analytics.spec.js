import { test, expect, activity, next, submit, savedCoupon, LESSON_CTA } from './fixtures.js';

// Analytics is off in e2e mode unless a test opts in with mockOptions { analytics: true };
// writes then go to the SDK mock (window.__e2e.sessionWrites / sessions), never to Firebase.

async function surveyToPhone(page) {
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await page.getByRole('radio', { name: '정기적으로 함께하고 싶어요' }).click();
  await next(page);
  await page.getByRole('radio', { name: /아니요/ }).click();
  await next(page);
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await page.getByRole('button', { name: '동의하고 계속' }).click();
  await page.getByRole('textbox', { name: '이름', exact: true }).fill('김챔퍼스');
  await next(page);
  await page.getByRole('textbox', { name: '학과', exact: true }).fill('소프트웨어학과');
  await next(page);
  await page.getByRole('textbox', { name: '학번', exact: true }).fill('20261234');
  await next(page);
}

test.describe('분석 기록 켬', () => {
  test.use({ mockOptions: { analytics: true } });

  test('SC-A1 방문 한 번은 sessions 문서 하나를 만들고 같은 문서를 갱신', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '설문 시작하기' }).click();
    await page.getByRole('button', { name: '풋살 모임 소개 보기', exact: true }).click();
    await page.getByRole('dialog', { name: '풋살 모임' }).getByRole('button', { name: '이 활동 고르기' }).click();
    await page.getByRole('button', { name: '독서모임 소개 보기', exact: true }).click();
    await page.getByRole('dialog', { name: '독서모임' }).getByRole('button', { name: '닫기', exact: true }).click();
    await expect(activity(page, '풋살 모임')).toHaveAttribute('aria-pressed', 'true');
    await next(page);
    await surveyToPhone(page);
    await submit(page);
    await page.getByRole('button', { name: LESSON_CTA, exact: true }).click();
    await page.getByRole('button', { name: '시작하기' }).click();

    await expect.poll(() => page.evaluate(() => window.__e2e.sessions?.[0]?.lastScreen), { timeout: 5000 }).toBe('l2');
    const { sessions, sessionWrites } = await page.evaluate(() => window.__e2e);
    expect(sessions).toHaveLength(1);
    const [doc] = sessions;
    expect(doc.id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(new Set(sessionWrites.map(w => w.id))).toEqual(new Set([doc.id]));
    expect(sessionWrites.map(w => w.merge)).toEqual([false, ...sessionWrites.slice(1).map(() => true)]);
    // Create carries all 15 fields (the sid is the doc ID); updates never touch startedAt/expireAt.
    expect(Object.keys(sessionWrites[0].data)).toHaveLength(15);
    expect(sessionWrites[0].data).not.toHaveProperty('sid');
    expect(sessionWrites[0].data.startedAt).toEqual({ __type: 'serverTimestamp' });
    expect(sessionWrites[0].data.expireAt).toEqual({ ms: sessionWrites[0].at + 365 * 24 * 60 * 60 * 1000 });
    for (const w of sessionWrites.slice(1)) {
      expect(w.data).not.toHaveProperty('startedAt');
      expect(w.data).not.toHaveProperty('expireAt');
      expect(w.data.updatedAt).toEqual({ __type: 'serverTimestamp' });
    }
    expect(doc).toMatchObject({
      schemaVersion: 1, lastScreen: 'l2', maxSurveyStep: 11, maxLessonStep: 2, lessonCompleted: false,
      lessonRestarts: 0, submitAttempts: 1, submitFailures: 0, submitted: true,
      instagramClicks: { done: 0, lessonEnd: 0 },
    });
    expect(doc.infoOpens).toMatchObject({ futsal: 1, 'book-club': 1, 'union-worship': 0 });
    expect(Object.keys(doc.infoOpens)).toHaveLength(10);
    expect(doc.infoSelects).toMatchObject({ futsal: 1, 'book-club': 0 });
    // Debounced: far fewer writes than screens + clicks.
    expect(sessionWrites.length).toBeLessThan(20);
    // No personal data anywhere in analytics.
    const blob = JSON.stringify({ sessions, sessionWrites });
    for (const secret of ['김챔퍼스', '소프트웨어학과', '20261234', '01012345678']) expect(blob).not.toContain(secret);
    const stored = await page.evaluate(() => sessionStorage.getItem('champus:analytics'));
    for (const secret of ['김챔퍼스', '20261234', '01012345678']) expect(stored).not.toContain(secret);
  });

  test('SC-A4 화면 이동과 ⓘ 열기는 병합 갱신 하나로 기록', async ({ page }) => {
    await page.goto('/');
    // S0 view → the create write.
    await expect.poll(() => page.evaluate(() => window.__e2e.sessionWrites?.length ?? 0)).toBe(1);
    await page.getByRole('button', { name: '설문 시작하기' }).click();
    await page.getByRole('button', { name: '풋살 모임 소개 보기', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '풋살 모임' })).toBeVisible();
    // The S1 view and the ⓘ open go out as merges (normally one, debounced; a slow runner may split them).
    await expect.poll(() => page.evaluate(() => window.__e2e.sessionWrites.at(-1).data.infoOpens.futsal)).toBe(1);
    const writes = await page.evaluate(() => window.__e2e.sessionWrites);
    const [create] = writes, update = writes.at(-1);
    expect(writes.length).toBeLessThanOrEqual(3);
    expect(writes.slice(1).every(w => w.id === create.id && w.merge)).toBe(true);
    const zeros = Object.fromEntries(INFO.map(id => [id, 0]));
    expect(update.data).toEqual({
      schemaVersion: 1, lastScreen: 's1', maxSurveyStep: 1, maxLessonStep: 0, lessonCompleted: false,
      lessonRestarts: 0, submitAttempts: 0, submitFailures: 0, submitted: false,
      infoOpens: { ...zeros, futsal: 1 }, infoSelects: zeros, instagramClicks: { done: 0, lessonEnd: 0 },
      updatedAt: { __type: 'serverTimestamp' },
    });
    // The merged doc keeps the create-only fields.
    const [doc] = await page.evaluate(() => window.__e2e.sessions);
    expect(doc).toMatchObject({ startedAt: { __type: 'serverTimestamp' }, lastScreen: 's1', infoOpens: { futsal: 1 } });
    expect(doc.expireAt).toEqual(create.data.expireAt);
  });

  test('SC-A5 S10 인스타·수업 시작·끝 화면 인스타·다시 보기를 기록', async ({ page }) => {
    const correct = { 2: '10월 31일 밤', 7: '믿음의 선배들을 기억하며 기도했다', 9: '모든 성인의 날, 그 전날 밤' };
    const openPopup = async click => {
      const popup = page.waitForEvent('popup');
      await click();
      await (await popup).close();
    };
    await savedCoupon(page);
    await openPopup(() => page.getByRole('link', { name: '📷 인스타그램 @champus_ajou' }).click());
    await page.getByRole('button', { name: LESSON_CTA, exact: true }).click();
    for (let step = 0; step < 10; step++) {
      if (correct[step]) {
        await page.getByRole('button', { name: new RegExp(correct[step] + '$') }).click();
        await page.getByRole('button', { name: '계속', exact: true }).click();
      } else {
        await page.locator('footer').getByRole('button').first().click();
      }
    }
    await openPopup(() => page.getByRole('button', { name: '챔퍼스 인스타 둘러보기 📷' }).click());
    await page.getByRole('button', { name: '할로윈 이야기 다시 보기' }).click();
    await expect(page.getByRole('heading', { name: /할로윈의.*진짜 뜻/ })).toBeVisible();

    // Stats are absolute values, so the latest write carries the whole story.
    await expect.poll(() => page.evaluate(() => window.__e2e.sessionWrites?.at(-1)?.data.lessonRestarts)).toBe(1);
    const last = await page.evaluate(() => window.__e2e.sessionWrites.at(-1).data);
    expect(last).toMatchObject({
      lastScreen: 'l1', maxSurveyStep: 11, maxLessonStep: 11, lessonCompleted: true, lessonRestarts: 1,
      instagramClicks: { done: 1, lessonEnd: 1 },
    });
  });
});

test('SC-A2 e2e 기본값은 분석 기록 끔: 문서·저장소 쓰기 없음', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '설문 시작하기' }).click();
  await page.getByRole('button', { name: '풋살 모임 소개 보기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '풋살 모임' })).toBeVisible();
  // With analytics on, the first screen view persists its state synchronously, so absence here is conclusive.
  expect(await page.evaluate(() => window.__storageWrites.filter(w => w.key === 'champus:analytics'))).toEqual([]);
  expect(await page.evaluate(() => window.__e2e.sessionWrites ?? [])).toEqual([]);
});

const today = '2026-10-31T01:00:00Z'; // 10:00 KST, the fixture's fixed day
const yesterday = '2026-10-30T10:00:00Z';
const zeros = ids => Object.fromEntries(ids.map(id => [id, 0]));
const INFO = ['union-worship', 'small-group', 'book-club', 'vibe-coding', 'futsal', 'career-mentoring', 'edu-volunteer', 'champs-study', 'happy-bridge', 'perfume-workshop'];
const session = (id, over = {}) => ({
  id, sid: id, schemaVersion: 1, startedAt: today, updatedAt: today, expireAt: '2027-10-31T01:00:00Z',
  lastScreen: 's0', maxSurveyStep: 0, maxLessonStep: 0, lessonCompleted: false, lessonRestarts: 0,
  submitAttempts: 0, submitFailures: 0, submitted: false,
  instagramClicks: { done: 0, lessonEnd: 0 }, ...over,
  infoOpens: { ...zeros(INFO), ...over.infoOpens }, infoSelects: { ...zeros(INFO), ...over.infoSelects },
});

test.describe('관리자 분석 탭', () => {
  test.use({ mockOptions: {
    user: { email: 'admin@example.test' },
    sessions: [
      session('a', { maxSurveyStep: 0 }),
      session('b', { maxSurveyStep: 1, infoOpens: { futsal: 2 } }),
      session('c', { maxSurveyStep: 11, submitted: true, submitAttempts: 2, submitFailures: 1, maxLessonStep: 11, lessonCompleted: true,
        infoOpens: { futsal: 1, 'book-club': 1 }, infoSelects: { futsal: 1 }, instagramClicks: { done: 1, lessonEnd: 1 } }),
      session('d', { maxSurveyStep: 11, submitted: true, submitAttempts: 1, maxLessonStep: 3 }),
      session('old', { startedAt: yesterday, maxSurveyStep: 2 }),
      session('expired', { startedAt: '2025-10-01T00:00:00Z', expireAt: '2026-10-01T00:00:00Z' }),
    ],
  } });

  test('SC-A3 분석 탭: 지연 조회, 오늘/전체, 퍼널, ⓘ 표, 만료 방문 정리', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: '🐑 챔퍼스 설문 응답' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('🧹 1년 지난 방문 기록 1개를 정리했어요');
    expect(await page.evaluate(() => window.__e2e.purgedSessionIds)).toEqual(['expired']);
    expect(await page.evaluate(() => window.__e2e.calls.some(c => c.op === 'fetchSessions'))).toBe(false);

    await page.getByRole('tab', { name: '분석' }).click();
    await expect(page.getByRole('tab', { name: '분석' })).toHaveAttribute('aria-selected', 'true');
    const kpis = page.getByRole('region', { name: '분석 요약' });
    await expect(kpis.getByText('방문(세션)', { exact: true }).locator('..')).toContainText('4회');
    await expect(kpis.getByText('신청 완료', { exact: true }).locator('..')).toContainText('2회');
    await expect(kpis.getByText('레슨 완주', { exact: true }).locator('..')).toContainText('1회');
    await expect(kpis.getByText('제출', { exact: true }).locator('..')).toContainText('2/3');

    const survey = page.getByRole('list', { name: '설문 퍼널' }).getByRole('listitem');
    await expect(survey).toHaveCount(12);
    await expect(survey.first()).toContainText('챔퍼스 소개');
    await expect(survey.first()).toContainText('100%');
    await expect(survey.filter({ hasText: '가장 큰 이탈' })).toHaveCount(1);
    await expect(page.getByRole('list', { name: '레슨 퍼널' }).getByRole('listitem')).toHaveCount(12);

    const info = page.getByRole('region', { name: '활동 소개(ⓘ) 열람' }).getByRole('row');
    await expect(info).toHaveCount(11);
    await expect(info.nth(1)).toContainText('풋살 모임');
    await expect(info.nth(1)).toContainText('50%');

    await page.getByRole('button', { name: '전체', exact: true }).click();
    await expect(page.getByRole('button', { name: '전체', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(kpis.getByText('방문(세션)', { exact: true }).locator('..')).toContainText('5회');
    expect(await page.evaluate(() => window.__e2e.calls.filter(c => c.op === 'fetchSessions').length)).toBe(1);

    await page.getByRole('tab', { name: '응답' }).click();
    await expect(page.getByRole('region', { name: '요약' })).toBeVisible();
  });
});
