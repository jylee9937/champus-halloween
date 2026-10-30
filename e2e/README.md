# E2E 실행 안내

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

Linux CI에서 브라우저 시스템 패키지가 필요하면 `npx playwright install --with-deps chromium`을 사용한다. Node 22 이상은 저장소의 기존 요구사항이며, 설치된 Firebase 13의 일부 패키지는 Node 24.12 이상을 요구하므로 CI에서는 Node 24를 사용한다.

`playwright.config.js`가 전용 Vite 서버를 `127.0.0.1:4175`에서 `--mode e2e`로 시작하고 종료한다. 이미 열린 일반 dev 서버를 재사용하지 않는다. 두 Chromium 프로젝트는 **390×844**와 **320×844**이며 터치·모바일 viewport, 한국어, KST를 사용한다. 기본 모션은 reduce로 고정해 테스트 시간을 안정화하고, SC-44는 기본 모션에서 reduce로 직접 전환한다. 화면 검증은 fallback 글꼴 기준이며 실제 휴대폰·폰트 확인은 수동 시나리오다.

```sh
npm run test:e2e -- --project=mobile-390
npm run test:e2e -- --grep SC-51
npx playwright show-report
```

실패 시 `test-results/`에 trace와 스크린샷, `playwright-report/`에 HTML 보고서를 남긴다. 생성물은 git에서 제외한다. 고정 sleep이나 자동 재시도로 실패를 숨기지 않는다. 알려진 앱 결함은 재현된 테스트에만 근거 주석을 붙여 `test.fail()`로 표시하며, 예상과 달리 통과하면 suite가 실패하도록 둔다.

## Firebase 격리 seam

앱의 변경은 **`vite.config.js`의 mode 조건부 SDK alias**뿐이다. `mode === 'e2e'`일 때만 `firebase/app`, `firebase/firestore`, `firebase/auth`를 `e2e/mocks/firebase.mock.js`로 바꾼다. 일반 dev/build의 alias는 빈 배열이므로 mock과 `window.__e2e`를 포함하지 않는다.

`src/lib/firebase.js`는 교체하지 않는다. 실제 `submitResponse`의 payload 검증·버전 추가·serverTimestamp·365일 Timestamp·15초 timeout과 관리자 allowlist·만료 query·배치 삭제·문서 변환을 실행한다. mock은 SDK가 수행할 네트워크 I/O만 메모리로 대체한다. Timestamp는 `{ms}`로 직렬화되고 createdAt sentinel은 `{__type:'serverTimestamp'}`로 관찰한다. E2E는 실제 adapter가 SDK addDoc에 전달한 **14개 필드 전체**를 독립적인 기대값과 비교한다. 실제 서버의 timestamp 해석·Rules·Google 공급자 동작은 검증 범위 밖이다.

공통 fixture는 앱 모듈보다 먼저 `window.__e2e`를 만들며 다음 항목으로 제어한다.

| 항목 | 용도 |
| --- | --- |
| `submit: {outcome:'success' / 'failure' / 'pending', delayMs:0}` | 성공·실패·결정적 pending·실제 지연 |
| `releaseSubmit()` | pending 요청 해제. 함수가 생길 때까지 expect.poll로 확인 |
| `attempts`, `writes` | SDK 전송 시도와 성공 쓰기, 컬렉션·전체 문서·시각 |
| `user`, `signInEmail`, `adminEmails` | 로그아웃·기존 로그인·Google 로그인 결과·허용 목록 |
| `responses` | Firestore 응답 seed. 날짜는 ISO 문자열이며 조회 시 Timestamp로 변환 |
| `signInError`, `fetchError`, `purgeError` | 로그인·응답 조회·만료 정리 실패 주입 |
| `calls`, `purgedIds` | 허용 목록/조회/배치 호출 순서와 삭제 문서 확인 |
| `analytics: true` | 익명 분석 기록 켜기. e2e 모드 기본값은 꺼짐이며, 켜도 쓰기는 mock의 `setDoc`으로만 간다 |
| `sessions`, `sessionWrites` | sessions seed(날짜는 ISO 문자열)와 `setDoc` 기록(id·merge 여부·문서·시각) |
| `sessionWriteError`, `sessionsFetchError`, `sessionsPurgeError`, `purgedSessionIds` | 분석 쓰기·조회·정리 실패 주입과 정리된 방문 기록 확인 |

sessions 관련 호출은 `writeSession`, `fetchSessions`, `sessionsPurgeQuery`, `sessionsPurgeCommit`처럼 따로 기록한다. 그래서 응답 컬렉션의 호출 순서 검사(`purgeQuery`·`purgeCommit`·`fetchResponses`)에는 영향이 없다.

페이지별로 mock이 초기화되므로 reload persistence 검사는 앱이 실제 저장한 sessionStorage를 사용한다. 일부 수업·링크 테스트는 공개된 완료 marker만 seed하고 설문 전체 경로는 정상 제출 테스트로 따로 증명한다. 모든 일반 설문 helper는 UI를 직접 조작하며 내부 답변 state를 주입하지 않는다.

fixture는 컨텍스트 수준에서 localhost 전용 포트 외 HTTP를 차단한다. popup 첫 요청도 포함한다. Firebase/Firestore/Auth 관련 외부 요청이 시도되면 차단에 더해 테스트도 실패한다. Google Fonts·Instagram 역시 실제로 접속하지 않는다. 테스트 코드와 mock은 앱의 session/local storage를 제어용 저장소로 사용하지 않는다.

시나리오별 사전 조건·절차·기대 결과 및 수동 범위는 [테스트 시나리오](../docs/test-scenarios.md)에 있다.
