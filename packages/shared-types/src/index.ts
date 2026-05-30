import { z } from 'zod';

export const zBoundingRect = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type BoundingRect = z.infer<typeof zBoundingRect>;

export const REGION_NAMES = ['header', 'nav', 'main', 'aside', 'footer', 'unknown'] as const;
export const zRegionName = z.enum(REGION_NAMES);
export type RegionName = z.infer<typeof zRegionName>;

export const zInteractiveElement = z.object({
  id: z.string(),
  tag: z.string(),
  role: z.string(),
  label: z.string(),
  selector: z.string(),
  region: zRegionName,
  groupLabel: z.string().optional(),
  visibleNow: z.boolean(),
  href: z.string().optional(),
  checked: z.boolean().optional(),
  boundingRect: zBoundingRect.optional(),
});
export type InteractiveElement = z.infer<typeof zInteractiveElement>;

export const zDomSnapshot = z.object({
  url: z.string(),
  title: z.string(),
  capturedAt: z.number(),
  regions: z.record(zRegionName, z.array(zInteractiveElement)),
});
export type DomSnapshot = z.infer<typeof zDomSnapshot>;

export const zActionStep = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('highlight'),
    targetId: z.string(),
    description: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('click'),
    targetId: z.string(),
    description: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('input'),
    targetId: z.string(),
    value: z.string().optional(),
    description: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('scroll'),
    targetId: z.string(),
    description: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('navigate'),
    targetId: z.string().optional(),
    url: z.string().optional(),
    expectedUrlPattern: z.string().optional(),
    description: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('explain'),
    description: z.string(),
  }),
]);
export type ActionStep = z.infer<typeof zActionStep>;

export const zActionPlan = z.object({
  steps: z.array(zActionStep),
  assistantMessage: z.string(),
  done: z.boolean(),
});
export type ActionPlan = z.infer<typeof zActionPlan>;

export const zChatMessage = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  createdAt: z.number(),
});
export type ChatMessage = z.infer<typeof zChatMessage>;

export const zStepStatus = z.enum(['done', 'waiting-user', 'failed', 'navigated']);
export type StepStatus = z.infer<typeof zStepStatus>;

export const zExecutedStep = z.object({
  step: zActionStep,
  status: zStepStatus,
  finishedAtUrl: z.string(),
  reason: z.string().optional(),
});
export type ExecutedStep = z.infer<typeof zExecutedStep>;

export const zPlanContext = z.object({
  sessionId: z.string(),
  originalUserMessage: z.string(),
  history: z.array(zChatMessage),
  snapshot: zDomSnapshot,
  executedSteps: z.array(zExecutedStep),
});
export type PlanContext = z.infer<typeof zPlanContext>;

export const PLAN_SESSION_STATES = [
  'idle',
  'fetching-snapshot',
  'calling-plan',
  'executing-step',
  'awaiting-page-ready',
  'done',
  'failed',
] as const;
export const zPlanSessionState = z.enum(PLAN_SESSION_STATES);
export type PlanSessionState = z.infer<typeof zPlanSessionState>;

export const zPlanSessionView = z.object({
  id: z.string(),
  state: zPlanSessionState,
  originalUserMessage: z.string(),
  currentPlan: zActionPlan.nullable(),
  currentStepIndex: z.number().int().nonnegative(),
  executedSteps: z.array(zExecutedStep),
  errorMessage: z.string().optional(),
});
export type PlanSessionView = z.infer<typeof zPlanSessionView>;

export const zExtensionMessage = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('user-input'),
    message: zChatMessage,
    history: z.array(zChatMessage),
  }),
  z.object({
    kind: z.literal('assistant-reply'),
    message: zChatMessage,
  }),
  z.object({
    kind: z.literal('request-snapshot'),
  }),
  z.object({
    kind: z.literal('snapshot-result'),
    snapshot: zDomSnapshot,
  }),
  z.object({
    kind: z.literal('execute-step'),
    step: zActionStep,
  }),
  z.object({
    kind: z.literal('step-result'),
    stepId: z.string(),
    status: zStepStatus,
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('page-ready'),
    url: z.string(),
    title: z.string(),
  }),
  z.object({
    kind: z.literal('plan-update'),
    sessionId: z.string(),
    session: zPlanSessionView,
  }),
  z.object({
    kind: z.literal('cancel-session'),
    sessionId: z.string(),
  }),
  z.object({
    kind: z.literal('hide-highlight'),
  })
]);
export type ExtensionMessage = z.infer<typeof zExtensionMessage>;
