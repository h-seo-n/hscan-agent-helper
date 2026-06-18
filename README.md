# 웹페이지 이용 보조 Browser Agent

해당 프로젝트는 [HScan](https://snucse.hscan.kr/) 서비스 이용을 돕기 위한 웹브라우저 Agent로, 사용자가 자연어 요청을 입력하면 LLM이 현재 웹 페이지를 분석해 단계별로 안내하는 Chrome Extension입니다.
해당 구현은 **"공간 사이를 이동하는 에이전트"의 뼈대**까지 동작합니다. 사용자가 의도를 입력하면 에이전트가 페이지 구조를 분석해 (필요 시) 다른 페이지로 이동하고, 도착한 페이지에서 첫 작업 진입점을 하이라이트로 안내합니다.

## 배포 환경 테스트 방법

배포된 서비스는 아래 링크를 사용합니다.

> - 서버: https://hscan-agent-helper-production.up.railway.app
>- DemoScan: https://demoscan-tau.vercel.app/
>- Extension 빌드: https://drive.google.com/file/d/1A-GHK4f7DpkbAVBAlDGwViRmpLEWp1o2/view?usp=sharing 


1. Extension 빌드 파일을 내려받아 압축을 해제한다.
2. Chrome에서 `chrome://extensions` 로 이동한다.
3. 우측 상단의 개발자 모드를 켠다.
4. **압축해제된 확장 프로그램 로드**를 눌러 압축 해제한 Extension 폴더를 선택한다.
5. 새 탭에서 https://demoscan-tau.vercel.app/ 를 연다.
6. 툴바의 Hscan 아이콘을 클릭해 사이드 패널을 연다.
7. 사이드바에 **"내 영상 다운로드 받고 싶어"** 를 입력한다.
8. 에이전트가 다음 순서로 동작하는지 확인한다.
   - 홈 페이지의 DOM 스냅샷 분석
   - "내 영상 목록" 탭이 다운로드 진입점으로 판단되어 해당 탭 `highlight` 및 `explanation`으로 안내 제공
   - `/images` 페이지 이동 후 새 스냅샷 자동 수집
   - 도착 페이지의 적절한 진입점(예: 검색창 또는 "다운로드" 버튼)을 `highlight` 와 `explain`으로 안내
9. 사이드바 상단의 진행 패널에서 step 진행 상태와 페이지 이동 상태가 실시간으로 표시되는지 확인한다.
10. 추가적으로, 기존 HScan 서비스 계정이 있다면 https://snucse.hscan.kr 에서 해당 extension을 열어서 동일한 방식으로 테스팅해볼 수 있다.

* 추가 확인 예시:

  - 마이페이지(`/my`)에서 "발급 받고 싶어" 입력 → 같은 시나리오로 안내되는지 확인
  - 홈에서 "내 정보 보고 싶어" 입력 → `/my` 로 안내되는지 확인

* 참고:

  - Railway 서버가 재기동 중이면 첫 요청에서 응답이 다소 느릴 수 있다.
  - OpenAI API 사용량이나 배포 환경 상태에 따라 응답 시간이 달라질 수 있다.



## 모노레포 구조

```
packages/
  shared-types/   # 공유 TypeScript 타입 + zod 스키마
  extension/      # Chrome Extension (Vite + CRXJS, Manifest V3)
  backend/        # Express + OpenAI (POST /chat, POST /plan)
  demo/           # DemoScan — 시연용 의료영상 mock 사이트
  samples/        # 실제 HScan에서 추출한 DOM 샘플 (참고용)
```

## 사전 준비

- Node.js 20 이상 (`.nvmrc`)
- pnpm 9 이상 (`corepack enable && corepack prepare pnpm@9 --activate`)
- OpenAI API 키

## 셋업

```bash
pnpm install
cp packages/backend/.env.example packages/backend/.env
# packages/backend/.env 의 OPENAI_API_KEY 를 본인 키로 채운다.
```

## 개발 명령

| 명령 | 설명 |
| --- | --- |
| `pnpm dev:be` | 백엔드 (http://localhost:3001) |
| `pnpm dev:ext` | Extension 개발 빌드 (`packages/extension/dist`) |
| `pnpm dev:demo` | DemoScan 시연 사이트 (http://localhost:5174) |
| `pnpm typecheck` | 모든 패키지 타입 체크 |
| `pnpm lint` | ESLint |
| `pnpm test` | vitest (모든 패키지) |
| `pnpm format` | Prettier |
| `pnpm build` | 모든 패키지 프로덕션 빌드 |

## 로컬 개발 및 테스트 방법

1. 터미널 3개를 열고 각각 `pnpm dev:be`, `pnpm dev:ext`, `pnpm dev:demo` 를 실행한다.
2. `chrome://extensions` → 개발자 모드 → **압축해제된 확장 프로그램 로드** → `packages/extension/dist`
3. 새 탭에서 http://localhost:5174 를 연다.
4. 툴바의 Hscan 아이콘을 클릭하면 사이드 패널이 열린다.
5. 사이드바에 **"내 영상 다운로드 받고 싶어"** 를 입력한다.
6. 에이전트가 다음 순서로 동작하는지 확인한다.
   - 홈 페이지의 DOM 스냅샷 분석
   - "내 영상 목록" 탭이 다운로드 진입점으로 판단되어 `navigate` step 실행
   - `/images` 페이지 로드 후 새 스냅샷 자동 수집
   - 도착 페이지의 적절한 진입점(예: 검색창 또는 "다운로드" 버튼)을 `highlight` 와 `explain`으로 안내
7. 사이드바 상단의 진행 패널에서 step 진행 상태와 페이지 이동 상태가 실시간으로 표시되는지 확인한다.

추가 확인 예시:

- 마이페이지(`/my`)에서 "발급 받고 싶어" 입력 → 같은 시나리오로 안내되는지 확인
- 홈에서 "내 정보 보고 싶어" 입력 → `/my` 로 안내되는지 확인

## 환경 변수 (`packages/backend/.env`)

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `OPENAI_API_KEY` | (필수) | OpenAI API 키 |
| `OPENAI_MODEL` | `gpt-5.4-mini` | 모델 ID |
| `PORT` | `3001` | 백엔드 포트 |

## 아키텍처 요약

```
[Sidebar (React)] ⇄ [Background SW] ⇄ [Backend /plan] ⇄ [OpenAI]
                          ⇅
                  [Content Script]
                  (DOM 추출 / Step 실행 / page-ready)
```

- **Sidebar**: 챗 입력, 챗 메시지, ProgressPanel.
- **Content Script**: `extractor.ts`로 DomSnapshot 추출, `execute-step` 메시지를 받아 highlight/click/input/scroll/navigate/explain 실행. SPA navigation은 `pushState`/`popstate` 패치로 감지해 `page-ready` 발신.
- **Background**: `PlanSession`을 tabId 단위로 관리하는 명시적 상태 머신 (idle → fetching-snapshot → calling-plan → executing-step → awaiting-page-ready → … → done/failed). navigate 실행 후 `page-ready`가 올 때까지 대기 후 새 snapshot으로 `/plan` 재호출. `executedSteps`를 누적해 LLM에 컨텍스트 전달.
- **Backend `/plan`**: PlanContext → ActionPlan. zod 검증 + targetId 존재 검증 + navigate 이후 step 자동 절단. 1회 재시도 후 fallback explain plan.

## 주요 제약

- 시나리오별 if문 없음. 모든 라우팅 결정은 LLM이 snapshot을 보고 수행.
- `targetId`는 반드시 snapshot에 존재해야 함 (백엔드와 content script에서 양쪽 검증).
- DOM 조작은 Content Script에서만, OpenAI 호출은 Backend에서만.
- cross-origin navigation은 거부.
