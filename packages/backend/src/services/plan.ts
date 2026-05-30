import OpenAI from 'openai';
import {
  type ActionPlan,
  type DomSnapshot,
  type InteractiveElement,
  type PlanContext,
  type InteractiveElement,
  type RegionName,
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
6. assistantMessage must be in the user's language (Korean here) and concise (one sentence).
7. Each step must have a unique short "id" string (e.g. "s1", "s2").
8. If all elements have region "unknown" (no semantic HTML landmarks), the page uses
   div-only layout. In this case, infer purpose from:
   - "label": the element's visible text (e.g. "홈", "내 영상 목록", "내 정보" → nav tabs)
   - "visibleNow": prefer true elements as they are in the current viewport
   - "href": links with path hints (e.g. href="/images" → likely navigation to image list)
   - Common patterns: buttons with short labels like "홈"/"내 정보" at the bottom = tab bar (nav).
     Anchor tags with href="/" and no label = logo (skip). Buttons with user name = profile.
   Do NOT refuse to act just because region is "unknown". Use label and href to infer intent.

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
Example 3 (multi-step on arrived page: highlight + input + click):
User intent: "내 영상 다운로드 받고 싶어"
Snapshot summary: page /images, main has input id="search-input" label="병원명 또는 이름 검색",
button id="btn-download" label="다운로드".
executedSteps: [{ type: "navigate", status: "navigated", finishedAtUrl: "/" }]
Output:
{
  "steps": [
    { "id": "s1", "type": "highlight", "targetId": "search-input", "description": "검색창 위치" },
    { "id": "s2", "type": "input", "targetId": "search-input", "value": "", "description": "다운로드할 영상의 이름을 입력해 주세요." },
    { "id": "s3", "type": "highlight", "targetId": "btn-download", "description": "다운로드 버튼 위치" },
    { "id": "s4", "type": "explain", "description": "검색 후 다운로드 버튼을 누르면 영상을 받을 수 있어요." }
  ],
  "assistantMessage": "영상 이름을 검색한 뒤 다운로드 버튼을 눌러 주세요.",
  "done": true
}
Example 4 (all regions unknown — div-only layout like real HScan):
User intent: "내 영상 다운로드 받고 싶어"
Snapshot summary: all elements have region "unknown".
Elements include:
  { id: "auto:abc-1", label: "홈", href: null }
  { id: "auto:abc-2", label: "내 영상 목록", href: null }
  { id: "auto:abc-3", label: "내 정보", href: null }

Example 3 (home card is the current-page entry point):
User intent: "내 영상 받고 싶어"
Snapshot summary: page /, main has button id="id:card-receive" label="내 영상 병원에서 받기".
Output:
{
  "steps": [
    {
      "id": "s1",
      "type": "navigate",
      "targetId": "auto:abc-2",
      "description": "영상 목록으로 이동합니다."
    }
  ],
  "assistantMessage": "영상 목록 페이지로 이동할게요.",
  "done": false
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

  const navClick = navClickPlan(ctx.snapshot, intent);
  if (navClick) return navClick;

  const imageAction = imageItemActionPlan(ctx.snapshot, intent);
  if (imageAction) return imageAction;

  const cdRequest = cdRequestPlan(ctx.snapshot, intent);
  if (cdRequest) return cdRequest;

  const explicitStep = explicitInteractionPlan(ctx.snapshot, intent);
  if (explicitStep) return explicitStep;

  for (const rule of DIRECT_RULES) {
    if (!matchesAny(intent, rule.intent)) continue;
    const target = findElement(ctx.snapshot, rule.labels);
    if (target) return highlightPlan(target, rule);
  }

  const needsImagesPage =
    matchesAny(intent, ['다운로드', '삭제', '검색', '영상검색', '목록', '리스트']) ||
    matchesAny(intent, ['의사공유', '공유', '병원전달', '전달']);
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

function cdRequestPlan(snapshot: DomSnapshot, intent: string): PlanResult | null {
  if (
    !matchesAny(intent, [
      'CD신청',
      'CD배송',
      'CD로배송',
      'CD받',
      'CD로받',
      'CD로받고',
      '씨디신청',
      '씨디배송',
      '씨디받',
      '씨디로받',
    ])
  ) {
    return null;
  }

  if (isCdRequestPage(snapshot)) {
    const firstInput = findElement(snapshot, ['수령인이름', '이름']);
    if (!firstInput) return null;
    return {
      plan: {
        steps: [
          {
            id: 's1',
            type: 'input',
            targetId: firstInput.id,
            description: '먼저 수령인 이름을 입력하세요.',
          },
        ],
        assistantMessage: 'CD 배송 신청을 위해 수령인 이름부터 입력하세요.',
        done: true,
      },
      warnings: [],
    };
  }

  const card = findElement(snapshot, ['내영상CD로배송받기']);
  if (card) {
    return {
      plan: {
        steps: [
          {
            id: 's1',
            type: 'navigate',
            targetId: card.id,
            expectedUrlPattern: '/cd-request',
            description: 'CD 배송 신청 페이지로 이동합니다.',
          },
        ],
        assistantMessage: 'CD 배송 신청 페이지로 이동할게요.',
        done: false,
      },
      warnings: [],
    };
  }

  return {
    plan: {
      steps: [
        {
          id: 's1',
          type: 'navigate',
          url: '/cd-request',
          expectedUrlPattern: '/cd-request',
          description: 'CD 배송 신청 페이지로 이동합니다.',
        },
      ],
      assistantMessage: 'CD 배송 신청 페이지로 이동할게요.',
      done: false,
    },
    warnings: [],
  };
}

interface NavClickRule {
  intent: string[];
  labels: string[];
  description: string;
  assistantMessage: string;
}

const NAV_CLICK_RULES: NavClickRule[] = [
  {
    intent: ['홈으로가', '홈가줘', '홈으로이동', '홈이동', '메인으로가', '처음으로가'],
    labels: ['홈'],
    description: '홈 탭으로 이동합니다.',
    assistantMessage: '홈으로 이동할게요.',
  },
  {
    intent: ['영상목록으로가', '영상목록가줘', '내영상목록으로가', '내영상목록가줘', '목록으로가'],
    labels: ['내영상목록'],
    description: '영상 목록 탭으로 이동합니다.',
    assistantMessage: '영상 목록으로 이동할게요.',
  },
  {
    intent: ['내정보로가', '내정보가줘', '마이페이지로가', '마이페이지가줘', '설정으로가'],
    labels: ['내정보'],
    description: '내 정보 탭으로 이동합니다.',
    assistantMessage: '내 정보로 이동할게요.',
  },
];

function navClickPlan(snapshot: DomSnapshot, intent: string): PlanResult | null {
  const rule = NAV_CLICK_RULES.find((candidate) => matchesAny(intent, candidate.intent));
  if (!rule) return null;

  const target = findElement(snapshot, rule.labels);
  if (!target) return null;

  return {
    plan: {
      steps: [
        {
          id: 's1',
          type: 'click',
          targetId: target.id,
          description: rule.description,
        },
      ],
      assistantMessage: rule.assistantMessage,
      done: true,
    },
    warnings: [],
  };
}

interface ImageNameRule {
  displayName: string;
  aliases: string[];
}

interface ImageActionRule {
  intent: string[];
  labels: string[];
  description: string;
  assistantAction: string;
}

const IMAGE_NAME_RULES: ImageNameRule[] = [
  {
    displayName: 'Knee (R)',
    aliases: ['Knee', 'Knee (R)', '무릎', '무를', '오른쪽무릎', '무릎오른쪽'],
  },
  {
    displayName: 'Chest',
    aliases: ['Chest', '흉부', '가슴', '폐', '엑스레이', 'xray', 'xc'],
  },
  {
    displayName: 'Brain',
    aliases: ['Brain', '뇌', '머리', '두부'],
  },
  {
    displayName: 'Spine',
    aliases: ['Spine', '척추', '허리', '등'],
  },
];

const IMAGE_ACTION_RULES: ImageActionRule[] = [
  {
    intent: ['다운로드', '다운받', '내려받'],
    labels: ['다운로드'],
    description: '다운로드',
    assistantAction: '다운로드할게요',
  },
  {
    intent: ['삭제', '지우'],
    labels: ['삭제'],
    description: '삭제',
    assistantAction: '삭제할게요',
  },
  {
    intent: ['의사에게보여', '의사한테보여', '의사공유', '의사에게보내', '의사한테보내'],
    labels: ['의사공유'],
    description: '의사 공유',
    assistantAction: '의사에게 공유할게요',
  },
  {
    intent: ['병원으로보내', '병원에보내', '병원전달', '전달', '보내'],
    labels: ['병원전달'],
    description: '병원 전달',
    assistantAction: '병원으로 전달할게요',
  },
  {
    intent: ['CD신청', 'CD배송', 'CD로배송', 'CD받', '씨디신청', '씨디배송'],
    labels: ['CD신청'],
    description: 'CD 신청',
    assistantAction: 'CD 신청할게요',
  },
];

function imageItemActionPlan(snapshot: DomSnapshot, intent: string): PlanResult | null {
  const image = findRequestedImage(intent);
  const action = findRequestedImageAction(intent);
  if (!image || !action) return null;

  if (!isImagesPage(snapshot)) {
    const tab = findElement(snapshot, ['내영상목록']);
    if (!tab) return null;
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
        assistantMessage: `${image.displayName} 영상을 처리하기 위해 영상 목록으로 이동할게요.`,
        done: false,
      },
      warnings: [],
    };
  }

  const checkbox = findImageCheckbox(snapshot, image);
  const actionButton = findElement(snapshot, action.labels);
  if (!checkbox || !actionButton) return null;
  const otherCheckedImages = findCheckedImageCheckboxes(snapshot).filter(
    (item) => item.id !== checkbox.id,
  );

  return {
    plan: {
      steps: [
        ...otherCheckedImages.map((item, index) => ({
          id: `s${index + 1}`,
          type: 'click' as const,
          targetId: item.id,
          description: `${imageCheckboxName(item)} 영상 선택 해제`,
        })),
        ...(checkbox.checked
          ? []
          : [
              {
                id: `s${otherCheckedImages.length + 1}`,
                type: 'click' as const,
                targetId: checkbox.id,
                description: `${image.displayName} 영상 선택`,
              },
            ]),
        {
          id: `s${otherCheckedImages.length + (checkbox.checked ? 1 : 2)}`,
          type: 'click',
          targetId: actionButton.id,
          description: `${action.description} 실행`,
        },
      ],
      assistantMessage: `${image.displayName} 영상을 선택한 뒤 ${action.assistantAction}.`,
      done: true,
    },
    warnings: [],
  };
}

