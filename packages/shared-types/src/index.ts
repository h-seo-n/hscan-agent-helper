import { z } from 'zod';

export const zBoundingRect = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type BoundingRect = z.infer<typeof zBoundingRect>;

export const zInteractiveElement = z.object({
  id: z.string(),
  role: z.string(),
  label: z.string(),
  selector: z.string(),
  boundingRect: zBoundingRect,
});
export type InteractiveElement = z.infer<typeof zInteractiveElement>;

export const zDomSnapshot = z.object({
  url: z.string(),
  title: z.string(),
  interactiveElements: z.array(zInteractiveElement),
  capturedAt: z.number(),
});
export type DomSnapshot = z.infer<typeof zDomSnapshot>;

export const zActionStep = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('highlight'),
    targetId: z.string(),
    description: z.string(),
  }),
  z.object({
    type: z.literal('click'),
    targetId: z.string(),
    description: z.string(),
  }),
  z.object({
    type: z.literal('input'),
    targetId: z.string(),
    value: z.string(),
    description: z.string(),
  }),
  z.object({
    type: z.literal('scroll'),
    targetId: z.string(),
    description: z.string(),
  }),
  z.object({
    type: z.literal('navigate'),
    url: z.string(),
    description: z.string(),
  }),
  z.object({
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
]);
export type ExtensionMessage = z.infer<typeof zExtensionMessage>;
