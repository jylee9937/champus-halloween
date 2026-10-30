// The fixed frame around every screen: top bar (back, progress, pill), stage, bottom bar and feedback banner.
// Survey and lesson both draw into it.

export function createShell() {
  const $ = id => document.getElementById(id);
  const stage = $('stage'), backBtn = $('backBtn'), fill = $('fill'), prog = $('prog'), pill = $('pill'),
    bottom = $('bottom'), bottomSub = $('bottomSub'), nextBtn = $('nextBtn'), linkBtn = $('linkBtn'),
    banner = $('banner'), bannerIcon = $('bannerIcon'), bannerTitle = $('bannerTitle'), bannerSub = $('bannerSub'), contBtn = $('contBtn');

  return {
    stage, backBtn, nextBtn, linkBtn, contBtn, banner,

    /** Replaces the stage content and returns the new `.screen` element. */
    show(html, dir) {
      stage.innerHTML = html;
      const screen = stage.firstElementChild;
      if (dir === 'back') screen.classList.add('back');
      stage.scrollTop = 0;
      return screen;
    },

    progress(pct) {
      fill.style.width = pct + '%';
      prog.setAttribute('aria-valuenow', pct);
    },

    pill(text, label) {
      pill.textContent = text;
      pill.setAttribute('aria-label', label);
    },

    bumpPill() {
      pill.classList.remove('bump');
      void pill.offsetWidth;
      pill.classList.add('bump');
    },

    back(enabled) {
      backBtn.disabled = !enabled;
    },

    cta(label, { disabled = false } = {}) {
      nextBtn.textContent = label;
      nextBtn.disabled = disabled;
      nextBtn.className = 'btn';
    },

    /** Optional line above the CTA and underlined link below it. */
    extras({ sub = '', link = '' } = {}) {
      bottomSub.hidden = !sub;
      bottomSub.textContent = sub;
      linkBtn.hidden = !link;
      linkBtn.textContent = link;
      bottom.classList.toggle('with-link', !!link);
    },

    showBanner({ ok, title, sub, button }) {
      banner.className = 'banner ' + (ok ? 'ok' : 'bad');
      bannerIcon.textContent = ok ? '✓' : '✕';
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      contBtn.textContent = button;
      contBtn.className = 'btn' + (ok ? '' : ' red');
      banner.hidden = false;
      contBtn.focus();
    },

    hideBanner() {
      banner.hidden = true;
    },
  };
}
