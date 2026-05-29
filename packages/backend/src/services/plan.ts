import OpenAI from 'openai';
import {
  type ActionPlan,
  type DomSnapshot,
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
4. After arriving on the page that contains the actual entry point for the user's task, produce
   a short plan: at minimum one highlight on the entry point and one explain telling the user
   what to do there. Set done=true.
5. Use executedSteps to understand what already happened on previous pages. Do not re-run a
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
      return fallbackPlan();
    }
  }
}

function fallbackPlan(): PlanResult {
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