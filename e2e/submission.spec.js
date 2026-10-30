import { test, expect, toPhone, submit, progress, assertPayload } from './fixtures.js';

test('SC-23 지연 전송 중 이중 탭·Enter 무시, CTA·이전 비활성', async ({ page }) => {
  await toPhone(page);
  await page.evaluate(() => { window.__e2e.submit.outcome = 'pending'; });
  const field = page.getByRole('textbox', { name: '전화번호' });
  await field.fill('01012345678');
  // Two synchronous DOM clicks reproduce the event race without timing sleeps.
  await page.getByRole('button', { name: '제출하기' }).evaluate(button => { button.click(); button.click(); });
  await expect(page.getByRole('button', { name: '보내는 중…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '이전으로' })).toBeDisabled();
  await field.press('Enter');
  await field.press('Enter');
  await page.evaluate(() => history.back());
  await progress(page, 90);
  await expect.poll(() => page.evaluate(() => window.__e2e.attempts.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => typeof window.__e2e.releaseSubmit)).toBe('function');
  await page.evaluate(() => window.__e2e.releaseSubmit());
  await progress(page, 100);
  await assertPayload(page);
  await expect.poll(() => page.evaluate(() => window.__e2e.writes.length)).toBe(1);
});

test('SC-24 실패 배너·다시 보내기 성공·답변 보존', async ({ page }) => {
  await toPhone(page);
  await page.evaluate(() => { window.__e2e.submit.outcome = 'failure'; });
  await page.getByRole('textbox', { name: '전화번호' }).fill('01012345678');
  await page.getByRole('button', { name: '제출하기' }).click();
  const banner = page.getByRole('status');
  await expect(banner).toContainText('전송이 안 됐어요');
  await expect(banner).toHaveClass(/bad/);
  await expect(page.getByRole('button', { name: '다시 보내기' })).toBeFocused();
  await expect(page.getByRole('button', { name: '제출하기' })).toBeEnabled();
  expect(await page.evaluate(() => ({ session: { ...sessionStorage }, local: { ...localStorage } }))).toEqual({ session: {}, local: {} });
  await page.evaluate(() => { window.__e2e.submit = { outcome: 'success', delayMs: 250 }; });
  await page.getByRole('button', { name: '다시 보내기' }).click();
  await expect(page.getByRole('button', { name: '보내는 중…' })).toBeDisabled();
  await progress(page, 100);
  await expect(banner).toBeHidden();
  const state = await page.evaluate(() => window.__e2e);
  expect(state.attempts).toHaveLength(2);
  expect(state.writes).toHaveLength(1);
  expect(state.attempts[0].data).toEqual(state.attempts[1].data);
});

test('SC-25 응답 없는 전송은 15초 후 재시도 안내', async ({ page }) => {
  await page.clock.install();
  await toPhone(page);
  await page.evaluate(() => { window.__e2e.submit.outcome = 'pending'; });
  await page.getByRole('textbox', { name: '전화번호' }).fill('01012345678');
  await page.getByRole('button', { name: '제출하기' }).click();
  await expect.poll(() => page.evaluate(() => window.__e2e.attempts.length)).toBe(1);
  await expect(page.getByRole('button', { name: '보내는 중…' })).toBeDisabled();
  await page.clock.fastForward(15_001);
  await expect(page.getByRole('status')).toContainText('전송이 안 됐어요');
  await expect(page.getByRole('button', { name: '다시 보내기' })).toBeEnabled();
});

test('SC-26 완료 후 새로고침하면 이름이 있는 S10, 재전송 없음', async ({ page }) => {
  await toPhone(page);
  await submit(page);
  await page.reload();
  await progress(page, 100, 9);
  await expect(page.getByRole('region', { name: '핫초코 교환권' })).toContainText('김챔퍼스님');
  await expect(page.getByRole('button', { name: '할로윈의 진짜 의미 알기 🎃' })).toBeVisible();
  expect(await page.evaluate(() => window.__e2e.attempts)).toEqual([]);
});

test('SC-27 진행 중 새로고침은 S0·입력 초기화', async ({ page }) => {
  await toPhone(page);
  await page.getByRole('textbox', { name: '전화번호' }).fill('01012345678');
  await page.reload();
  await progress(page, 0, 0);
  await page.getByRole('button', { name: '설문 시작하기' }).click();
  await expect(page.getByRole('group', { name: '하고 싶은 활동' }).getByRole('button', { pressed: true })).toHaveCount(0);
  expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual({});
});

test('SC-28 설문·퀴즈 전 과정 저장 쓰기에는 완료와 이름만 존재', async ({ page }) => {
  await toPhone(page);
  expect(await page.evaluate(() => window.__storageWrites)).toEqual([]);
  await submit(page);
  const expected = { done: true, name: '김챔퍼스' };
  expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual({ 'champus:done': JSON.stringify(expected) });
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({});
  await page.getByRole('button', { name: '할로윈의 진짜 의미 알기 🎃' }).click();
  const answers = { 2: '10월 31일 밤', 7: '믿음의 선배들을 기억하며 기도했다', 9: '모든 성인의 날, 그 전날 밤' };
  for (let step = 0; step < 10; step++) {
    if (answers[step]) {
      await page.getByRole('button', { name: new RegExp(answers[step] + '$') }).click();
      await page.getByRole('button', { name: '계속', exact: true }).click();
    } else await page.getByRole('button', { name: step === 0 ? '시작하기' : '다음', exact: true }).click();
  }
  await page.getByRole('button', { name: '할로윈 이야기 다시 보기' }).click();
  expect(await page.evaluate(() => window.__storageWrites)).toEqual([
    { area: 'session', key: 'champus:done', value: JSON.stringify(expected) },
  ]);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({});
});

for (const value of ['{broken', '{"done":false,"name":"김"}', '{"done":true,"name":123}']) {
  test(`SC-29 손상된 완료 저장값에서 안전하게 시작 ${value}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(v => sessionStorage.setItem('champus:done', v), value);
    await page.reload();
    await progress(page, 0);
    await expect(page.getByRole('button', { name: '설문 시작하기' })).toBeVisible();
  });
}
