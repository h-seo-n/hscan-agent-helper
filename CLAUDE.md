# AI Web Assistant Extension

## 프로젝트 개요
이미 존재하는 웹 서비스의 사용을 돕는 Chrome Extension.
사용자가 자연어로 요청하면, LLM이 현재 페이지의 DOM을 분석해 Action Plan을 만들고,
Content Script가 실제 화면 위에 overlay/하이라이트/자동 입력으로 단계별 안내를 수행한다.

핵심 차별점: "텍스트 설명이나 스크린샷"이 아니라 **실제 페이지 DOM을 조작**해 안내한다.

## 아키텍처
[Sidebar (React)] ⇄ [Background Service Worker] ⇄ [Backend (Express)] ⇄ [OpenAI API]
                          ⇅
                   [Content Script]
                   (DOM 분석 / Overlay 렌더링)

- Sidebar: 사용자 입력, 챗 메시지, ActionPlan 진행 상태 표시
- Content Script: DOM 스냅샷 추출, Overlay 렌더링, 실제 클릭/입력 실행
- Background SW: 메시지 라우팅 허브 (Sidebar ↔ Content ↔ Backend)
- Backend: OpenAI 호출, 프롬프트 구성, ActionPlan 검증
- LLM: 의도 + DOM 스냅샷 → ActionPlan(JSON) 반환

메시지는 모두 Background를 통해 흐른다. Sidebar와 Content Script는 직접 통신하지 않는다.

## 모노레포 구조
/packages
  /extension       # Chrome Extension (Vite + CRXJS)
    /sidebar       # React Sidebar UI
    /content       # Content Script (DOM 분석/overlay)
    /background    # Service Worker
    /shared        # 확장 내부 공통 유틸
  /backend         # Express + OpenAI
  /shared-types    # 양쪽이 공유하는 타입 (ActionPlan, DomSnapshot, Message 등)

## 가장 중요한 계약: 공유 타입
`packages/shared-types`는 이 프로젝트의 단일 진실 공급원이다.
다음 타입은 코드 작성 전에 먼저 정의하고, 변경 시 반드시 PR 설명에 명시한다.

- `DomSnapshot`: Content Script가 추출하는 페이지 상태
  - `url`, `title`, `interactiveElements: InteractiveElement[]`
- `InteractiveElement`: 클릭/입력 가능한 요소
  - `id` (안정적 셀렉터 또는 자체 부여 ID), `role`, `label`, `selector`, `boundingRect`
- `ActionPlan`: LLM 응답
  - `steps: ActionStep[]`, `assistantMessage: string`, `done: boolean`
- `ActionStep`: 단일 액션
  - `type: 'highlight' | 'click' | 'input' | 'scroll' | 'navigate' | 'explain'`
  - `targetId?`, `value?`, `description: string`
- `ExtensionMessage`: Background를 거치는 모든 메시지의 union 타입

## 기술 스택
- Frontend: React 18, TypeScript, Vite + CRXJS, Manifest V3
- Backend: Node.js, TypeScript, Express
- LLM: OpenAI API (gpt-4o-mini 기본, 필요시 gpt-4o)
- Lint/Format: ESLint, Prettier
- 패키지 매니저: pnpm workspaces

## 개발 원칙
1. **타입 먼저**: 새 기능은 `shared-types`에 타입을 추가/변경한 뒤 구현한다.
2. **Background는 dumb router**: 비즈니스 로직을 두지 않고 메시지 라우팅과 인증만 처리한다.
3. **DOM 조작은 Content Script만**: 다른 곳에서 `document.*`에 접근하지 않는다.
4. **LLM 호출은 Backend만**: Extension에 OpenAI API 키를 두지 않는다.
5. **ActionPlan은 항상 JSON 스키마로 검증**: zod로 파싱한다. 파싱 실패 시 사용자에게 재시도를 알린다.
6. **DOM 스냅샷은 압축**: 인터랙티브 요소만 추려 보낸다. 전체 HTML을 보내지 않는다.
7. **DRY in React**: 반복 UI는 config 배열 기반으로 매핑한다.

## 보안/프라이버시 메모
- 사용자가 보고 있는 페이지 DOM이 백엔드로 전송되므로, 데모 단계에서는 명시적 활성화 토글 + 도메인 화이트리스트를 둔다.
- 비밀번호 input(`type="password"`)은 스냅샷에서 제외한다.

## Claude Code 사용 규칙
- 큰 작업은 먼저 계획을 세우고 사람의 승인을 받은 뒤 구현한다.
- `shared-types`를 수정했다면 영향받는 모든 패키지를 같이 업데이트한다.
- 패키지를 새로 추가할 때는 이유를 PR 설명에 적는다.
- 한국어로 커뮤니케이션하되, 코드 식별자/커밋 메시지는 영어로 작성한다.
- 테스트 작성 시 핵심 로직(ActionPlan 검증, DOM 셀렉터 안정성)을 우선한다.

## 자주 쓰는 명령
- `pnpm dev:ext` — Extension 개발 빌드 (CRXJS HMR)
- `pnpm dev:be` — Backend 개발 서버
- `pnpm typecheck` — 전체 타입 체크
- `pnpm lint`