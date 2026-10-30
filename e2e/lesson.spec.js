import {
  test, expect, enterLesson, next, back, progress, layout, expectSurveyReward, expectLessonReward, LESSON_CTA,
} from './fixtures.js';

const quizzes = new Map([
  [2, { correct: '10월 31일 밤', wrong: '12월 25일 밤', correction: '할로윈은 10월 31일 밤이야 🌙' }],
  [7, { correct: '믿음의 선배들을 기억하며 기도했다', wrong: '호박을 던지며 놀았다', correction: '원래는 믿음의 선배들을 기억하며 기도하는 밤이었어 🕯️' }],
  [9, { correct: '모든 성인의 날, 그 전날 밤', wrong: '호박 축제', correction: "정답은 '모든 성인의 날, 그 전날 밤'이야 ✨" }],
]);

async function finishLesson(page, correct = true) {
  for (let step = 0; step < 10; step++) {
    await progress(page, step * 10);
    await layout(page);
    const quiz = quizzes.get(step);
    if (quiz) {
      await expect(page.getByRole('button', { name: '답을 골라 봐!' })).toBeDisabled();
      const option = page.getByRole('button', { name: new RegExp((correct ? quiz.correct : quiz.wrong) + '$') });
      await option.click();
      const score = correct ? [...quizzes.keys()].filter(s => s <= step).length : 0;
      await expect(page.getByLabel('맞힌 퀴즈 수')).toHaveText('⭐ ' + score);
      await expect(page.getByRole('status')).toContainText(correct ? '정답이야! 🎉' : '아쉬워!');
      await expect(page.getByRole('status')).toHaveClass(correct ? /ok/ : /bad/);
      if (!correct) await expect(page.getByRole('status')).toContainText(quiz.correction);
      await expect(option).toBeDisabled();
      await expect(option).toHaveClass(correct ? /ok/ : /bad/);
      await expect(page.getByRole('button', { name: new RegExp(quiz.correct + '$') })).toHaveClass(/ok/);
      for (const button of await page.getByRole('main').getByRole('button').all()) await expect(button).toBeDisabled();
      await expect(page.getByRole('button', { name: '계속', exact: true })).toBeFocused();
      await page.getByRole('button', { name: '계속', exact: true }).click();
    } else {
      // Unique content proves we visit all 11 screens in order, rather than just trusting progress.
      const content = {
        0: '10월 31일 밤 이야기', 1: '진짜 뜻은 이름 속에 숨어 있어',
        3: '이름 속 비밀', 4: '만성절', 5: '멋진 본을 보여 준',
        6: '촛불을 켜고', 8: '1900년대',
      };
      await expect(page.getByRole('main')).toContainText(content[step]);
      await page.getByRole('button', { name: step === 0 ? '시작하기' : '다음', exact: true }).click();
    }
  }
  await progress(page, 100);
  await layout(page);
  await expect(page.getByText('이것만 기억해 줘!', { exact: true })).toBeVisible();
  await expect(page.getByText(`퀴즈 3개 중 ${correct ? 3 : 0}개 정답!`)).toBeVisible();
}

test('SC-30 SC-40 수업 11화면·정답 즉시 채점·별·모바일 레이아웃', async ({ page }) => {
  await enterLesson(page);
  await expect(page.getByLabel('맞힌 퀴즈 수')).toHaveText('⭐ 0');
  await finishLesson(page);
  await expectLessonReward(page);
});

test('SC-31 세 퀴즈 오답·정답 표시·해설·별 0, 오답이어도 쿠키 교환권', async ({ page }) => {
  await enterLesson(page);
  await finishLesson(page, false);
  // The cookie is for finishing all 3 quizzes, right or wrong.
  await expectLessonReward(page);
});

test('SC-32 퀴즈 재방문에서 재채점·중복 별 획득 금지', async ({ page }) => {
  await enterLesson(page);
  await page.getByRole('button', { name: '시작하기', exact: true }).click();
  await next(page);
  await page.getByRole('button', { name: /10월 31일 밤$/ }).click();
  await page.getByRole('button', { name: '계속', exact: true }).click();
  await back(page);
  await progress(page, 20);
  await expect(page.getByLabel('맞힌 퀴즈 수')).toHaveText('⭐ 1');
  const answer = page.getByRole('button', { name: /10월 31일 밤$/ });
  await expect(answer).toBeDisabled();
  await expect(answer).toHaveClass(/ok/);
  await answer.dispatchEvent('click');
  await expect(page.getByLabel('맞힌 퀴즈 수')).toHaveText('⭐ 1');
  await next(page);
  await back(page);
  await back(page);
  await next(page);
  await expect(answer).toBeDisabled();
  await expect(page.getByLabel('맞힌 퀴즈 수')).toHaveText('⭐ 1');
});

