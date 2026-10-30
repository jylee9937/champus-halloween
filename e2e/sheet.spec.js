import { test, expect, activity, layout } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '설문 시작하기' }).click();
});

test('SC-19 일반 활동 10개 소개 시트의 제목·설명·일정', async ({ page }) => {
  const entries = [
    ['캠퍼스 연합예배', '캠퍼스가 연합하여 예배하는 자리!', '11월 3일 저녁 7시 30분 · 수원여대 미림관', '⛪'],
    ['소그룹 예배', '따뜻한 공동체를 경험하고', '매주 목요일 7시 · 저녁 식사 제공!', '🙏'],
    ['독서모임', '자유롭게 책을 읽고', '매주 수·목·토·일 (네 타임 운영)', '📚'],
    ['바이브 코딩', 'AI를 활용하는 방법을 배우고', '매주 목요일 4시 30분', '💻'],
    ['풋살 모임', '가볍게 공 차면서', '매주 토요일 저녁', '⚽'],
    ['스터디 모임', '함께 밥 먹고', '매주 화요일 저녁 7시 30분', '📝'],
    ['교육 봉사', '교육 봉사를 통해', '매주 1회 · 수원 지역 아동센터', '✏️'],
    ['취업 멘토링', '진로와 취업에 대한 고민', '일정은 신청자들과 조율 예정', '💼'],
    ['해피브릿지', '맛있는 저녁과 함께', '매주 토요일 저녁 7시 30분', '🌱'],
    ['향수공방', '나만의 향수를 만들어', '일정은 신청자들과 조율 예정', '🌸'],
  ];
  // ⓘ buttons follow the booth order (Figma S1-A).
  expect(await page.getByRole('button', { name: /소개 보기$/ }).evaluateAll(els => els.map(el => el.getAttribute('aria-label'))))
    .toEqual(entries.map(([name]) => name + ' 소개 보기'));
  for (const [name, intro, when, emoji] of entries) {
    const opener = page.getByRole('button', { name: name + ' 소개 보기', exact: true });
    await opener.click();
    const sheet = page.getByRole('dialog', { name, exact: true });
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(sheet.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(sheet.locator('.sheet-icon')).toHaveText(emoji);
    await expect(sheet).toContainText(intro);
    await expect(sheet).toContainText(when);
    await expect(sheet.getByRole('button', { name: '이 활동 고르기' })).toBeFocused();
    await expect(page.locator('#app')).toHaveJSProperty('inert', true);
    const box = await sheet.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    await sheet.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(activity(page, name)).toHaveAttribute('aria-pressed', 'false');
  }
  await expect(page.getByRole('button', { name: '기타 소개 보기' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '아직 고민 중이에요 소개 보기' })).toHaveCount(0);
});

test('SC-20 시트에서 선택·선택 취소·닫기, 고민 중 해제', async ({ page }) => {
  await activity(page, '아직 고민 중이에요').click();
  const opener = page.getByRole('button', { name: '독서모임 소개 보기' });
  await opener.click();
  await page.getByRole('button', { name: '이 활동 고르기' }).click();
  await expect(activity(page, '독서모임')).toHaveAttribute('aria-pressed', 'true');
  await expect(activity(page, '아직 고민 중이에요')).toHaveAttribute('aria-pressed', 'false');
  await opener.click();
  await expect(page.getByRole('dialog')).toContainText('이미 고른 활동이야');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(activity(page, '독서모임')).toHaveAttribute('aria-pressed', 'true');
  await opener.click();
  await page.getByRole('button', { name: '선택 취소하기' }).click();
  await expect(activity(page, '독서모임')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: '활동을 골라 줘!' })).toBeDisabled();
  await expect(opener).toBeFocused();
});

test('SC-21 Escape·배경·브라우저 뒤로 시트 닫기와 포커스 복원', async ({ page }) => {
  const opener = page.getByRole('button', { name: '독서모임 소개 보기' });
  for (const dismiss of ['escape', 'backdrop', 'history']) {
    await opener.click();
    if (dismiss === 'escape') await page.keyboard.press('Escape');
    if (dismiss === 'backdrop') await page.mouse.click(4, 4);
    if (dismiss === 'history') await page.evaluate(() => history.back());
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(page.locator('#app')).toHaveJSProperty('inert', false);
    await expect(activity(page, '독서모임')).toHaveAttribute('aria-pressed', 'false');
  }
  await layout(page);
});

test('SC-43 모달의 Tab·Shift+Tab 포커스 순환', async ({ page }) => {
  await page.getByRole('button', { name: '독서모임 소개 보기' }).click();
  const pick = page.getByRole('button', { name: '이 활동 고르기' });
  const close = page.getByRole('button', { name: '닫기', exact: true });
  await expect(pick).toBeFocused();
  // Confirmed on both widths in CI: Shift+Tab escapes the modal instead of wrapping to 닫기.
  // src/survey/survey.js:337 handles Escape only; the inert background does not implement a Tab trap.
  // Keep the intended behavior executable until app logic is fixed in its own branch.
  test.fail(true, 'SC-43: activity sheet lacks a Tab/Shift+Tab focus trap (src/survey/survey.js:337)');
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(pick).toBeFocused();
});
