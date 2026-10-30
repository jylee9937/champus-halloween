import {
  test, expect, next, back, activity, comment, progress, layout,
  toDays, toComment, toName, toPhone, submit, assertPayload, defaultPayload,
} from './fixtures.js';

test('SC-01 SC-12 설문 전체 진행도·개인정보 동의·정확한 Firestore 문서', async ({ page }) => {
  await page.goto('/');
  await progress(page, 0, 0);
  await layout(page);
  await expect(page.getByRole('button', { name: '이전으로' })).toBeDisabled();
  await page.getByRole('button', { name: '설문 시작하기' }).click();
  await progress(page, 10, 1);
  await layout(page);
  await activity(page, '독서모임').click();
  await next(page);
  await progress(page, 20, 2);
  await layout(page);
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await progress(page, 30, 3);
  await layout(page);
  await page.getByRole('radio', { name: '정기적으로 함께하고 싶어요' }).click();
  await next(page);
  await progress(page, 40, 4);
  await layout(page);
  await page.getByRole('radio', { name: /아니요/ }).click();
  await next(page);
  await progress(page, 50, 5);
  await layout(page);
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await progress(page, 50, 5);
  await layout(page);
  await expect(page.getByRole('heading', { name: '🔒 개인정보 수집·이용 안내' })).toBeVisible();
  await expect(page.getByText('수집 후 1년 (이후 삭제)', { exact: true })).toBeVisible();
  await expect(page.getByText('이름, 학과, 학번, 연락처')).toBeVisible();
  await expect(page.getByText('관심 활동 안내와 일정 조율')).toBeVisible();
  await page.getByRole('button', { name: '동의하고 계속' }).click();
  for (const [label, value, pct, count] of [
    ['이름', '김챔퍼스', 60, 6], ['학과', '소프트웨어학과', 70, 7], ['학번', '20261234', 80, 8],
  ]) {
    await progress(page, pct, count);
    await layout(page);
    const field = page.getByRole('textbox', { name: label, exact: true });
    await expect(field).toBeFocused();
    await field.fill(value);
    await field.press('Enter');
  }
  await progress(page, 90, 9);
  await layout(page);
  await expect(page.getByRole('textbox', { name: '전화번호' })).toBeFocused();
  await page.getByRole('textbox', { name: '전화번호' }).fill('01012345678');
  await page.getByRole('textbox', { name: '전화번호' }).press('Enter');
  await progress(page, 100, 9);
  await layout(page);
  await expect(page.getByRole('region', { name: '핫초코 교환권' })).toContainText('김챔퍼스님');
  await expect(page.getByRole('button', { name: '이전으로' })).toBeDisabled();
  await assertPayload(page);
});

test('SC-02 모든 일반 활동과 기타·모든 요일의 ID 및 선택 순서 정규화', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '설문 시작하기' }).click();
  const names = ['캠퍼스 연합예배', '소그룹 예배', '독서모임', '바이브 코딩', '풋살 모임', '취업 멘토링', '교육 봉사', "챔'S 스터디", '해피브릿지', '향수공방'];
  for (const name of [...names].reverse()) await activity(page, name).click();
  await activity(page, '기타').click();
  await page.getByRole('textbox', { name: '기타 활동' }).fill('  보드게임  ');
  await next(page);
  for (const day of ['일', '토', '금', '목', '수', '화', '월']) await page.getByRole('button', { name: day + '요일', exact: true }).click();
  await next(page);
  await page.getByRole('radio', { name: '일정이 맞는 활동에 가끔 참여하고 싶어요' }).click();
  await next(page);
  await page.getByRole('radio', { name: /네$/ }).click();
  await next(page);
  await comment(page).fill('  향수공방은 언제 해요?  ');
  await next(page);
  await page.getByRole('button', { name: '동의하고 계속' }).click();
  for (const [label, value] of [['이름', ' 김챔퍼스 '], ['학과', ' 소프트웨어학과 '], ['학번', '00']]) {
    await page.getByRole('textbox', { name: label, exact: true }).fill(value);
    await next(page);
  }
  await submit(page);
  await assertPayload(page, {
    ...defaultPayload,
    activities: ['union-worship', 'small-group', 'book-club', 'vibe-coding', 'futsal', 'career-mentoring', 'edu-volunteer', 'champs-study', 'happy-bridge', 'perfume-workshop', 'other'],
    activityOther: '보드게임', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    participation: 'occasional', seekingFaithCommunity: true, comment: '향수공방은 언제 해요?', studentId: '00',
  });
});

