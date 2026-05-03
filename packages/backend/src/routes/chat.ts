import { Router } from 'express';
import { z } from 'zod';
import { zChatMessage } from '@hscan/shared-types';
import { chatComplete } from '../services/openai.js';

const zChatRequest = z.object({
  messages: z.array(zChatMessage).min(1),
});

export const chatRouter = Router();

chatRouter.post('/', async (req, res) => {
  const parsed = zChatRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.flatten(),
    });
  }

  try {
    const assistantMessage = await chatComplete(parsed.data.messages);
    return res.json({ assistantMessage });
  } catch (err) {
    console.error('[POST /chat] OpenAI call failed:', err);
    return res.status(500).json({
      error: '응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    });
  }
});