function findRequestedImage(intent: string): ImageNameRule | null {
  return (
    IMAGE_NAME_RULES.find((rule) =>
      rule.aliases.some((alias) => intent.includes(normalize(alias))),
    ) ?? null
  );
}

function findRequestedImageAction(intent: string): ImageActionRule | null {
  return IMAGE_ACTION_RULES.find((rule) => matchesAny(intent, rule.intent)) ?? null;
}

function findImageCheckbox(snapshot: DomSnapshot, image: ImageNameRule): InteractiveElement | null {
  const aliases = image.aliases.map(normalize);
  return (
    allElements(snapshot).find((item) => {
      if (!item.visibleNow) return false;
      if (item.tag !== 'input') return false;
      const label = normalize(item.label);
      return aliases.some((alias) => label.includes(alias));
    }) ?? null
  );
}

function findCheckedImageCheckboxes(snapshot: DomSnapshot): InteractiveElement[] {
  return allElements(snapshot).filter((item) => {
    if (!item.visibleNow || item.tag !== 'input' || !item.checked) return false;
    const label = normalize(item.label);
    return IMAGE_NAME_RULES.some((rule) =>
      rule.aliases.some((alias) => label.includes(normalize(alias))),
    );
  });
}

function imageCheckboxName(item: InteractiveElement): string {
  return item.label.replace(/\s*선택\s*$/, '').trim() || '기존';
}