test('SC-03 SC-04 활동 필수·다중 선택·해제·고민 중 상호 배타', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '설문 시작하기' }).click();
  await expect(page.getByRole('button', { name: '활동을 골라 줘!' })).toBeDisabled();
  await activity(page, '독서모임').click();
  await activity(page, '풋살 모임').click();
  for (const name of ['독서모임', '풋살 모임']) await expect(activity(page, name)).toHaveAttribute('aria-pressed', 'true');
  await activity(page, '아직 고민 중이에요').click();
  for (const name of ['독서모임', '풋살 모임']) await expect(activity(page, name)).toHaveAttribute('aria-pressed', 'false');
  await expect(activity(page, '아직 고민 중이에요')).toHaveAttribute('aria-pressed', 'true');
  await activity(page, '기타').click();
  await expect(activity(page, '아직 고민 중이에요')).toHaveAttribute('aria-pressed', 'false');
  await activity(page, '기타').click();
  await activity(page, '아직 고민 중이에요').click();
  await activity(page, '아직 고민 중이에요').click();
  await expect(page.getByRole('button', { name: '활동을 골라 줘!' })).toBeDisabled();
});

test('SC-05 기타 공백·필수·100자 제한 및 자동 포커스', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '설문 시작하기' }).click();
  await activity(page, '기타').click();
  const field = page.getByRole('textbox', { name: '기타 활동' });
  await expect(field).toBeFocused();
  await expect(page.getByRole('button', { name: '기타 활동을 적어 줘!' })).toBeDisabled();
  await field.fill('   ');
  await field.press('Enter');
  await progress(page, 10);
  await field.fill('가'.repeat(101));
  await expect(field).toHaveValue('가'.repeat(100));
  await field.press('Enter');
  await progress(page, 20);
});

test('SC-06 기타 선택 해제 후 남은 글은 null, 고민 중 ID 저장', async ({ page }) => {
  await toPhone(page);
  // Return through every prior screen, then remove other text through the actual S1 controls.
  for (let i = 0; i < 9; i++) await back(page);
  await activity(page, '기타').click();
  await page.getByRole('textbox', { name: '기타 활동' }).fill('보드게임');
  await activity(page, '아직 고민 중이에요').click();
  await expect(page.getByRole('textbox', { name: '기타 활동' })).toBeHidden();
  await next(page);
  await page.getByRole('button', { name: '일정에 따라 달라요' }).click();
  await next(page);
  await next(page);
  await next(page);
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await page.getByRole('button', { name: '동의하고 계속' }).click();
  for (let i = 0; i < 3; i++) await next(page);
  await submit(page);
  await assertPayload(page, { ...defaultPayload, activities: ['undecided'], days: ['flexible'] });
});

test('SC-07 SC-08 요일 전체·토글·선택 생략·일정 유동 상호 배타', async ({ page }) => {
  await toDays(page);
  await expect(page.getByRole('button', { name: '건너뛰기' })).toBeEnabled();
  for (const day of ['월', '화', '수', '목', '금', '토', '일']) {
    const button = page.getByRole('button', { name: day + '요일', exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  const flexible = page.getByRole('button', { name: '일정에 따라 달라요' });
  await flexible.click();
  await expect(page.getByRole('group', { name: '요일' }).getByRole('button', { pressed: true })).toHaveCount(0);
  await expect(flexible).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '수요일', exact: true }).click();
  await expect(flexible).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '수요일', exact: true }).click();
  await flexible.click();
  await flexible.click();
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await progress(page, 30);
});

