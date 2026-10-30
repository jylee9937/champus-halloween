// 호박이 (pumpkin) and 초롱이 (candle), ported verbatim from the original lesson page.
// Mood is one of 'happy' | 'think' | 'surprised'.

export function pumpkin(mood) {
  return `<svg class="char pumpkin mood-${mood}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M92 60c-6-14 0-26 9-30 7 8 10 20 6 30z" fill="#5BA50A"/>
      <path d="M106 62c10-12 26-12 34-3-9 9-23 11-34 3z" fill="#7AC70C"/>
      <ellipse cx="100" cy="120" rx="80" ry="64" fill="#F08A00"/>
      <ellipse cx="58" cy="122" rx="30" ry="58" fill="#FF9600"/>
      <ellipse cx="142" cy="122" rx="30" ry="58" fill="#FF9600"/>
      <ellipse cx="100" cy="122" rx="40" ry="62" fill="#FFA726"/>
      <path class="brow-think" d="M110 88q14-10 28 0" stroke="#B85E00" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path class="brow-surprised" d="M62 84q14-10 28 0M110 84q14-10 28 0" stroke="#B85E00" stroke-width="5" fill="none" stroke-linecap="round"/>
      <ellipse cx="76" cy="114" rx="17" ry="19" fill="#fff"/>
      <ellipse cx="124" cy="114" rx="17" ry="19" fill="#fff"/>
      <circle cx="80" cy="117" r="9" fill="#2F2A26"/>
      <circle cx="128" cy="117" r="9" fill="#2F2A26"/>
      <circle cx="83" cy="113" r="3.2" fill="#fff"/>
      <circle cx="131" cy="113" r="3.2" fill="#fff"/>
      <circle cx="52" cy="140" r="8" fill="#FF5E5E" opacity=".4"/>
      <circle cx="148" cy="140" r="8" fill="#FF5E5E" opacity=".4"/>
      <path class="m-happy" d="M80 144q20 18 40 0" stroke="#2F2A26" stroke-width="5" fill="none" stroke-linecap="round"/>
      <ellipse class="m-surprised" cx="100" cy="150" rx="9" ry="12" fill="#2F2A26"/>
      <path class="m-think" d="M86 150q14-7 28 0" stroke="#2F2A26" stroke-width="5" fill="none" stroke-linecap="round"/>
    </svg>`;
}

export function candle(mood) {
  return `<svg class="char candle mood-${mood}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle class="glow" cx="100" cy="46" r="44" fill="#FFD54F" opacity=".35"/>
      <g class="flame">
        <path d="M100 8c15 18 24 31 24 44a24 24 0 0 1-48 0c0-13 9-26 24-44z" fill="#FF9600"/>
        <path d="M100 30c8 10 13 18 13 25a13 13 0 0 1-26 0c0-7 5-15 13-25z" fill="#FFE066"/>
      </g>
      <rect x="97" y="70" width="6" height="12" rx="3" fill="#5B4636"/>
      <rect x="54" y="78" width="92" height="112" rx="26" fill="#FFF3D6" stroke="#EBD6A8" stroke-width="3"/>
      <path d="M64 92c0 16-3 26 7 26s6-14 6-26z" fill="#FFFBF0"/>
      <ellipse cx="78" cy="128" rx="16" ry="18" fill="#fff" stroke="#EBD6A8" stroke-width="2"/>
      <ellipse cx="122" cy="128" rx="16" ry="18" fill="#fff" stroke="#EBD6A8" stroke-width="2"/>
      <circle cx="81" cy="131" r="8.5" fill="#2F2A26"/>
      <circle cx="125" cy="131" r="8.5" fill="#2F2A26"/>
      <circle cx="84" cy="127" r="3" fill="#fff"/>
      <circle cx="128" cy="127" r="3" fill="#fff"/>
      <circle cx="62" cy="150" r="7" fill="#FF8A80" opacity=".5"/>
      <circle cx="138" cy="150" r="7" fill="#FF8A80" opacity=".5"/>
      <path class="m-happy" d="M84 154q16 14 32 0" stroke="#2F2A26" stroke-width="5" fill="none" stroke-linecap="round"/>
      <ellipse class="m-surprised" cx="100" cy="158" rx="8" ry="10" fill="#2F2A26"/>
      <path class="m-think" d="M88 158q12-6 24 0" stroke="#2F2A26" stroke-width="5" fill="none" stroke-linecap="round"/>
      <ellipse cx="100" cy="190" rx="54" ry="9" fill="#D9A441"/>
    </svg>`;
}
