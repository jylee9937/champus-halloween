// "분석" tab markup: KPI tiles, two funnels (single-series bars) and the ⓘ table.
// Every number is printed in the rows; the hover/focus tooltip only repeats it (it never gates a value).
import { escapeHtml } from '../lib/ui.js';

const pct = v => (v == null ? '–' : `${Math.round(v * 100)}%`);
const n = v => v.toLocaleString('ko-KR');

function tile(label, value, note = '') {
  return `<div class="adm-stat"><span>${label}</span><b>${value}</b>${note ? `<em>${note}</em>` : ''}</div>`;
}

function funnelRows(steps, unit) {
  return steps.map((st, i) => {
    // Values lead, the label follows.
    const tip = [
      `${n(st.count)}${unit} · 처음 대비 ${pct(st.pct)}`,
      i ? `이전 단계보다 ${n(st.drop)}${unit} 감소 (${pct(st.dropRate)})` : '',
      st.label,
    ].filter(Boolean).join('\n');
    const drop = i && st.drop
      ? `<span class="fn-drop${st.biggestDrop ? ' worst' : ''}">${st.biggestDrop ? '⚠️ 가장 큰 이탈 ' : ''}−${n(st.drop)}</span>`
      : '<span class="fn-drop"></span>';
    return `<li class="fn-row${st.biggestDrop ? ' worst' : ''}" tabindex="0" data-tip="${escapeHtml(tip)}">
      <span class="fn-label">${escapeHtml(st.label)}</span>
      <span class="fn-track"><span class="fn-bar" style="width:${(st.pct * 100).toFixed(1)}%"></span></span>
      <span class="fn-count">${n(st.count)}</span>
      <span class="fn-pct">${pct(st.pct)}</span>
      ${drop}
    </li>`;
  }).join('');
}

function funnelCard(title, sub, steps, unit, empty) {
  const body = steps[0].count
    ? `<ol class="fn" aria-label="${escapeHtml(title)}">${funnelRows(steps, unit)}</ol>`
    : `<p class="an-empty">${empty}</p>`;
  return `<section class="an-card" aria-label="${escapeHtml(title)}">
    <header><h2>${title}</h2><p>${sub}</p></header>
    ${body}
  </section>`;
}

function picksCard({ respondents, rows }) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return `<section class="an-card wide" aria-label="활동별 선택">
    <header><h2>활동별 선택</h2><p>많이 고른 순 · 연락처 기준 중복 제외 응답자 ${n(respondents)}명 대비</p></header>
    <div class="an-table-wrap">
      <table class="an-table">
        <thead><tr><th scope="col">활동</th><th scope="col">고른 사람</th><th scope="col" class="num">응답자 대비</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <th scope="row">${r.emoji} ${escapeHtml(r.name)}</th>
          <td tabindex="0" data-tip="${escapeHtml(`${n(r.count)}명 · 응답자의 ${pct(r.share)}\n${r.name}`)}">
            <div class="an-opens">
              <span class="an-bar-track"><span class="fn-bar" style="width:${(r.count / max * 100).toFixed(1)}%"></span></span>
              <span class="an-num">${n(r.count)}</span>
            </div>
          </td>
          <td class="an-num">${pct(r.share)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
  </section>`;
}

