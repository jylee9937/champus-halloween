// "할로윈의 진짜 뜻" — the 11-screen lesson with 3 quizzes, ported from the original lesson page.
// Changes from the original: the end screen follows Figma 10:515 (hot chocolate + cookie coupon + Instagram CTA + restart link),
// reached only after all 3 quizzes are answered (right or wrong),
// back on screen 1 leaves the lesson, and nothing about quiz results is stored.
import { pumpkin, candle } from '../lib/characters.js';
import { confetti, couponHtml, INSTAGRAM_URL } from '../lib/ui.js';
import { track } from '../lib/analytics.js';

export function createLesson({ shell, nav, getName, onExit }) {
  let step = 0, score = 0, answered = {};

  const screens = [
    {cta:'시작하기',html:()=>`
      <div class="screen">
        <div class="eyebrow">10월 31일 밤 이야기</div>
        <h1 class="title"><span class="o">할로윈</span>의<br>진짜 뜻</h1>
        <div class="duo">
          <div class="speaker"><div class="bubble bubble-top">유령? 사탕? 🎃<br>그게 다야?</div>${pumpkin('think')}</div>
          <div class="speaker"><div class="bubble bubble-top">아니야! 더 멋진<br>이야기가 있어 ✨</div>${candle('happy')}</div>
        </div>
        <p class="sub">3분이면 끝! 퀴즈도 딱 3개 🎯</p>
      </div>`},
    {html:()=>`
      <div class="screen">
        <div class="line">${pumpkin('think')}<div class="bubble">할로윈은 무서운<br>귀신의 날… 맞지?</div></div>
        <div class="line right">${candle('happy')}<div class="bubble">음… 사실은<br>아니야!</div></div>
        <p class="sub">진짜 뜻은 이름 속에 숨어 있어 🔍</p>
      </div>`},
    {quiz:{q:'먼저 퀴즈! 🎯<br>할로윈은 언제일까?',options:['10월 31일 밤','12월 25일 밤','4월 1일 밤'],a:0,
      ok:'할로윈은 10월 31일 밤이야 🌙',bad:'할로윈은 10월 31일 밤이야 🌙'}},
    {html:()=>`
      <div class="screen">
        <h2 class="h">이름 속 비밀 🔍</h2>
        <div class="wordcard">
          <div class="word-big">Halloween</div>
          <div class="word-eq">= 이 말을 짧게 줄인 거야 👇</div>
          <div class="chips">
            <div class="chip gold" style="--d:.2s"><b>All</b><span>모든</span></div>
            <div class="chip gold" style="--d:.45s"><b>Hallows'</b><span>성인들의</span></div>
            <div class="chip blue" style="--d:.7s"><b>Eve</b><span>전날 밤</span></div>
          </div>
        </div>
        <div class="result-line">= <b>모든 성인의 날</b>,<br>그 <b>전날 밤</b>!</div>
        <p class="sub">Hallow(할로우) = 거룩한 사람 = 성인(聖人)</p>
      </div>`},
    {html:()=>`
      <div class="screen">
        <h2 class="h">그럼 11월 1일은<br>무슨 날이야?</h2>
        <div class="cal-row">
          <div class="cal"><div class="cal-m">10월</div><div class="cal-d">31</div><div class="cal-l">할로윈 🌙<br>전날 밤</div></div>
          <div class="cal-arrow">→</div>
          <div class="cal gold"><div class="cal-m">11월</div><div class="cal-d">1</div><div class="cal-l">모든 성인의 날 ✨<br>(만성절)</div></div>
        </div>
        <div class="line right">${candle('happy')}<div class="bubble"><b>믿음의 선배들</b>을<br>기억하고 감사하는<br>날이야!</div></div>
      </div>`},
    {html:()=>`
      <div class="screen">
        <div class="line">${pumpkin('think')}<div class="bubble">성인? 그게 누군데?</div></div>
        <div class="line right">${candle('happy')}<div class="bubble">하나님을 믿으며<br>멋진 본을 보여 준<br><b>믿음의 선배들</b>이야.</div></div>
        <div class="note">힘든 일이 있어도, 목숨이 위험해도<br>끝까지 믿음을 지킨 사람들 💪</div>
      </div>`},
    {html:()=>`
      <div class="screen">
        <h2 class="h">할로윈 밤,<br>교회는 뭘 했을까?</h2>
        <div class="night">
          <div class="stars"></div>
          ${candle('happy')}
          <div class="mini"><i class="mc"></i><i class="mc"></i><i class="mc"></i><i class="mc"></i><i class="mc"></i><i class="mc"></i></div>
        </div>
        <div class="chips">
          <div class="chip gold" style="--d:.2s"><b>🕯️</b><span>촛불을 켜고</span></div>
          <div class="chip gold" style="--d:.4s"><b>🙏</b><span>기도하고</span></div>
          <div class="chip gold" style="--d:.6s"><b>💛</b><span>감사했어</span></div>
        </div>
        <div class="result-line">무서운 밤이 아니라<br><b>거룩하고 기쁜 밤</b>이었어!</div>
      </div>`},
    {quiz:{q:'원래 할로윈 밤에<br>사람들은 뭘 했을까?',options:['귀신 분장을 하고 장난쳤다','믿음의 선배들을 기억하며 기도했다','호박을 던지며 놀았다'],a:1,
      ok:'기도하고 감사하는 밤이었지 🕯️',bad:'원래는 믿음의 선배들을 기억하며 기도하는 밤이었어 🕯️'}},
    {html:()=>`
      <div class="screen">
        <h2 class="h">그런데 시간이<br>흐르면서…</h2>
        <ol class="timeline">
          <li class="t-item" style="--d:.1s"><div class="t-dot gold">🕯️</div><div class="t-text"><b>옛날</b><span>믿음의 선배들을 기억하며 기도</span></div></li>
          <li class="t-item" style="--d:.4s"><div class="t-dot orange">🎃</div><div class="t-text"><b>1900년대</b><span>동네 축제! 트릭 오어 트릿, 귀신 분장</span></div></li>
          <li class="t-item" style="--d:.7s"><div class="t-dot gray">👻</div><div class="t-text"><b>지금</b><span>무섭고 으스스한 날?</span></div></li>
        </ol>
        <div class="line">${pumpkin('surprised')}<div class="bubble">앗! 그래서 나는<br>유령만 떠올렸구나!</div></div>
        <p class="sub">'믿음' 이야기는 잊히고, '무서움'만 남았어.</p>
      </div>`},
    {quiz:{q:'할로윈의 원래 뜻은<br>무엇일까?',options:['무서운 귀신의 밤','호박 축제','모든 성인의 날, 그 전날 밤'],a:2,
      ok:'All Hallows\' Eve! 완벽해 ✨',bad:"정답은 '모든 성인의 날, 그 전날 밤'이야 ✨"}},
    {end:true,cta:'챔퍼스 인스타 둘러보기 📷',link:'할로윈 이야기 다시 보기',html:()=>`
      <div class="screen">
        <div class="confetti"></div>
        <div class="eyebrow">이것만 기억해 줘!</div>
        <div class="final-card">할로윈은 원래<br><b>믿음의 선배들</b>을<br>기억하고 감사하던<br><b>참 좋은 날</b>이었어.</div>
        <div class="score-card">
          <div class="stars" aria-hidden="true">${[0,1,2].map(i=>`<span class="${i<score?'':'dim'}">⭐</span>`).join('')}</div>
          <div>퀴즈 3개 중 <b>${score}개</b> 정답!</div>
        </div>
        ${couponHtml(getName(), { reward: 'cookie', note: '핫초코를 이미 받았다면 쿠키만 받아 가!' })}
      </div>`}
  ];

  function quizHtml(q){
    return `<div class="screen quiz">
      <div class="line">${candle('happy')}<div class="bubble">${q.q}</div></div>
      <div class="opts">${q.options.map((o,i)=>`<button class="opt" type="button" data-i="${i}"><span class="k">${i+1}</span><span>${o}</span></button>`).join('')}</div>
    </div>`;
  }

  function render(dir){
    const s=screens[step];
    shell.hideBanner();
    const screen=shell.show(s.quiz?quizHtml(s.quiz):s.html(),dir);
    track.screen('l'+(step+1));
    shell.progress(s.end?100:Math.round(step/(screens.length-1)*100));
    shell.back(true);
    shell.extras({link:s.link});
    if(s.quiz){
      const prev=answered[step];
      if(prev!=null) lock(prev,s.quiz);
      else shell.cta('답을 골라 봐!',{disabled:true});
      screen.querySelectorAll('.opt').forEach(b=>b.addEventListener('click',()=>choose(+b.dataset.i)));
    }else{
      shell.cta(s.cta||'다음');
    }
    shell.pill('⭐ '+score,'맞힌 퀴즈 수');
    if(s.end) confetti(screen.querySelector('.confetti'));
  }

  function lock(i,q){
    shell.stage.querySelectorAll('.opt').forEach((b,j)=>{ b.disabled=true; if(j===q.a) b.classList.add('ok'); else if(j===i) b.classList.add('bad'); });
    shell.cta('다음');
  }
  function choose(i){
    if(answered[step]!=null) return;
    const q=screens[step].quiz; answered[step]=i;
    const ok=i===q.a;
    if(ok){ score++; shell.pill('⭐ '+score,'맞힌 퀴즈 수'); shell.bumpPill(); }
    lock(i,q);
    shell.showBanner({ok,title:ok?'정답이야! 🎉':'아쉬워!',sub:ok?q.ok:q.bad,button:'계속'});
  }

  function start(dir='fwd'){ step=0; score=0; answered={}; render(dir); }

  function next(){
    const s=screens[step];
    if(s.end){ track.instagram('lessonEnd'); window.open(INSTAGRAM_URL,'_blank','noopener'); return; }
    if(shell.nextBtn.disabled) return;
    if(step<screens.length-1){ nav.push(); step++; render('fwd'); }
  }
  function back(){
    if(step>0){ step--; render('back'); return; }
    onExit();
  }
  function bannerAction(){ shell.hideBanner(); next(); }
  const canAdvance=()=>!shell.nextBtn.disabled&&shell.banner.hidden&&!screens[step].end;

  return {
    start, next, back, bannerAction,
    // "할로윈 이야기 다시 보기": restart at screen 1 with the score reset — never back to the survey.
    link(){ track.lessonRestart(); nav.push(); start('fwd'); },
    keyNav(e){
      if(e.key==='ArrowRight'){ if(!shell.banner.hidden) bannerAction(); else if(canAdvance()) next(); }
      if(e.key==='ArrowLeft') nav.back();
    },
    swipe(dx){
      if(dx<0){ if(canAdvance()) next(); }
      else nav.back();
    },
  };
}