test('SC-33 끝 화면 쿠폰·인스타 CTA·다시 보기에서 수업·점수 초기화', async ({ page }) => {
  await enterLesson(page);
  await finishLesson(page);
  await expect(page.getByRole('button', { name: '챔퍼스 인스타 둘러보기 📷' })).toBeVisible();
  await expect(page.getByText('이것만 기억해 줘!', { exact: true })).toBeVisible();
  await expect(page.locator('.final-card')).toHaveText('할로윈은 원래믿음의 선배들을기억하고 감사하던참 좋은 날이었어.');
  await expect(page.locator('.score-card .stars span:not(.dim)')).toHaveCount(3);
  await expectLessonReward(page);
  await page.getByRole('button', { name: '할로윈 이야기 다시 보기' }).click();
  await progress(page, 0);
  await expect(page.getByRole('heading', { name: /할로윈의.*진짜 뜻/ })).toBeVisible();
  await expect(page.getByLabel('맞힌 퀴즈 수')).toHaveText('⭐ 0');
  await expect(page.getByRole('button', { name: '설문 시작하기' })).toHaveCount(0);
  await page.getByRole('button', { name: '시작하기', exact: true }).click();
  await next(page);
  await expect(page.getByRole('button', { name: /10월 31일 밤$/ })).toBeEnabled();
  await page.getByRole('button', { name: /10월 31일 밤$/ }).click();
  await expect(page.getByLabel('맞힌 퀴즈 수')).toHaveText('⭐ 1');
});

test('SC-34 수업 첫 화면에서 뒤로 가면 설문 완료 쿠폰', async ({ page }) => {
  await enterLesson(page);
  await back(page);
  await progress(page, 100, 9);
  await expectSurveyReward(page);
});

test('SC-35 수업 중 새로고침은 S10·퀴즈 점수 미저장', async ({ page }) => {
  await enterLesson(page);
  await page.getByRole('button', { name: '시작하기', exact: true }).click();
  await next(page);
  await page.getByRole('button', { name: /10월 31일 밤$/ }).click();
  await page.reload();
  await progress(page, 100, 9);
  await page.getByRole('button', { name: LESSON_CTA, exact: true }).click();
  await expect(page.getByLabel('맞힌 퀴즈 수')).toHaveText('⭐ 0');
});

test('SC-39 수업 끝 핫초코 + 쿠키 교환권은 다크·라이트 색 토큰을 따름', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await enterLesson(page);
  await finishLesson(page, false);
  await expectLessonReward(page);
  const coupon = page.getByRole('region', { name: '핫초코 + 쿠키 교환권', exact: true });
  const notch = () => coupon.locator('.coupon-cut').evaluate(el => getComputedStyle(el, '::before').borderTopColor);
  // tokens.css dark: green-line #3E7A22, green-bg #1F3A17, green-fg #9BE85A, surface #1C2437; green #58CC02 in both modes.
  await expect(coupon).toHaveCSS('border-top-color', 'rgb(62, 122, 34)');
  await expect(coupon.locator('.coupon-ribbon')).toHaveCSS('background-color', 'rgb(88, 204, 2)');
  await expect(coupon.locator('.coupon-ribbon')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(coupon.locator('.coupon-main')).toHaveCSS('background-color', 'rgb(31, 58, 23)');
  await expect(coupon.locator('.coupon-icon')).toHaveCSS('background-color', 'rgb(28, 36, 55)');
  await expect(coupon.locator('.coupon-name')).toHaveCSS('color', 'rgb(155, 232, 90)');
  await expect(coupon.locator('.coupon-title b')).toHaveCSS('color', 'rgb(255, 150, 0)');
  expect(await notch()).toBe('rgb(62, 122, 34)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(coupon).toHaveCSS('border-top-color', 'rgb(165, 237, 110)');
  await expect(coupon.locator('.coupon-main')).toHaveCSS('background-color', 'rgb(215, 255, 184)');
  await expect(coupon.locator('.coupon-icon')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(coupon.locator('.coupon-name')).toHaveCSS('color', 'rgb(76, 163, 0)');
  expect(await notch()).toBe('rgb(165, 237, 110)');
});

test('SC-36 수업 방향키·가로 스와이프·미응답 퀴즈 건너뛰기 금지', async ({ page }) => {
  await enterLesson(page);
  await page.keyboard.press('ArrowRight');
  await progress(page, 10);
  await page.getByRole('main').evaluate(element => {
    const touch = clientX => new Touch({ identifier: 1, target: element, clientX, clientY: 300 });
    element.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(260)], bubbles: true }));
    element.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(100)], bubbles: true }));
  });
  await progress(page, 20);
  await page.keyboard.press('ArrowRight');
  await progress(page, 20);
  await page.getByRole('button', { name: /10월 31일 밤$/ }).click();
  await page.keyboard.press('ArrowRight');
  await progress(page, 30);
  await page.keyboard.press('ArrowLeft');
  await progress(page, 20);
});

test('SC-38 끝 화면 인스타 CTA는 정확한 주소를 새 창으로 열기', async ({ page, context }) => {
  await enterLesson(page);
  await finishLesson(page);
  // Browser-level navigation is aborted by the fixture; Instagram is never contacted.
  const request = context.waitForEvent('request', { predicate: r => r.url().startsWith('https://www.instagram.com/') });
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: '챔퍼스 인스타 둘러보기 📷' }).click();
  expect((await request).url()).toBe('https://www.instagram.com/champus_ajou');
  const opened = await popup;
  await opened.waitForLoadState('domcontentloaded');
  expect(await opened.evaluate(() => window.opener === null)).toBe(true);
  await progress(page, 100);
  await opened.close();
});
