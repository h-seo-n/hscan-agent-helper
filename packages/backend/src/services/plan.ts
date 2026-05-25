import OpenAI from 'openai';
import {
  type ActionPlan,
  type DomSnapshot,
  type InteractiveElement,
  type PlanContext,
  zActionPlan,
} from '@hscan/shared-types';
import { env } from '../lib/env.js';

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are an in-browser navigator agent.
Given a user's intent, the current page snapshot, and the history of what was done so far,
output a JSON ActionPlan that helps the user reach their goal one screen at a time.

Available step types: highlight, click, input, scroll, navigate, explain.

Hard rules:
1. Every "targetId" you produce MUST appear verbatim in snapshot.regions. Never invent IDs.
   If you cannot find a suitable element, return a single explain step asking the user to clarify.
2. If the user's intent cannot be satisfied on the CURRENT page, find a navigation element
   (a tab, link or menu item) that leads toward the goal and emit ONE navigate step. Then STOP.
   Do not append any further steps after a navigate. The system will re-invoke you with a new
   snapshot once the new page is loaded.
3. The same destination may be reachable via multiple paths with inconsistent names. Prefer the
   link whose label most directly matches the user's intent. If the user says "다운로드" and
   the home page has cards like "CD로 배송 받기" (loose match) and a tab "내 영상 목록" (which
   leads to a list page where there is a literal "다운로드" button), prefer the tab.
4. Treat a visible interactive card/button with a label that directly matches the intent as an
   entry point on the current page. For Korean receive requests such as "내 영상 받고 싶어",
   "영상 받기", or "병원 영상 받고 싶어", a card labeled "내 영상 병원에서 받기" is a direct
   match when present. Highlight that card instead of asking the user to clarify.
5. After arriving on the page that contains the actual entry point for the user's task, produce
   a short plan: at minimum one highlight on the entry point and one explain telling the user
   what to do there. Set done=true.
6. Use executedSteps to understand what already happened on previous pages. Do not re-run a
   navigation that already succeeded. If executedSteps shows you already navigated and the user
   is now on the destination page, focus on highlighting the entry point.
7. assistantMessage must be in the user's language (Korean here) and concise (one sentence).
8. Each step must have a unique short "id" string (e.g. "s1", "s2").

Output strictly the following JSON shape:
{ "steps": ActionStep[], "assistantMessage": string, "done": boolean }

Examples:

Example 1 (single page, highlight + explain):
User intent: "여기서 영상 검색하려면?"
Snapshot summary: page /images, main has input id="search-input" label="병원명 또는 이름 검색".
Output:
{
  "steps": [
    { "id": "s1", "type": "highlight", "targetId": "search-input", "description": "검색창 위치" },
    { "id": "s2", "type": "explain", "description": "여기에 병원명을 입력해 보세요." }
  ],
  "assistantMessage": "여기서 병원명을 검색하시면 됩니다.",
  "done": true
}

Example 2 (navigate, then stop — note no steps after navigate):
User intent: "내 영상 다운로드 받고 싶어"
Snapshot summary: page /, nav has tab id="tid:tab-images" label="내 영상 목록".
Output:
{
  "steps": [
    {
      "id": "s1",
      "type": "navigate",
      "targetId": "tid:tab-images",
      "expectedUrlPattern": "/images",
      "description": "영상 목록으로 이동합니다."
    }
  ],
  "assistantMessage": "영상 목록 페이지로 이동할게요.",
  "done": false
}