function explicitInteractionPlan(snapshot: DomSnapshot, intent: string): PlanResult | null {
  const type = explicitInteractionType(intent);
  if (!type) return null;

  const target = findExplicitTarget(snapshot, intent);
  if (!target) return null;

  const action = type === 'click' ? '클릭합니다.' : '이 위치로 이동합니다.';
  return {
    plan: {
      steps: [
        {
          id: 's1',
          type,
          targetId: target.id,
          description: `${target.label || '대상'} ${action}`,
        },
      ],
      assistantMessage: `${target.label || '대상'} 위치를 ${type === 'click' ? '클릭할게요.' : '보여드릴게요.'}`,
      done: true,
    },
    warnings: [],
  };
}

function explicitInteractionType(intent: string): 'click' | 'scroll' | null {
  if (matchesAny(intent, ['클릭', '눌러', '누르', '터치'])) return 'click';
  if (matchesAny(intent, ['스크롤', '이동해', '위치로', '보여줘'])) return 'scroll';
  return null;
}

function findExplicitTarget(snapshot: DomSnapshot, intent: string): InteractiveElement | null {
  const ordinal = findOrdinalTarget(snapshot, intent);
  if (ordinal) return ordinal;

  for (const rule of DIRECT_RULES) {
    if (!matchesAny(intent, rule.intent)) continue;
    const target = findElement(snapshot, rule.labels);
    if (target) return target;
  }

  const byLabel = allElements(snapshot).find((item) => item.visibleNow && normalize(item.label) && intent.includes(normalize(item.label)));
  if (byLabel) return byLabel;

  return null;
}

