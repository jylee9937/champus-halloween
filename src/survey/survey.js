// Activity sign-up survey: S0 intro → S1…S9 one question per screen → S10 completion coupon.
// Figma: survey flow 21:1370, states 21:1371, components 15:79.
import { pumpkin, candle } from '../lib/characters.js';
import { confetti, couponHtml, INSTAGRAM_URL } from '../lib/ui.js';
import { track } from '../lib/analytics.js';
import { ACTIVITIES, DAYS, FLEXIBLE, PARTICIPATION } from './data.js';
import {
  LIMITS, emptyAnswers, toggleActivity, toggleDay, activitiesComplete, isValidName, isValidDepartment,
  isValidStudentId, studentIdHasError, isValidPhone, phoneDigits, formatPhone, buildPayload,
} from '../lib/validate.js';

const DONE_KEY = 'champus:done';
const QUESTIONS = 9;

// Figma icon/info, drawn with currentColor so it follows the theme.
const INFO_ICON = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M17.9167 10C17.9167 14.3723 14.3723 17.9167 10 17.9167C5.62775 17.9167 2.08333 14.3723 2.08333 10C2.08333 5.62775 5.62775 2.08333 10 2.08333C14.3723 2.08333 17.9167 5.62775 17.9167 10Z" stroke="currentColor" stroke-width="1.83333"/><path d="M10 9.16667V13.75" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 7.58333C10.6904 7.58333 11.25 7.02369 11.25 6.33333C11.25 5.64298 10.6904 5.08333 10 5.08333C9.30964 5.08333 8.75 5.64298 8.75 6.33333C8.75 7.02369 9.30964 7.58333 10 7.58333Z" fill="currentColor"/></svg>`;

const ask = (text, who = candle('happy')) => `<div class="line">${who}<div class="bubble">${text}</div></div>`;
const isEnter = e => e.key === 'Enter' && !e.isComposing && e.keyCode !== 229;

function readDone() {
  try {
    const v = JSON.parse(sessionStorage.getItem(DONE_KEY));
    return v?.done === true && typeof v.name === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function createSurvey({ shell, nav, onLesson }) {
  let a = emptyAnswers();
  let i = 0;
  let doneName = '';
  let sending = false;
  let screenEl = null;
  let sheetOpener = null;
  let firebase = null;

  const loadFirebase = () => (firebase ??= import('../lib/firebase.js').catch(err => { firebase = null; throw err; }));

  /* ---------- screens ---------- */

  const choice = (items, picked) => `<div class="opts choice" role="radiogroup">${items.map((o, n) =>
    `<button class="opt${picked === o.value ? ' picked' : ''}" type="button" role="radio" aria-checked="${picked === o.value}" data-v="${n}"><span class="k">${n + 1}</span><span>${o.label}</span></button>`).join('')}</div>`;

  const input = (attrs, { error = '', field = '' } = {}) => `<div class="field" ${field}><input class="input" ${attrs}>${error}</div>`;

  const screens = [
    {
      id: 's0', progress: 0, count: 0,
      html: () => `<div class="screen">
        <div class="eyebrow">CHAMPUS · 기독교 봉사 동아리</div>
        <h1 class="title"><span class="o">챔퍼스</span>를<br>소개할게!</h1>
        <div class="duo">
          <div class="speaker"><div class="bubble bubble-top">챔퍼스?<br>그게 뭐야?</div>${pumpkin('think')}</div>
          <div class="speaker"><div class="bubble bubble-top">함께 배우고<br>나누는 공동체야!</div>${candle('happy')}</div>
        </div>
        <p class="sub">교육봉사·독서모임·풋살·스터디·멘토링까지!<br>질문 9개, 2분이면 끝! 📝</p>
      </div>`,
      cta: () => ['설문 시작하기'],
    },
    {
      id: 's1', progress: 10, count: 1,
      html: () => `<div class="screen">
        ${ask('하고 싶은 활동을<br>모두 골라 줘! 🙌')}
        <p class="sub">여러 개 골라도 괜찮아</p>
        <div class="acts" role="group" aria-label="하고 싶은 활동">${ACTIVITIES.map(act => {
          const info = !act.exclusive && !act.needsText;
          return `<div class="act-cell">
            <button class="act${info ? ' has-info' : ''}" type="button" aria-pressed="false" data-id="${act.id}">
              <span class="act-head"><span class="act-emoji" aria-hidden="true">${act.emoji}</span><span class="check" aria-hidden="true">✓</span></span>
              <span class="act-name">${act.name}</span>
            </button>
            ${info ? `<button class="act-info" type="button" data-info="${act.id}" aria-label="${act.name} 소개 보기">${INFO_ICON}</button>` : ''}
          </div>`;
        }).join('')}</div>
        ${input(`id="otherInput" type="text" maxlength="${LIMITS.activityOther}" placeholder="어떤 활동인지 적어 줘" aria-label="기타 활동" enterkeyhint="next" autocomplete="off"`,
          { field: 'id="otherField" hidden' })}
      </div>`,
      mount: el => {
        el.querySelector('.acts').addEventListener('click', e => {
          const info = e.target.closest('.act-info');
          if (info) return openSheet(info.dataset.info, info);
          const tile = e.target.closest('.act');
          if (!tile) return;
          const id = tile.dataset.id;
          setActivity(id, !a.activities.includes(id));
          if (id === 'other' && a.activities.includes('other')) el.querySelector('#otherInput').focus();
        });
        bindText(el.querySelector('#otherInput'), () => a.activityOther, v => { a.activityOther = v; });
        syncActivities();
      },
      cta: () => !a.activities.length ? ['활동을 골라 줘!', true]
        : !activitiesComplete(a) ? ['기타 활동을 적어 줘!', true]
        : ['다음'],
    },
    {
      id: 's2', progress: 20, count: 2,
      html: () => `<div class="screen">
        ${ask('참여하기 편한<br>요일은 언제야?')}
        <p class="sub">여러 개 골라도 되고, 안 골라도 괜찮아</p>
        <div class="days" role="group" aria-label="요일">${DAYS.map(d =>
          `<button class="sel day" type="button" aria-pressed="false" data-day="${d.id}" aria-label="${d.label}요일">${d.label}</button>`).join('')}</div>
        <button class="sel wide" type="button" aria-pressed="false" data-day="${FLEXIBLE.id}">${FLEXIBLE.label}</button>
      </div>`,
      mount: el => {
        const sync = () => el.querySelectorAll('[data-day]').forEach(b => b.setAttribute('aria-pressed', a.days.includes(b.dataset.day)));
        el.addEventListener('click', e => {
          const b = e.target.closest('[data-day]');
          if (!b) return;
          a.days = toggleDay(a.days, b.dataset.day);
          sync();
          refresh();
        });
        sync();
      },
      cta: () => [a.days.length ? '다음' : '건너뛰기'],
    },
    {
      id: 's3', progress: 30, count: 3,
      html: () => `<div class="screen">
        ${ask('어떻게<br>함께하고 싶어?')}
        ${choice(PARTICIPATION.map(p => ({ value: p.id, label: p.label })), a.participation)}
      </div>`,
      mount: el => bindChoice(el, PARTICIPATION.map(p => p.id), v => { a.participation = v; }),
      cta: () => (a.participation ? ['다음'] : ['하나 골라 줘!', true]),
    },
    {
      id: 's3-1', progress: 40, count: 4,
      html: () => `<div class="screen">
        ${ask('학교 안에서<br>신앙 공동체를<br>찾고 있어?')}
        <p class="sub">찾고 있다면<br>기독교 활동 안내를 따로 보내 줄게 🙏</p>
        ${choice([{ value: true, label: '네' }, { value: false, label: '아니요' }], a.seekingFaithCommunity)}
      </div>`,
      mount: el => bindChoice(el, [true, false], v => { a.seekingFaithCommunity = v; }),
      cta: () => (a.seekingFaithCommunity !== null ? ['다음'] : ['하나 골라 줘!', true]),
    },
    {
      id: 's4', progress: 50, count: 5,
      html: () => `<div class="screen">
        ${ask('해보고 싶은 활동이나<br>궁금한 점 있어?')}
        <p class="sub">없으면 건너뛰어도 돼!</p>
        <textarea class="input" id="commentInput" maxlength="${LIMITS.comment}" placeholder="예) 향수공방은 언제 해요?" aria-label="해보고 싶은 활동이나 궁금한 점"></textarea>
      </div>`,
      mount: el => {
        const t = el.querySelector('#commentInput');
        t.value = a.comment;
        t.addEventListener('input', () => { a.comment = t.value; refresh(); });
      },
      cta: () => [a.comment.trim() ? '다음' : '건너뛰기'],
    },
    // S5 (privacy notice + consent) was removed: S4 goes straight to S6. Analytics keeps s6=7 etc.
    {
      id: 's6', progress: 60, count: 6, focus: true,
      html: () => `<div class="screen">
        ${ask('이름이 뭐야?')}
        ${input(`id="nameInput" type="text" maxlength="${LIMITS.name}" placeholder="이름을 적어 줘" aria-label="이름" autocomplete="name" enterkeyhint="next"`)}
      </div>`,
      mount: el => {
        loadFirebase().catch(() => {}); // warm the submit path before the contact screens
        bindText(el.querySelector('#nameInput'), () => a.name, v => { a.name = v; });
      },
      cta: () => (isValidName(a.name) ? ['다음'] : ['이름을 적어 줘!', true]),
    },
    {
      id: 's7', progress: 70, count: 7, focus: true,
      html: () => `<div class="screen">
        ${ask('무슨 과야?')}
        ${input(`id="deptInput" type="text" maxlength="${LIMITS.department}" placeholder="학과를 적어 줘" aria-label="학과" autocomplete="off" enterkeyhint="next"`)}
      </div>`,
      mount: el => bindText(el.querySelector('#deptInput'), () => a.department, v => { a.department = v; }),
      cta: () => (isValidDepartment(a.department) ? ['다음'] : ['학과를 적어 줘!', true]),
    },
    {
      id: 's8', progress: 80, count: 8, focus: true,
      html: () => `<div class="screen">
        ${ask('학번을 알려 줘!')}
        ${input(`id="sidInput" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="20" placeholder="학번을 적어 줘" aria-label="학번" aria-describedby="sidError" autocomplete="off" enterkeyhint="next"`,
          { error: '<p class="field-error" id="sidError" hidden>⚠️ 학번은 숫자로만 적어 줘 (최대 9자리)</p>' })}
      </div>`,
      mount: el => {
        const inp = el.querySelector('#sidInput'), err = el.querySelector('#sidError');
        const sync = () => {
          const bad = studentIdHasError(a.studentId);
          inp.setAttribute('aria-invalid', bad);
          err.hidden = !bad;
        };
        bindText(inp, () => a.studentId, v => {
          const clean = v.replace(/\s/g, '');
          if (clean !== v) inp.value = clean;
          a.studentId = clean;
          sync();
        });
        sync();
      },
      cta: () => (!a.studentId ? ['학번을 적어 줘!', true] : ['다음', !isValidStudentId(a.studentId)]),
    },
    {
      id: 's9', progress: 90, count: 9, focus: true,
      html: () => `<div class="screen">
        ${ask('연락받을<br>전화번호는?')}
        ${input(`id="phoneInput" type="tel" inputmode="tel" placeholder="010-1234-5678" aria-label="전화번호" aria-describedby="phoneHint" autocomplete="tel" enterkeyhint="send"`)}
        <p class="sub" id="phoneHint">숫자만 적으면 돼</p>
      </div>`,
      mount: el => bindPhone(el.querySelector('#phoneInput')),
      cta: () => (sending ? ['보내는 중…', true]
        : !a.phone ? ['번호를 적어 줘!', true]
        : ['제출하기', !isValidPhone(a.phone)]),
    },
    {
      id: 's10', progress: 100, count: 9,
      html: () => `<div class="screen">
        <div class="confetti"></div>
        <div class="eyebrow">설문 완료</div>
        <h1 class="title">신청 <span class="o">완료</span>! 🎉</h1>
        ${couponHtml(doneName, { note: '할로윈 퀴즈까지 풀면 쿠키도 줄게! 🍪' })}
        ${ask('고마워! 활동 일정은<br><b>연락처</b>로 알려 줄게 📱', pumpkin('happy'))}
        <a class="ig-link" href="${INSTAGRAM_URL}" target="_blank" rel="noopener">📷 인스타그램 @champus_ajou</a>
      </div>`,
      extras: { chip: '퀴즈 3개 · 3분', sub: '할로윈의 진짜 의미, 3분 퀴즈로 알아보자!' },
      mount: el => {
        confetti(el.querySelector('.confetti'));
        el.querySelector('.ig-link').addEventListener('click', () => track.instagram('done'));
      },
      cta: () => ['할로윈 퀴즈 풀고 쿠키 받기 🍪'],
    },
  ];
  const indexOf = id => screens.findIndex(s => s.id === id);

  /* ---------- input bindings ---------- */

  function bindText(el, read, write) {
    el.value = read();
    el.addEventListener('input', () => { write(el.value); refresh(); });
    el.addEventListener('keydown', e => { if (isEnter(e)) { e.preventDefault(); next(); } });
  }

  function bindChoice(el, values, write) {
    const opts = [...el.querySelectorAll('.opt')];
    opts.forEach((b, n) => b.addEventListener('click', () => {
      write(values[n]);
      opts.forEach((o, m) => { o.classList.toggle('picked', m === n); o.setAttribute('aria-checked', m === n); });
      refresh();
    }));
  }

  // Shows 010-1234-5678 while storing digits only. Keeps the caret after the same digit,
  // and lets backspace right after a dash delete the digit before it.
  function bindPhone(el) {
    el.value = formatPhone(a.phone);
    el.addEventListener('input', e => {
      let caret = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, '').length;
      let d = phoneDigits(el.value);
      if (e.inputType === 'deleteContentBackward' && d === a.phone && caret > 0) {
        d = d.slice(0, caret - 1) + d.slice(caret);
        caret--;
      }
      const shown = formatPhone(d);
      el.value = shown;
      let pos = 0;
      for (let seen = 0; pos < shown.length && seen < caret; pos++) if (/\d/.test(shown[pos])) seen++;
      if (document.activeElement === el) el.setSelectionRange(pos, pos);
      a.phone = d;
      refresh();
    });
    el.addEventListener('keydown', e => { if (isEnter(e)) { e.preventDefault(); next(); } });
  }

  /* ---------- activities + info sheet ---------- */

  function setActivity(id, on) {
    a.activities = toggleActivity(a.activities, id, on);
    syncActivities();
    refresh();
  }

  function syncActivities() {
    screenEl.querySelectorAll('.act').forEach(t => t.setAttribute('aria-pressed', a.activities.includes(t.dataset.id)));
    const field = screenEl.querySelector('#otherField');
    if (field) field.hidden = !a.activities.includes('other');
  }

  const sheetRoot = document.getElementById('sheetRoot');
  const appEl = document.getElementById('app');

  function openSheet(id, opener) {
    const act = ACTIVITIES.find(x => x.id === id);
    const picked = a.activities.includes(id);
    sheetOpener = opener;
    track.infoOpen(id);
    sheetRoot.innerHTML = `<div class="sheet-dim"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetName">
        <div class="sheet-grab" aria-hidden="true"></div>
        <div class="sheet-body">
          <div class="sheet-icon" aria-hidden="true">${act.emoji}</div>
          <h2 class="sheet-name" id="sheetName">${act.name}</h2>
          <p class="sheet-intro">${act.intro}</p>
          <p class="sheet-when">🕒 ${act.when}</p>
          ${picked ? '<p class="sheet-picked">✓ 이미 고른 활동이야</p>' : ''}
        </div>
        <div class="sheet-actions">
          ${picked
            ? '<button class="sel wide" type="button" data-act="unpick">선택 취소하기</button>'
            : '<button class="btn" type="button" data-act="pick">이 활동 고르기</button>'}
          <button class="sheet-close" type="button" data-act="close">닫기</button>
        </div>
      </div>`;
    appEl.inert = true;
    sheetRoot.querySelector('.sheet-dim').addEventListener('click', closeSheet);
    sheetRoot.querySelector('.sheet-actions').addEventListener('click', e => {
      const what = e.target.closest('[data-act]')?.dataset.act;
      if (!what) return;
      if (what === 'pick') track.infoSelect(id);
      if (what !== 'close') setActivity(id, what === 'pick');
      closeSheet();
    });
    sheetRoot.querySelector('.sheet-actions button').focus();
  }

  function closeSheet() {
    if (!sheetRoot.firstChild) return false;
    sheetRoot.innerHTML = '';
    appEl.inert = false;
    sheetOpener?.focus();
    sheetOpener = null;
    return true;
  }

  // Modal keyboard: Esc closes (focus returns to the ⓘ that opened it); Tab/Shift+Tab cycle inside the sheet.
  // The page behind is inert, but without this trap Shift+Tab would leave the document for the browser UI.
  document.addEventListener('keydown', e => {
    if (!sheetRoot.firstChild) return;
    if (e.key === 'Escape') { closeSheet(); return; }
    if (e.key !== 'Tab') return;
    const items = [...sheetRoot.querySelectorAll('.sheet button:not([disabled])')];
    const i = items.indexOf(document.activeElement);
    const wrapTo = e.shiftKey ? (i <= 0 ? items.at(-1) : null) : (i < 0 || i === items.length - 1 ? items[0] : null);
    if (wrapTo) {
      e.preventDefault();
      wrapTo.focus();
    }
  });

  /* ---------- flow ---------- */

  const canBack = () => i > 0 && screens[i].id !== 's10' && !sending;

  function refresh() {
    const [label, disabled = false] = screens[i].cta();
    shell.cta(label, { disabled });
    shell.back(canBack());
  }

  function render(dir) {
    const s = screens[i];
    closeSheet();
    shell.hideBanner();
    screenEl = shell.show(s.html(), dir);
    track.screen(s.id.replace('-', '_'));
    shell.progress(s.progress);
    shell.pill(`📝 ${s.count}/${QUESTIONS}`, `설문 ${QUESTIONS}문항 중 ${s.count}번째`);
    shell.extras(s.extras);
    s.mount?.(screenEl);
    refresh();
    if (s.focus) screenEl.querySelector('.input').focus();
  }

  function go(to) {
    nav.push();
    i = to;
    render('fwd');
  }

  function next() {
    const s = screens[i];
    if (sending || s.cta()[1]) return;
    if (s.id === 's9') return submit();
    if (s.id === 's10') return onLesson();
    go(i + 1);
  }

  function back() {
    if (closeSheet() || !canBack()) return;
    i--;
    render('back');
  }

  async function submit() {
    if (sending) return;
    sending = true;
    shell.hideBanner();
    refresh();
    track.submitAttempt();
    try {
      const { submitResponse } = await loadFirebase();
      const id = await submitResponse(buildPayload(a));
      if (import.meta.env.DEV) console.info('[survey] saved response', id);
      track.submitted();
      // Keep only the name (for the coupon); everything else leaves memory.
      doneName = a.name.trim();
      a = emptyAnswers();
      try { sessionStorage.setItem(DONE_KEY, JSON.stringify({ done: true, name: doneName })); } catch { /* private mode */ }
      sending = false;
      go(indexOf('s10'));
    } catch (err) {
      console.error('[survey] submit failed', err);
      track.submitFailure();
      sending = false;
      refresh();
      shell.showBanner({ ok: false, title: '전송이 안 됐어요', sub: '인터넷 연결을 확인하고 다시 보내 줘', button: '다시 보내기' });
    }
  }

  return {
    /** First paint: a finished survey in this tab (sessionStorage) lands straight on the coupon. */
    start() {
      const saved = readDone();
      if (saved) doneName = saved.name;
      i = saved ? indexOf('s10') : 0;
      render('fwd');
    },
    showDone(dir) {
      i = indexOf('s10');
      render(dir);
    },
    name: () => doneName,
    next,
    back,
    bannerAction: submit,
  };
}
