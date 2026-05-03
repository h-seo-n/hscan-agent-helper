import OpenAI from 'openai';
import type { ChatMessage } from '@hscan/shared-types';
import { env } from '../lib/env.js';

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const SYSTEM_PROMPT =
  'You are a helpful in-browser assistant. Answer concisely in the user\'s language.';
// TODO: replace in Prompt B — system prompt will need to instruct the model
// to emit ActionPlan JSON given a DomSnapshot.

export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  const response = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  const reply = response.choices[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error('OpenAI returned empty response');
  }
  return reply;
}