function findOrdinalTarget(snapshot: DomSnapshot, intent: string): InteractiveElement | null {
  const cards = allElements(snapshot).filter((item) => item.visibleNow && item.tag === 'button' && normalize(item.id).includes('card'));
  if (cards.length === 0) return null;
  if (matchesAny(intent, ['첫번째', '첫째', '1번째', '1번'])) return cards[0] ?? null;
  if (matchesAny(intent, ['두번째', '둘째', '2번째', '2번'])) return cards[1] ?? null;
  if (matchesAny(intent, ['세번째', '셋째', '3번째', '3번'])) return cards[2] ?? null;
  if (matchesAny(intent, ['네번째', '넷째', '4번째', '4번'])) return cards[3] ?? null;
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
    intent: ['CD로배송', 'CD배송', 'CD받', 'CD로받', 'CD신청', '씨디'],
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

function isCdRequestPage(snapshot: DomSnapshot): boolean {
  return snapshot.url.includes('/cd-request') || Boolean(findElement(snapshot, ['수령인이름']));
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
    snapshot: compressSnapshot(snapshot),
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

function compressSnapshot(snapshot: DomSnapshot): DomSnapshot {
  const MAX_ELEMENTS = 40;
  const compressed: DomSnapshot = {
    url: snapshot.url,
    title: snapshot.title,
    capturedAt: snapshot.capturedAt,
    regions: {} as Record<RegionName, InteractiveElement[]>,
  };


  let total = 0;
  const regionOrder: RegionName[] = ['nav', 'header', 'main', 'aside', 'footer', 'unknown'];

 
  for (const region of regionOrder) {
    const items = snapshot.regions[region] ?? [];
    const visible = items.filter((it) => it.visibleNow);
    compressed.regions[region] = visible.map(stripFields);
    total += visible.length;
  }


  if (total < MAX_ELEMENTS) {
    for (const region of regionOrder) {
      const items = snapshot.regions[region] ?? [];
      const hidden = items.filter((it) => !it.visibleNow);
      const remaining = MAX_ELEMENTS - total;
      const toAdd = hidden.slice(0, remaining).map(stripFields);
      compressed.regions[region] = [...(compressed.regions[region] ?? []), ...toAdd];
      total += toAdd.length;
      if (total >= MAX_ELEMENTS) break;
    }
  }

  return compressed;
}

function stripFields(it: InteractiveElement): InteractiveElement {
  const out: InteractiveElement = {
    id: it.id,
    tag: it.tag,
    role: it.role,
    label: it.label,
    selector: it.selector,
    region: it.region,
    visibleNow: it.visibleNow,
  };
  if (it.groupLabel) out.groupLabel = it.groupLabel;
  if (it.href) out.href = it.href;

  return out;
}