import { test, expect, activity, next, layout } from './fixtures.js';
import { ACTIVITIES } from '../src/survey/data.js';

// S1 shows every activity as a detailed card (Figma S1 22:1572 / 61:2562); the ⓘ sheet is gone.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '설문 시작하기' }).click();
});

const pill = page => page.getByRole('button', { name: '활동 12개 · 아래로 더 보기' });
const stage = page => page.getByRole('main');

test('SC-19 상세 카드 12개: 이름·소개·🕒 일정, 고민 중·기타는 일정 없음', async ({ page }) => {
  await expect(page.getByText('활동 12개 · 여러 개 골라도 괜찮아', { exact: true })).toBeVisible();
  const group = page.getByRole('group', { name: '하고 싶은 활동' });
  await expect(group.getByRole('button')).toHaveCount(ACTIVITIES.length);
  for (const act of ACTIVITIES) {
    const card = activity(page, act.name);
    await expect(card).toHaveAccessibleName(act.name);
    await expect(card).toContainText(act.intro);
    await expect(card).toHaveAttribute('aria-pressed', 'false');
    if (act.when) {
      await expect(card).toContainText('🕒 ' + act.when);
      await expect(card).toHaveAccessibleDescription(`${act.intro} 🕒 ${act.when}`);
    } else {
      await expect(card).not.toContainText('🕒');
      await expect(card).toHaveAccessibleDescription(act.intro);
    }
  }
  // No ⓘ buttons, no bottom sheet.
  await expect(page.getByRole('button', { name: /소개 보기/ })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await layout(page);
});

test('SC-20 카드 선택·해제와 기타 입력칸은 기타 카드 바로 아래', async ({ page }) => {
  const card = activity(page, '독서모임');
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  const other = activity(page, '기타');
  await other.click();
  const input = page.getByRole('textbox', { name: '기타 활동' });
  await expect(input).toBeFocused();
  await expect(input).toBeInViewport();
  const [c, i] = [await other.boundingBox(), await input.boundingBox()];
  expect(i.y).toBeGreaterThan(c.y + c.height - 1);
  expect(i.y - (c.y + c.height)).toBeLessThan(24);
  // The list is brought to its end, so the fade no longer covers the input.
  await expect(page.locator('.scroll-hint')).not.toHaveClass(/fade-on/);
  await other.click();
  await expect(input).toBeHidden();
});

test('SC-21 스크롤 안내: 처음엔 보이고, 누르면 한 화면쯤 내려가고, 다시 나오지 않음', async ({ page }) => {
  await expect(pill(page)).toBeVisible();
  await expect(page.locator('.scroll-hint')).toHaveClass(/fade-on/);
  const before = await stage(page).evaluate(el => el.scrollTop);
  const height = await stage(page).evaluate(el => el.clientHeight);
  await pill(page).click();
  await expect.poll(() => stage(page).evaluate(el => el.scrollTop)).toBeGreaterThan(before + height * 0.6);
  await expect(pill(page)).toBeHidden();
  await stage(page).evaluate(el => el.scrollTo({ top: 0 }));
  await expect(pill(page)).toBeHidden();
  // At the end of the list the fade goes too.
  await stage(page).evaluate(el => el.scrollTo({ top: el.scrollHeight }));
  await expect(page.locator('.scroll-hint')).not.toHaveClass(/fade-on/);
  // Leaving S1 removes the hint.
  await activity(page, '독서모임').click();
  await next(page);
  await expect(page.locator('.scroll-hint')).toHaveCount(0);
});

test('SC-21 스크롤 안내: 60px 넘게 직접 스크롤하면 숨김', async ({ page }) => {
  await expect(pill(page)).toBeVisible();
  await stage(page).evaluate(el => el.scrollBy(0, 40));
  await expect(pill(page)).toBeVisible();
  await stage(page).evaluate(el => el.scrollBy(0, 60));
  await expect(pill(page)).toBeHidden();
});

test('SC-21 스크롤 안내: 움직임 줄이기에서는 통통 튀지 않음', async ({ page }) => {
  const animation = () => page.locator('.scroll-pill').evaluate(el => getComputedStyle(el).animationName);
  expect(await animation()).toBe('none'); // fixture default: reducedMotion=reduce
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await animation()).toBe('hint-bounce');
});

test.describe('목록이 다 보이는 긴 화면', () => {
  test.use({ viewport: { width: 390, height: 2200 } });
  test('SC-21 스크롤 안내: 스크롤할 게 없으면 안 보임', async ({ page }) => {
    await expect(activity(page, '기타')).toBeInViewport();
    await expect(pill(page)).toBeHidden();
    await expect(page.locator('.scroll-hint')).not.toHaveClass(/fade-on/);
  });
});

test('SC-43 카드는 키보드로 고르고 해제', async ({ page }) => {
  const card = activity(page, '풋살 모임');
  await card.focus();
  await page.keyboard.press('Space');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await expect(card).toBeFocused();
});
