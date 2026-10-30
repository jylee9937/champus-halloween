// Scroll affordance for a long list in the stage (Figma Scroll Hint 61:74): a 52px fade into the page
// background right above the bottom bar, plus a bouncing pill. Returns a cleanup function.
// - Never shown when the content fits.
// - The pill hides for good once the user scrolls past `threshold` px; tapping it scrolls ~one screen down.
// - Both hide when the end of the list is visible.
import { prefersReducedMotion } from './ui.js';

export function attachScrollHint({ app, stage, footer, label, threshold = 60 }) {
  const hint = document.createElement('div');
  hint.className = 'scroll-hint';
  hint.innerHTML = `<div class="scroll-fade"></div>
    <button class="scroll-pill" type="button">${label}<span aria-hidden="true"> ⌄</span></button>`;
  app.appendChild(hint);
  const pill = hint.querySelector('.scroll-pill');
  let dismissed = false;

  function update() {
    const overflow = stage.scrollHeight - stage.clientHeight;
    const scrollable = overflow > 8;
    const atEnd = stage.scrollTop >= overflow - 8;
    if (stage.scrollTop > threshold) dismissed = true;
    hint.classList.toggle('fade-on', scrollable && !atEnd);
    hint.classList.toggle('pill-on', scrollable && !atEnd && !dismissed);
  }
  // Sit right on top of the bottom bar, whatever its height.
  const place = () => { hint.style.bottom = footer.offsetHeight + 'px'; };

  pill.addEventListener('click', () => {
    stage.scrollBy({ top: Math.round(stage.clientHeight * 0.85), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  });
  stage.addEventListener('scroll', update, { passive: true });
  const ro = new ResizeObserver(() => { place(); update(); });
  ro.observe(stage);
  ro.observe(footer);
  if (stage.firstElementChild) ro.observe(stage.firstElementChild);
  place();
  update();

  return () => {
    stage.removeEventListener('scroll', update);
    ro.disconnect();
    hint.remove();
  };
}
