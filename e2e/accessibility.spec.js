import { test, expect, savedCoupon, enterLesson, toPhone, submit, activity, layout } from './fixtures.js';

test('SC-37 S10 인스타 링크 주소·새 창·noopener', async ({ page, context }) => {
  await savedCoupon(page);
  const link = page.getByRole('link', { name: /인스타그램 @champus_ajou/ });
  await expect(link).toHaveAttribute('href', 'https://www.instagram.com/champus_ajou');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  const request = context.waitForEvent('request', { predicate: r => r.url().startsWith('https://www.instagram.com/') });
  const popup = page.waitForEvent('popup');
  await link.click();
  expect((await request).url()).toBe('https://www.instagram.com/champus_ajou');
  const opened = await popup;
  await opened.waitForLoadState('domcontentloaded');
  expect(await opened.evaluate(() => window.opener === null)).toBe(true);
  await expect(page.getByRole('region', { name: '핫초코 교환권' })).toBeVisible();
  await opened.close();
});

test('SC-39 시스템 다크 모드가 설문·수업·관리자에 적용', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(19, 26, 44)');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(242, 244, 248)');
  await enterLesson(page);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(19, 26, 44)');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(19, 26, 44)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 251, 242)');
});

test('SC-40 활동 타일은 320·390px에서 2열이며 마지막 타일까지 접근', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '설문 시작하기' }).click();
  const a = await activity(page, '캠퍼스 연합예배').boundingBox();
  const b = await activity(page, '소그룹 예배').boundingBox();
  const c = await activity(page, '독서모임').boundingBox();
  expect(a.y).toBe(b.y);
  expect(b.x).toBeGreaterThan(a.x + a.width);
  expect(c.x).toBe(a.x);
  expect(c.y).toBeGreaterThan(a.y + a.height);
  await activity(page, '기타').scrollIntoViewIfNeeded();
  await expect(activity(page, '기타')).toBeInViewport();
  await activity(page, '기타').click();
  await expect(page.getByRole('textbox', { name: '기타 활동' })).toBeInViewport();
  await layout(page);
});

test('SC-41 SC-42 언어·진행도·입력 레이블·입력 포커스·키보드 CTA', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.getByRole('progressbar', { name: '진행도' })).toHaveAttribute('aria-valuemin', '0');
  await expect(page.getByRole('progressbar', { name: '진행도' })).toHaveAttribute('aria-valuemax', '100');
  await page.keyboard.press('Tab');
  const start = page.getByRole('button', { name: '설문 시작하기' });
  await expect(start).toBeFocused();
  await expect(start).toHaveCSS('outline-style', 'solid');
  await expect(start).toHaveCSS('outline-width', '3px');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: '하고 싶은 활동' })).toBeVisible();
  await toPhone(page);
  const phone = page.getByRole('textbox', { name: '전화번호' });
  await expect(phone).toBeFocused();
  await expect(phone).toHaveAccessibleName('전화번호');
  await expect(phone).toHaveAccessibleDescription('숫자만 적으면 돼');
  await expect(phone).toHaveAttribute('type', 'tel');
  await expect(phone).toHaveAttribute('autocomplete', 'tel');
  await expect(phone).toHaveAttribute('inputmode', 'tel');
});

test('SC-44 모션 감소 설정은 애니메이션·전환·축하 종이 제거', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('main > div')).toHaveCSS('animation-name', 'slideIn');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('main > div')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.fill')).toHaveCSS('transition-duration', '0s');
  await toPhone(page);
  await submit(page);
  await expect(page.locator('.confetti i')).toHaveCount(0);
  await expect(page.locator('.coupon')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.flame').first()).toHaveCSS('animation-name', 'none');
});

test('SC-58 쿠폰 이름은 HTML로 해석하지 않고 텍스트로 표시', async ({ page }) => {
  const name = '<img src=x onerror=alert(1)>';
  await savedCoupon(page, name);
  await expect(page.getByRole('region', { name: '핫초코 교환권' })).toContainText(name + '님');
  await expect(page.getByRole('region', { name: '핫초코 교환권' }).locator('img')).toHaveCount(0);
});