// Legacy: ⓘ counts recorded while S1 used compact tiles + an info sheet. Shown collapsed, only if any exist.
function infoHistory(rows) {
  if (!rows) return '';
  const max = Math.max(1, ...rows.map(r => r.opens));
  return `<details class="an-card wide an-legacy">
    <summary>이전 ⓘ 기록 <small>(ⓘ 소개 시트를 쓰던 때의 열람 수)</small></summary>
    <div class="an-table-wrap" role="region" aria-label="이전 ⓘ 기록">
      <table class="an-table">
        <thead><tr>
          <th scope="col">활동</th><th scope="col">ⓘ 열람</th><th scope="col" class="num">열어 본 세션</th>
          <th scope="col" class="num">시트에서 고름</th><th scope="col" class="num">ⓘ 본 뒤 고른 비율</th><th scope="col" class="num">전체 신청</th>
        </tr></thead>
        <tbody>${rows.map(r => `<tr>
          <th scope="row">${r.emoji} ${escapeHtml(r.name)}</th>
          <td tabindex="0" data-tip="${escapeHtml(`${n(r.opens)}회 · ${n(r.openedSessions)}세션\n${r.name} ⓘ 열람`)}">
            <div class="an-opens">
              <span class="an-bar-track"><span class="fn-bar" style="width:${(r.opens / max * 100).toFixed(1)}%"></span></span>
              <span class="an-num">${n(r.opens)}</span>
            </div>
          </td>
          <td class="an-num">${n(r.openedSessions)}</td>
          <td class="an-num">${n(r.selects)}</td>
          <td class="an-num">${pct(r.selectRate)}</td>
          <td class="an-num">${n(r.picks)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
  </details>`;
}

/** `report` comes from analyticsReport(); `range` is 'today' | 'all'. */
export function analyticsHtml(report, range) {
  const { survey, lesson, submit } = report;
  const done = survey[survey.length - 1].count;
  return `<div class="an-filter" role="group" aria-label="기간">
      <button class="an-seg" data-action="range" data-range="today" aria-pressed="${range === 'today'}">오늘</button>
      <button class="an-seg" data-action="range" data-range="all" aria-pressed="${range === 'all'}">전체</button>
      <span class="an-range-note">${range === 'today' ? `${report.day} (한국 시간) 시작한 방문만` : '저장된 모든 방문'}</span>
    </div>
    <section class="adm-stats an-kpis" aria-label="분석 요약">
      ${tile('방문(세션)', `${n(report.sessions)}<small>회</small>`, '브라우저 탭 하나 = 1세션')}
      ${tile('신청 완료', `${n(done)}<small>회</small>`, report.sessions ? `방문의 ${pct(done / report.sessions)}` : '')}
      ${tile('레슨 완주', `${n(lesson.completed)}<small>회</small>`, `다시 보기 ${n(lesson.restarts)}번 (${n(lesson.restartSessions)}세션)`)}
      ${tile('제출', `${n(submit.successes)}<small>/${n(submit.attempts)}</small>`, `성공/시도 · 실패 ${n(submit.failures)}번`)}
      ${tile('인스타그램 클릭', `${n(submit.instagramDone + submit.instagramLessonEnd)}<small>번</small>`,
        `신청 완료 ${n(submit.instagramDone)} · 레슨 끝 ${n(submit.instagramLessonEnd)}`)}
    </section>
    <div class="an-grid">
      ${funnelCard('설문 퍼널', '각 화면까지 온 세션 수 · 처음(챔퍼스 소개) 대비', survey, '세션', '아직 방문 기록이 없어요')}
      ${funnelCard('레슨 퍼널', '신청을 마친 세션 중 각 화면까지 본 수', lesson.steps, '세션', '아직 신청을 마친 세션이 없어요')}
      ${picksCard(report.picks)}
      ${infoHistory(report.info)}
    </div>
    <div class="an-tip" role="tooltip" hidden></div>`;
}

let activeTip = null;
addEventListener('scroll', () => { if (activeTip) activeTip.hidden = true; }, { passive: true, capture: true });

/** One shared tooltip for every [data-tip] element: same text on hover and keyboard focus. */
export function bindTooltips(container) {
  const tip = container.querySelector('.an-tip');
  if (!tip) return;
  activeTip = tip;
  const show = el => {
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect(), box = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left + r.width / 2 - box.width / 2), innerWidth - box.width - 8);
    const top = r.top - box.height - 8 < 8 ? r.bottom + 8 : r.top - box.height - 8;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  };
  const hide = () => { tip.hidden = true; };
  for (const el of container.querySelectorAll('[data-tip]')) {
    el.addEventListener('pointerenter', () => show(el));
    el.addEventListener('pointerleave', hide);
    el.addEventListener('focus', () => show(el));
    el.addEventListener('blur', hide);
  }
}
