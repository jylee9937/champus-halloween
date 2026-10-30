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
  studentId: '20261234', phone: '01012345678', consent: true,
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
  expect(Object.keys(attempts[0].data)).toHaveLength(14);
  expect(attempts[0].data.phone).toMatch(/^01[0-9]{8,9}$/);
}

export const next = page => page.getByRole('button', { name: '다음', exact: true }).click();
export async function back(page) {
  const main = page.getByRole('main');
  const content = await main.textContent();
  await page.getByRole('button', { name: '이전으로' }).click();
  // history.back is asynchronous, including S5→S4 where the progress value is unchanged.
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
    stageWidth: document.querySelector('main')?.clientWidth,
    stageScroll: document.querySelector('main')?.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.width);
  if (dimensions.stageWidth) expect(dimensions.stageScroll).toBeLessThanOrEqual(dimensions.stageWidth + 1);
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
  await page.getByRole('button', { name: '동의하고 계속' }).click();
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

export async function submit(page) {
  await page.getByRole('textbox', { name: '전화번호' }).fill('01012345678');
  await page.getByRole('button', { name: '제출하기' }).click();
  await expect(page.getByRole('region', { name: '핫초코 교환권' })).toContainText('김챔퍼스님');
}

export async function savedCoupon(page, name = '김챔퍼스') {
  await page.goto('/');
  await page.evaluate(value => sessionStorage.setItem('champus:done', JSON.stringify({ done: true, name: value })), name);
  await page.reload();
  await expect(page.getByRole('region', { name: '핫초코 교환권' })).toContainText(name + '님');
}

export async function enterLesson(page) {
  await savedCoupon(page);
  await page.getByRole('button', { name: '할로윈의 진짜 의미 알기 🎃' }).click();
  await expect(page.getByRole('heading', { name: /할로윈의.*진짜 뜻/ })).toBeVisible();
}