test('SC-09 SC-10 참여 방식·신앙 공동체 필수 단일 선택, info-only 저장', async ({ page }) => {
  await toDays(page);
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await expect(page.getByRole('button', { name: '하나 골라 줘!' })).toBeDisabled();
  for (const name of ['정기적으로 함께하고 싶어요', '일정이 맞는 활동에 가끔 참여하고 싶어요', '우선 활동 안내를 받아보고 싶어요']) {
    await page.getByRole('radio', { name }).click();
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(1);
  }
  await next(page);
  await expect(page.getByRole('button', { name: '하나 골라 줘!' })).toBeDisabled();
  await page.getByRole('radio', { name: /네$/ }).click();
  await page.getByRole('radio', { name: /아니요/ }).click();
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(1);
  await expect(page.getByRole('radio', { name: /아니요/ })).toBeChecked();
  await next(page);
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await page.getByRole('button', { name: '동의하고 계속' }).click();
  for (const [label, value] of [['이름', '김챔퍼스'], ['학과', '소프트웨어학과'], ['학번', '20261234']]) {
    await page.getByRole('textbox', { name: label, exact: true }).fill(value);
    await next(page);
  }
  await submit(page);
  await assertPayload(page, { ...defaultPayload, participation: 'info-only' });
});

test('SC-11 의견 선택 입력·공백·1000자 제한', async ({ page }) => {
  await toComment(page);
  await expect(page.getByRole('button', { name: '건너뛰기' })).toBeEnabled();
  await comment(page).fill('   ');
  await expect(page.getByRole('button', { name: '건너뛰기' })).toBeEnabled();
  await comment(page).fill('가'.repeat(1001));
  await expect(comment(page)).toHaveValue('가'.repeat(1000));
  await next(page);
  await back(page);
  await expect(comment(page)).toHaveValue('가'.repeat(1000));
});

for (const [label, limit, pct] of [['이름', 30, 60], ['학과', 50, 70]]) {
  test(`SC-${label === '이름' ? '13' : '14'} ${label} 필수·공백·1자·${limit}자·Enter`, async ({ page }) => {
    await toName(page);
    if (label === '학과') {
      await page.getByRole('textbox', { name: '이름', exact: true }).fill('김');
      await next(page);
    }
    const field = page.getByRole('textbox', { name: label, exact: true });
    await expect(field).toBeFocused();
    await field.press('Enter');
    await progress(page, pct);
    await field.fill('   ');
    await expect(page.getByRole('button', { name: label === '이름' ? '이름을 적어 줘!' : '학과를 적어 줘!' })).toBeDisabled();
    await field.fill('김');
    await expect(page.getByRole('button', { name: '다음', exact: true })).toBeEnabled();
    await field.fill('가'.repeat(limit + 1));
    await expect(field).toHaveValue('가'.repeat(limit));
    await field.press('Enter');
    await progress(page, pct + 10);
  });
}

test('SC-15 학번 2–9자리·숫자·오류 연결·공백 제거·앞자리 0', async ({ page }) => {
  await toPhone(page);
  await back(page);
  const field = page.getByRole('textbox', { name: '학번', exact: true });
  const error = page.getByText('⚠️ 학번은 숫자로만 적어 줘 (최대 9자리)', { exact: true });
  for (const value of ['', '1', '가나다', '12a', '1234567890']) {
    await field.fill(value);
    await field.press('Enter');
    await progress(page, 80);
    await expect(page.locator('footer').getByRole('button').first()).toBeDisabled();
    if (value.length > 9 || /\D/.test(value)) {
      await expect(error).toBeVisible();
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(field).toHaveAccessibleDescription('⚠️ 학번은 숫자로만 적어 줘 (최대 9자리)');
    } else await expect(error).toBeHidden();
  }
  for (const value of ['00', '123456789', ' 00 ']) {
    await field.fill(value);
    await expect(field).toHaveValue(value.trim());
    await expect(field).toHaveAttribute('aria-invalid', 'false');
    await expect(error).toBeHidden();
    await expect(page.getByRole('button', { name: '다음', exact: true })).toBeEnabled();
  }
});

