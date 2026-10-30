import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  mockOptions: [{}, { option: true }],
  page: async ({ page, context, mockOptions }, use) => {
    const firebaseRequests = [];
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    // Block all non-local HTTP, including popup first requests. A Firebase request also fails the test.
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' && url.port === '4175') return route.continue();
      if (/(firebase|firestore|googleapis|identitytoolkit|securetoken)/i.test(url.href)
        && !url.hostname.startsWith('fonts.')) firebaseRequests.push(url.href);
      await route.abort();
    });
    await context.addInitScript(options => {
      window.__e2e = {
        submit: { outcome: 'success', delayMs: 0 }, attempts: [], writes: [], calls: [],
        responses: [], purgedIds: [], user: null,
        adminEmails: ['admin@example.test'], signInEmail: 'admin@example.test',
        ...options,
      };
      window.__storageWrites = [];
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        window.__storageWrites.push({ area: this === localStorage ? 'local' : 'session', key, value });
        return original.call(this, key, value);
      };
    }, mockOptions);
    await page.clock.setFixedTime(new Date('2026-10-31T05:30:00Z'));
    await use(page);
    expect(firebaseRequests, 'No requests may reach Firebase, including an attempted connection').toEqual([]);
    expect(pageErrors, 'No unhandled browser errors').toEqual([]);
  },
});

export { expect };

export const defaultPayload = {
  activities: ['book-club'], activityOther: null, days: [], participation: 'regular',
  seekingFaithCommunity: false, comment: '', name: '김챔퍼스', department: '소프트웨어학과',
  studentId: '20261234', phone: '01012345678',
};

export async function assertPayload(page, expected = defaultPayload) {
  const attempts = await page.evaluate(() => window.__e2e.attempts);
  expect(attempts).toHaveLength(1);
  expect(attempts[0].collection).toBe('responses');
  // Full Firestore document, including the real adapter's metadata. The SDK sentinel is serialized.
  expect(attempts[0].data).toEqual({
    schemaVersion: 1, ...expected,
    createdAt: { __type: 'serverTimestamp' },
    expireAt: { ms: attempts[0].at + 365 * 24 * 60 * 60 * 1000 },
  });
  // 13 keys: consent is no longer sent (the S5 consent screen was removed).
  expect(Object.keys(attempts[0].data)).toHaveLength(13);
  expect(attempts[0].data).not.toHaveProperty('consent');
  expect(attempts[0].data.phone).toMatch(/^01[0-9]{8,9}$/);
}

export const next = page => page.getByRole('button', { name: '다음', exact: true }).click();
export async function back(page) {
  const main = page.getByRole('main');
  const content = await main.textContent();
  await page.getByRole('button', { name: '이전으로' }).click();
  // history.back is asynchronous, so wait for the stage content to change.
  await expect(main).not.toHaveText(content);
}
export const activity = (page, name) => page.getByRole('group', { name: '하고 싶은 활동' }).getByRole('button', { name: new RegExp(name + '$') });
export const comment = page => page.getByRole('textbox', { name: '해보고 싶은 활동이나 궁금한 점' });

export async function progress(page, value, count) {
  await expect(page.getByRole('progressbar', { name: '진행도' })).toHaveAttribute('aria-valuenow', String(value));
  if (count != null) await expect(page.getByLabel(`설문 9문항 중 ${count}번째`)).toHaveText(`📝 ${count}/9`);
}

