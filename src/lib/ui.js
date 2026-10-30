// Small UI helpers shared by the survey and the lesson.

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Ported from the lesson: 60 pieces falling for 2.2–3.8s.
export function confetti(container) {
  if (!container || prefersReducedMotion()) return;
  const cols = ['#58CC02', '#FF9600', '#FFC800', '#1CB0F6', '#FF4B4B', '#CE82FF'];
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('i');
    s.style.left = Math.random() * 100 + '%';
    s.style.background = cols[i % cols.length];
    s.style.animationDelay = (Math.random() * 1.4) + 's';
    s.style.animationDuration = (2.2 + Math.random() * 1.6) + 's';
    s.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
    container.appendChild(s);
  }
}

// Figma: Reward Coupon (37:74). `note` is the optional second stub line.
export function couponHtml(name, note) {
  return `<section class="coupon" aria-label="핫초코 교환권">
    <div class="coupon-main">
      <div class="coupon-icon" aria-hidden="true">☕</div>
      <div class="coupon-text">
        <p class="coupon-title"><b>핫초코</b> 교환권</p>
        <span class="coupon-name">${escapeHtml(name)}님</span>
      </div>
    </div>
    <div class="coupon-cut" aria-hidden="true"></div>
    <div class="coupon-stub">
      <b>부스 스태프에게 이 화면을 보여 줘!</b>
      ${note ? `<span>${note}</span>` : ''}
    </div>
  </section>`;
}

export const INSTAGRAM_URL = 'https://www.instagram.com/champus_ajou';