Example 3 (home card is the current-page entry point):
User intent: "내 영상 받고 싶어"
Snapshot summary: page /, main has button id="id:card-receive" label="내 영상 병원에서 받기".
Output:
{
  "steps": [
    {
      "id": "s1",
      "type": "highlight",
      "targetId": "id:card-receive",
      "description": "병원 영상 받기 시작 위치"
    },
    {
      "id": "s2",
      "type": "explain",
      "description": "이 카드를 눌러 병원에서 받은 영상을 가져오세요."
    }
  ],
  "assistantMessage": "병원에서 영상을 받으려면 이 메뉴에서 시작하세요.",
  "done": true
}
`;

export interface PlanResult {
  plan: ActionPlan;
  warnings: string[];
}

export async function generatePlan(ctx: PlanContext): Promise<PlanResult> {
  const deterministic = deterministicPlan(ctx);
  if (deterministic) return deterministic;

  const userPayload = buildUserPayload(ctx);

  const attempt = async (extraInstruction?: string): Promise<PlanResult> => {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];
    if (extraInstruction) {
      messages.push({ role: 'system', content: extraInstruction });
    }
    messages.push({ role: 'user', content: userPayload });

    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      response_format: { type: 'json_object' },
      messages,
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error('empty plan response');
    return parsePlan(raw, ctx.snapshot);
  };

  try {
    return await attempt();
  } catch (err1) {
    console.warn('[plan] first attempt failed, retrying:', err1);
    try {
      const reason = err1 instanceof Error ? err1.message : String(err1);
      return await attempt(`Previous attempt failed: ${reason}. Strictly follow the schema.`);
    } catch (err2) {
      console.error('[plan] retry failed:', err2);
      return fallbackPlan(ctx);
    }
  }
}

export function fallbackPlan(ctx?: PlanContext): PlanResult {
  const deterministic = ctx ? deterministicPlan(ctx) : null;
  if (deterministic) {
    return {
      ...deterministic,
      warnings: ['fallback to deterministic snapshot match after two failures'],
    };
  }

  return {
    plan: {
      steps: [
        {
          id: 's1',
          type: 'explain',
          description:
            '죄송해요, 지금 화면에서 요청하신 작업의 위치를 찾지 못했어요. 좀 더 구체적으로 알려 주실 수 있나요?',
        },
      ],
      assistantMessage:
        '죄송해요, 지금 화면에서 요청하신 작업의 위치를 찾지 못했어요. 좀 더 구체적으로 알려 주실 수 있나요?',
      done: true,
    },
    warnings: ['fallback after two failures'],
  };
}

export function deterministicPlan(ctx: PlanContext): PlanResult | null {
  const message = latestMessage(ctx);
  const intent = normalize(message);
  if (intent.length < 2) return null;

  for (const rule of DIRECT_RULES) {
    if (!matchesAny(intent, rule.intent)) continue;
    const target = findElement(ctx.snapshot, rule.labels);
    if (target) return highlightPlan(target, rule);
  }

  const needsImagesPage =
    matchesAny(intent, ['다운로드', '삭제', '검색', '영상검색', '목록', '리스트']) ||
    matchesAny(intent, ['의사공유', '공유', '병원전달', '전달', 'CD신청']);
  if (needsImagesPage && !isImagesPage(ctx.snapshot)) {
    const tab = findElement(ctx.snapshot, ['내영상목록']);
    if (tab) {
      return {
        plan: {
          steps: [
            {
              id: 's1',
              type: 'navigate',
              targetId: tab.id,
              expectedUrlPattern: '/images',
              description: '영상 목록으로 이동합니다.',
            },
          ],
          assistantMessage: '영상 목록 페이지로 이동할게요.',
          done: false,
        },
        warnings: [],
      };
    }
  }

  return null;
}

interface DirectRule {
  intent: string[];
  labels: string[];
  highlightDescription: string;
  explainDescription: string;
  assistantMessage: string;
}

const DIRECT_RULES: DirectRule[] = [
  {
    intent: ['의사에게보여', '의사한테보여', '의사공유', '공유'],
    labels: ['내영상의사에게보여주기', '의사공유'],
    highlightDescription: '의사에게 영상 보여주기 시작 위치',
    explainDescription: '이 메뉴에서 담당 의사에게 영상 링크를 공유할 수 있습니다.',
    assistantMessage: '의사에게 영상을 보여주려면 이 메뉴에서 시작하세요.',
  },
  {
    intent: ['CD로배송', 'CD배송', 'CD받', 'CD신청', '씨디'],
    labels: ['내영상CD로배송받기', 'CD신청'],
    highlightDescription: 'CD 신청 시작 위치',
    explainDescription: '이 메뉴에서 영상 CD 배송을 신청할 수 있습니다.',
    assistantMessage: '영상 CD를 받으려면 이 메뉴에서 시작하세요.',
  },
  {
    intent: ['영상받', '받고싶', '병원영상', '병원에서받'],
    labels: ['내영상병원에서받기'],
    highlightDescription: '병원 영상 받기 시작 위치',
    explainDescription: '이 카드를 눌러 병원에서 받은 영상을 가져오세요.',
    assistantMessage: '병원에서 영상을 받으려면 이 메뉴에서 시작하세요.',
  },
  {
    intent: ['병원으로보내', '병원에보내', '병원전달', '전달'],
    labels: ['내영상병원으로보내기', '병원전달'],
    highlightDescription: '병원으로 영상 보내기 시작 위치',
    explainDescription: '이 메뉴에서 다른 병원 진료실로 영상을 전달할 수 있습니다.',
    assistantMessage: '병원으로 영상을 보내려면 이 메뉴에서 시작하세요.',
  },
  {
    intent: ['다운로드', '내려받'],
    labels: ['다운로드'],
    highlightDescription: '영상 다운로드 위치',
    explainDescription: '영상을 선택한 뒤 이 버튼으로 다운로드할 수 있습니다.',
    assistantMessage: '다운로드는 이 버튼에서 진행하세요.',
  },
  {
    intent: ['삭제', '지우'],
    labels: ['삭제'],
    highlightDescription: '영상 삭제 위치',
    explainDescription: '영상을 선택한 뒤 이 버튼으로 삭제할 수 있습니다.',
    assistantMessage: '삭제는 이 버튼에서 진행하세요.',
  },
  {
    intent: ['검색', '찾아', '찾고'],
    labels: ['병원명또는이름검색'],
    highlightDescription: '영상 검색창 위치',
    explainDescription: '여기에 병원명이나 영상 이름을 입력해 검색하세요.',
    assistantMessage: '영상 검색은 이 입력창에서 할 수 있습니다.',
  },
  {
    intent: ['올리', '업로드'],
    labels: ['영상올리기'],
    highlightDescription: '영상 올리기 위치',
    explainDescription: '이 버튼으로 새 영상을 올릴 수 있습니다.',
    assistantMessage: '영상 올리기는 이 버튼에서 시작하세요.',
  },
  {
    intent: ['내정보', '마이페이지', '설정'],
    labels: ['내정보'],
    highlightDescription: '내 정보 탭 위치',
    explainDescription: '이 탭에서 내 정보 화면으로 이동할 수 있습니다.',
    assistantMessage: '내 정보는 이 탭에서 확인하세요.',
  },
  {
    intent: ['고객센터', '문의'],
    labels: ['고객센터'],
    highlightDescription: '고객센터 위치',
    explainDescription: '도움이 필요하면 이 링크를 눌러 고객센터로 이동하세요.',
    assistantMessage: '고객센터는 이 링크에서 열 수 있습니다.',
  },
  {
    intent: ['가이드', 'CD발급'],
    labels: ['CD발급가이드'],
    highlightDescription: 'CD 발급 가이드 위치',
    explainDescription: 'CD 발급 방법은 이 가이드에서 확인할 수 있습니다.',
    assistantMessage: 'CD 발급 가이드는 이 링크에서 확인하세요.',
  },
];

function latestMessage(ctx: PlanContext): string {
  return ctx.history[ctx.history.length - 1]?.content ?? ctx.originalUserMessage;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function matchesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(normalize(needle)));
}

function findElement(snapshot: DomSnapshot, labels: string[]): InteractiveElement | null {
  const normalizedLabels = labels.map(normalize);
  for (const item of allElements(snapshot)) {
    if (!item.visibleNow) continue;
    const label = normalize(item.label);
    if (normalizedLabels.some((candidate) => label.includes(candidate))) return item;
  }
  return null;
}

function allElements(snapshot: DomSnapshot): InteractiveElement[] {
  return Object.values(snapshot.regions).flatMap((items) => items ?? []);
}

function isImagesPage(snapshot: DomSnapshot): boolean {
  return snapshot.url.includes('/images') || Boolean(findElement(snapshot, ['다운로드', '의사공유']));
}

function highlightPlan(target: InteractiveElement, rule: DirectRule): PlanResult {
  return {
    plan: {
      steps: [
        {
          id: 's1',
          type: 'highlight',
          targetId: target.id,
          description: rule.highlightDescription,
        },
        {
          id: 's2',
          type: 'explain',
          description: rule.explainDescription,
        },
      ],
      assistantMessage: rule.assistantMessage,
      done: true,
    },
    warnings: [],
  };
}

function buildUserPayload(ctx: PlanContext): string {
  const { originalUserMessage, snapshot, executedSteps, history } = ctx;
  return JSON.stringify({
    originalUserMessage,
    latestUserMessage: history[history.length - 1]?.content ?? originalUserMessage,
    snapshot,
    executedSteps: executedSteps.map((es) => ({
      step: es.step,
      status: es.status,
      finishedAtUrl: es.finishedAtUrl,
    })),
  });
}

export function parsePlan(raw: string, snapshot: DomSnapshot): PlanResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(`invalid JSON: ${(e as Error).message}`);
  }

  const result = zActionPlan.safeParse(json);
  if (!result.success) {
    throw new Error(`schema mismatch: ${result.error.message}`);
  }
  const plan = result.data;
  const warnings: string[] = [];

  const knownIds = collectIds(snapshot);
  for (const step of plan.steps) {
    const tid = (step as { targetId?: string }).targetId;
    if (tid && !knownIds.has(tid)) {
      throw new Error(`unknown targetId: ${tid}`);
    }
  }

  const idx = plan.steps.findIndex((s) => s.type === 'navigate');
  if (idx >= 0 && idx < plan.steps.length - 1) {
    warnings.push(`truncated ${plan.steps.length - idx - 1} step(s) after navigate`);
    plan.steps = plan.steps.slice(0, idx + 1);
  }

  return { plan, warnings };
}

function collectIds(snapshot: DomSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const items of Object.values(snapshot.regions)) {
    for (const it of items ?? []) ids.add(it.id);
  }
  return ids;
}
