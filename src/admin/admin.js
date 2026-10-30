// Admin page: Google sign-in → allowlist check (admins/{email}) → responses, summary and CSV export.
import '../styles/admin.css';
import { watchAuth, signInWithGoogle, signOut, isAdmin, purgeExpired, fetchResponses, NotConfiguredError } from '../lib/firebase.js';
import { escapeHtml } from '../lib/ui.js';
import { COLUMNS, dedupeByPhone, newestFirst, summarize, toCells, toCsv, csvFilename } from './report.js';

const root = document.getElementById('admin');
let user = null;
let rows = [];
let showDupes = false;
let purged = 0;

const gate = (title, body = '', actions = '') => `<section class="adm-gate">
  <div class="adm-card">
    <div class="adm-logo" aria-hidden="true">🎃</div>
    <h1>${title}</h1>
    ${body ? `<p>${body}</p>` : ''}
    ${actions}
  </div>
</section>`;

const view = html => { root.innerHTML = html; };
const loading = () => view(gate('불러오는 중…'));

function showError(err) {
  console.error(err);
  view(gate('문제가 생겼어요', escapeHtml(err?.message ?? String(err)),
    '<button class="adm-btn" data-action="reload">다시 시도</button>'));
}

function renderSignedOut() {
  view(gate('관리자 로그인', '챔퍼스 설문 응답은 관리자만 볼 수 있어요.',
    '<button class="adm-btn primary" data-action="signin">Google로 로그인</button><p class="adm-error" id="signinError" hidden></p>'));
}

function renderDenied() {
  view(gate('관리자 권한이 없어요', `${escapeHtml(user.email)} 계정은 관리자로 등록되어 있지 않아요.`,
    '<button class="adm-btn" data-action="signout">로그아웃</button>'));
}

function renderData() {
  const unique = dedupeByPhone(rows);
  const uniqueIds = new Set(unique.map(r => r.id));
  const list = showDupes ? newestFirst(rows) : unique;
  const s = summarize(unique);
  const dupes = rows.length - unique.length;

  view(`<header class="adm-top">
      <h1>🎃 챔퍼스 설문 응답</h1>
      <div class="adm-user">
        <span>${escapeHtml(user.email)}</span>
        <button class="adm-btn" data-action="refresh">새로고침</button>
        <button class="adm-btn" data-action="signout">로그아웃</button>
      </div>
    </header>
    ${purged > 0 ? `<p class="adm-notice" role="status">🧹 1년 지난 응답 ${purged}개를 정리했어요</p>` : ''}
    <section class="adm-stats" aria-label="요약">
      <div class="adm-stat"><span>응답자</span><b>${s.respondents}<small>명</small></b><em>연락처 기준 중복 제외</em></div>
      <div class="adm-stat"><span>신앙 공동체 '네'</span><b>${s.faithYes}<small>명</small></b><em>기독교 활동 안내 대상</em></div>
      <div class="adm-stat wide"><span>활동별 인원</span>
        <ul class="adm-acts">${s.activities.map(a =>
          `<li><span>${a.emoji} ${escapeHtml(a.name)}</span><b>${a.count}</b></li>`).join('')}</ul>
      </div>
    </section>
    <section class="adm-controls">
      <label class="adm-toggle"><input type="checkbox" data-action="dupes" ${showDupes ? 'checked' : ''}>
        중복 응답도 보기 <small>(${dupes}건)</small></label>
      <span class="adm-count">${list.length}건 표시</span>
      <button class="adm-btn primary" data-action="csv" ${unique.length ? '' : 'disabled'}>엑셀(CSV) 다운로드</button>
    </section>
    <div class="adm-table-wrap">
      <table class="adm-table">
        <thead><tr>${COLUMNS.map(c => `<th scope="col">${c}</th>`).join('')}</tr></thead>
        <tbody>${list.length ? list.map(r => `<tr class="${uniqueIds.has(r.id) ? '' : 'dupe'}">${toCells(r).map((v, n) =>
          `<td class="c${n}">${escapeHtml(v)}${n === 1 && !uniqueIds.has(r.id) ? ' <span class="adm-badge">중복</span>' : ''}</td>`).join('')}</tr>`).join('')
          : `<tr><td class="adm-empty" colspan="${COLUMNS.length}">아직 응답이 없어요</td></tr>`}</tbody>
      </table>
    </div>`);
}

async function load() {
  loading();
  try {
    rows = await fetchResponses();
    renderData();
  } catch (err) {
    showError(err);
  }
}

function downloadCsv() {
  const blob = new Blob([toCsv(dedupeByPhone(rows))], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: csvFilename() });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

root.addEventListener('click', async e => {
  const action = e.target.closest('button[data-action]')?.dataset.action;
  if (action === 'signin') {
    try {
      await signInWithGoogle();
    } catch (err) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
      const msg = root.querySelector('#signinError');
      if (msg) { msg.hidden = false; msg.textContent = '로그인에 실패했어요: ' + (err?.code ?? err?.message); }
    }
  }
  if (action === 'signout') await signOut();
  if (action === 'refresh') await load();
  if (action === 'csv') downloadCsv();
  if (action === 'reload') location.reload();
});

root.addEventListener('change', e => {
  if (e.target.matches('[data-action="dupes"]')) {
    showDupes = e.target.checked;
    renderData();
  }
});

loading();
watchAuth(async u => {
  user = u;
  rows = [];
  purged = 0;
  if (!u) return renderSignedOut();
  loading();
  try {
    if (!(await isAdmin(u.email))) return renderDenied();
  } catch (err) {
    return showError(err);
  }
  // Responses are kept for a year. Clean up on every admin load; a failure here must not hide the data.
  try {
    purged = await purgeExpired();
  } catch (err) {
    console.error('[admin] purge failed', err);
  }
  await load();
}).catch(err => {
  if (err instanceof NotConfiguredError) view(gate('Firebase 설정이 아직 없어요', 'src/lib/firebase-config.js에 웹 앱 설정을 넣어 주세요.'));
  else showError(err);
});