test('SC-16 전화번호 필수·길이·01 접두사·비숫자 제거·11자리 제한', async ({ page }) => {
  await toPhone(page);
  const field = page.getByRole('textbox', { name: '전화번호' });
  await field.press('Enter');
  await progress(page, 90);
  for (const value of ['abc', '010123456', '02123456789']) {
    await field.fill(value);
    await field.press('Enter');
    await expect(page.locator('footer').getByRole('button').first()).toBeDisabled();
    await progress(page, 90);
  }
  await field.fill('010-1234-567899');
  await expect(field).toHaveValue('010-1234-5678');
  await expect(page.getByRole('button', { name: '제출하기' })).toBeEnabled();
});

for (const [input, shown, digits] of [
  ['01012345678', '010-1234-5678', '01012345678'],
  ['0111234567', '011-123-4567', '0111234567'],
  ['+82 10-1234-5678', '010-1234-5678', '01012345678'],
]) {
  test(`SC-17 전화번호 정규화 ${input}`, async ({ page }) => {
    await toPhone(page);
    const field = page.getByRole('textbox', { name: '전화번호' });
    await field.fill(input);
    await expect(field).toHaveValue(shown);
    await field.press('Enter');
    await progress(page, 100);
    await assertPayload(page, { ...defaultPayload, phone: digits });
  });
}

test('SC-18 Enter 유효성 및 한글 조합 중 이동 금지', async ({ page }) => {
  await toName(page);
  const name = page.getByRole('textbox', { name: '이름', exact: true });
  await name.fill('김챔퍼스');
  await name.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await progress(page, 60);
  await name.dispatchEvent('keydown', { key: 'Enter', keyCode: 229 });
  await progress(page, 60);
  await name.press('Enter');
  await progress(page, 70);
});

test('SC-22 이전 버튼·브라우저 뒤로 가기에서 모든 답변 유지', async ({ page }) => {
  await toPhone(page);
  await page.getByRole('textbox', { name: '전화번호' }).fill('01012345678');
  await back(page);
  await expect(page.getByRole('textbox', { name: '학번', exact: true })).toHaveValue('20261234');
  await back(page);
  await expect(page.getByRole('textbox', { name: '학과', exact: true })).toHaveValue('소프트웨어학과');
  await back(page);
  await expect(page.getByRole('textbox', { name: '이름', exact: true })).toHaveValue('김챔퍼스');
  await back(page);
  await back(page);
  await comment(page).fill('뒤로 가도 유지');
  await back(page);
  await expect(page.getByRole('radio', { name: /아니요/ })).toBeChecked();
  await back(page);
  await expect(page.getByRole('radio', { name: '정기적으로 함께하고 싶어요' })).toBeChecked();
  await back(page);
  await page.getByRole('button', { name: '월요일', exact: true }).click();
  await page.evaluate(() => history.back());
  await progress(page, 10);
  await expect(activity(page, '독서모임')).toHaveAttribute('aria-pressed', 'true');
  await back(page);
  await progress(page, 0);
  await page.getByRole('button', { name: '설문 시작하기' }).click();
  await expect(activity(page, '독서모임')).toHaveAttribute('aria-pressed', 'true');
  await next(page);
  await expect(page.getByRole('button', { name: '월요일', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await next(page);
  await next(page);
  await next(page);
  await expect(comment(page)).toHaveValue('뒤로 가도 유지');
  await next(page);
  await page.getByRole('button', { name: '동의하고 계속' }).click();
  for (let i = 0; i < 3; i++) await next(page);
  await expect(page.getByRole('textbox', { name: '전화번호' })).toHaveValue('010-1234-5678');
});