export async function layout(page) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth, documentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.width);
  // Coupon notch pseudo-elements intentionally extend outside the card and are clipped by the stage.
  // Check meaningful content bounds instead of treating decorative scrollWidth as a layout defect.
  const overflow = await page.getByRole('main').evaluate(main => {
    const stage = main.getBoundingClientRect();
    return [...main.querySelectorAll('button,input,textarea,h1,h2,p,a,section,.bubble,.result-line,.chip,.cal,.note,.final-card,.score-card')]
      .filter(element => element.getClientRects().length)
      .map(element => ({ text: element.textContent.trim().slice(0, 60), rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left < stage.left - 1 || rect.right > stage.right + 1)
      .map(({ text, rect }) => ({ text, left: rect.left, right: rect.right }));
  });
  expect(overflow, 'Readable content and controls fit inside the scrollable stage').toEqual([]);
  const cta = page.locator('footer').getByRole('button').first();
  if (await cta.count()) await expect(cta).toBeInViewport({ ratio: 1 });
}

// Helpers always drive real UI. Only completed-lesson tests seed the public session completion marker.
export async function toDays(page) {
  await page.goto('/');
  await page.getByRole('button', { name: '설문 시작하기' }).click();
  await activity(page, '독서모임').click();
  await next(page);
}

export async function toComment(page) {
  await toDays(page);
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await page.getByRole('radio', { name: '정기적으로 함께하고 싶어요' }).click();
  await next(page);
  await page.getByRole('radio', { name: /아니요/ }).click();
  await next(page);
}

export async function toName(page) {
  await toComment(page);
  await page.getByRole('button', { name: '건너뛰기' }).click();
}

export async function toPhone(page) {
  await toName(page);
  await page.getByRole('textbox', { name: '이름', exact: true }).fill('김챔퍼스');
  await next(page);
  await page.getByRole('textbox', { name: '학과', exact: true }).fill('소프트웨어학과');
  await next(page);
  await page.getByRole('textbox', { name: '학번', exact: true }).fill('20261234');
  await next(page);
}

// Two reward tiers (Figma Reward Coupon 47:90): the survey earns a hot chocolate, the finished lesson hot chocolate + cookie.
export const chocoCoupon = page => page.getByRole('region', { name: '핫초코 교환권', exact: true });
export const cookieCoupon = page => page.getByRole('region', { name: '핫초코 + 쿠키 교환권', exact: true });
export const LESSON_CTA = '할로윈 퀴즈 풀고 쿠키 받기 🍪';

/** S10 (Figma 22:1999): hot chocolate coupon with the cookie hint; quiz chip and line above the lesson CTA. */
export async function expectSurveyReward(page, name = '김챔퍼스') {
  const coupon = chocoCoupon(page);
  await expect(coupon).toContainText(name + '님');
  await expect(coupon.locator('.coupon-title')).toHaveText('핫초코 교환권');
  await expect(coupon.locator('.coupon-icon')).toHaveText('☕');
  await expect(coupon).toContainText('할로윈 퀴즈까지 풀면 쿠키도 줄게! 🍪');
  await expect(coupon).not.toContainText('할로윈 이야기를 안 봐도');
  await expect(coupon.locator('.coupon-ribbon')).toHaveCount(0);
  await expect(cookieCoupon(page)).toHaveCount(0);
  const footer = page.locator('footer');
  await expect(footer.getByText('퀴즈 3개 · 3분', { exact: true })).toBeVisible();
  await expect(footer.getByText('할로윈의 진짜 의미, 3분 퀴즈로 알아보자!', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: LESSON_CTA, exact: true })).toBeEnabled();
  // Chip, then line, then CTA, as in the Figma bottom bar.
  const y = text => footer.getByText(text, { exact: true }).evaluate(el => el.getBoundingClientRect().top);
  const [chip, line, cta] = [await y('퀴즈 3개 · 3분'), await y('할로윈의 진짜 의미, 3분 퀴즈로 알아보자!'), await y(LESSON_CTA)];
  expect(chip).toBeLessThan(line);
  expect(line).toBeLessThan(cta);
}

/** Lesson end (Figma 10:515): hot chocolate + cookie coupon, earned once all 3 quizzes are answered. */
export async function expectLessonReward(page, name = '김챔퍼스') {
  const coupon = cookieCoupon(page);
  await expect(coupon).toContainText(name + '님');
  await expect(coupon.locator('.coupon-ribbon')).toHaveText('퀴즈 완료 🎉');
  await expect(coupon.locator('.coupon-icon')).toHaveText('☕🍪');
  await expect(coupon.locator('.coupon-title')).toHaveText('핫초코 + 쿠키 교환권');
  await expect(coupon.locator('.coupon-title b')).toHaveText('쿠키');
  await expect(coupon).toContainText('부스 스태프에게 이 화면을 보여 줘!');
  await expect(coupon).toContainText('핫초코를 이미 받았다면 쿠키만 받아 가!');
  await expect(chocoCoupon(page)).toHaveCount(0);
  await expect(page.locator('footer').getByText('퀴즈 3개 · 3분')).toBeHidden();
}

export async function submit(page) {
  await page.getByRole('textbox', { name: '전화번호' }).fill('01012345678');
  await page.getByRole('button', { name: '제출하기' }).click();
  await expect(chocoCoupon(page)).toContainText('김챔퍼스님');
}

export async function savedCoupon(page, name = '김챔퍼스') {
  await page.goto('/');
  await page.evaluate(value => sessionStorage.setItem('champus:done', JSON.stringify({ done: true, name: value })), name);
  await page.reload();
  await expect(chocoCoupon(page)).toContainText(name + '님');
}

export async function enterLesson(page) {
  await savedCoupon(page);
  await page.getByRole('button', { name: LESSON_CTA, exact: true }).click();
  await expect(page.getByRole('heading', { name: /할로윈의.*진짜 뜻/ })).toBeVisible();
}
