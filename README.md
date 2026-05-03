# Hscan — AI Web Assistant

자연어로 요청하면 LLM이 현재 웹 페이지를 분석해 단계별로 안내하는 Chrome Extension.
이 단계는 "Sidebar → Background → Backend → OpenAI → Sidebar" end-to-end hello world까지만 동작합니다.
DOM 분석/Overlay/ActionPlan은 Prompt B에서 추가됩니다.

## 모노레포 구조

```
packages/
  shared-types/   # 공유 TypeScript 타입 + zod 스키마
  extension/      # Chrome Extension (Vite + CRXJS, Manifest V3)
  backend/        # Express + OpenAI
```

## 사전 준비

- Node.js 20 이상 (`.nvmrc` 참고)
- pnpm 9 이상 (`corepack enable && corepack prepare pnpm@9 --activate`)
- OpenAI API 키

## 셋업

```bash
pnpm install
cp packages/backend/.env.example packages/backend/.env
# packages/backend/.env 를 열어 OPENAI_API_KEY 를 채운다.
```

## 개발 명령

| 명령 | 설명 |
| --- | --- |
| `pnpm dev:be` | 백엔드 개발 서버 (기본 http://localhost:3001) |
| `pnpm dev:ext` | Extension 개발 빌드 (CRXJS HMR, dist/ 출력) |
| `pnpm typecheck` | 모든 패키지 타입 체크 |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier 포맷 |
| `pnpm build` | 모든 패키지 프로덕션 빌드 |

## Chrome 에 Extension 로드하는 법

1. 별도 터미널에서 `pnpm dev:be` 로 백엔드를 띄운다.
2. 또 다른 터미널에서 `pnpm dev:ext` 를 실행한다. `packages/extension/dist/` 가 만들어진다.
3. Chrome 주소창에 `chrome://extensions` 를 입력한다.
4. 우측 상단의 **개발자 모드**를 켠다.
5. **압축해제된 확장 프로그램을 로드합니다(Load unpacked)** 클릭 → `packages/extension/dist` 폴더 선택.
6. 툴바의 Hscan 아이콘을 클릭하면 사이드 패널이 열린다.
7. "안녕" 같은 메시지를 입력하면 OpenAI 응답이 사이드바에 표시된다.

> 코드를 수정하면 CRXJS HMR 이 자동으로 다시 로드합니다. manifest 변경 시에는 `chrome://extensions` 에서 새로고침이 필요할 수 있습니다.

## 환경 변수 (`packages/backend/.env`)

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `OPENAI_API_KEY` | (필수) | OpenAI API 키 |
| `OPENAI_MODEL` | `gpt-4o-mini` | 사용할 모델 ID |
| `PORT` | `3001` | 백엔드 포트 |

## 다음 단계 (Prompt B 예고)

- Content Script에서 실제 DOM 인터랙티브 요소 추출
- LLM 응답을 `ActionPlan` JSON 으로 받도록 시스템 프롬프트 강화
- zod 로 ActionPlan 검증 + 사이드바에 진행 상태 표시
- 도메인 화이트리스트 / 활성화 토글
- `password` input 제외 등 프라이버시 가드
