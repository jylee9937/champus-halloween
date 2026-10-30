// Booth app entry: survey first, then the Halloween lesson. Both draw into the same shell.
import './styles/app.css';
import { createShell } from './shell.js';
import { createHistoryNav } from './lib/nav.js';
import { createSurvey } from './survey/survey.js';
import { createLesson } from './lesson/lesson.js';

const shell = createShell();
let current;
const nav = createHistoryNav(() => current.back());

const survey = createSurvey({
  shell, nav,
  onLesson() {
    nav.push();
    current = lesson;
    lesson.start();
  },
});

const lesson = createLesson({
  shell, nav,
  getName: survey.name,
  onExit() {
    current = survey;
    survey.showDone('back');
  },
});

shell.nextBtn.addEventListener('click', () => current.next());
shell.backBtn.addEventListener('click', () => nav.back());
shell.linkBtn.addEventListener('click', () => current.link?.());
shell.contBtn.addEventListener('click', () => current.bannerAction());

// Arrow keys and horizontal swipes page through the lesson (as in the original); the survey has text inputs, so it opts out.
document.addEventListener('keydown', e => current.keyNav?.(e));
let sx = null, sy = null;
shell.stage.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
shell.stage.addEventListener('touchend', e => {
  if (sx == null) return;
  const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
  sx = null;
  if (Math.abs(dx) > 70 && Math.abs(dy) < 60) current.swipe?.(dx);
}, { passive: true });

current = survey;
survey.start();
