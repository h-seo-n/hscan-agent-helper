import { Router } from 'express';
import { zPlanContext } from '@hscan/shared-types';
import { generatePlan } from '../services/plan.js';
import { logger } from '../lib/logger.js';

export const planRouter = Router();

planRouter.post('/', async (req, res) => {
  const start = Date.now();
  const parsed = zPlanContext.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: '플랜을 생성하지 못했어요. 잠시 후 다시 시도해주세요.',
      details: parsed.error.flatten(),
    });
  }

  const snapshotSize = Object.values(parsed.data.snapshot.regions)
    .flatMap((items) => items ?? [])
    .length;

  try {
    const { plan, warnings } = await generatePlan(parsed.data);
    const latency = Date.now() - start;

    logger.info({
      msg: 'plan generated',
      latencyMs: latency,
      snapshotElements: snapshotSize,
      stepCount: plan.steps.length,
      stepTypes: plan.steps.map((s) => s.type),
      done: plan.done,
      warnings,
    });

    return res.json({ plan, warnings });
  } catch (err) {
    const latency = Date.now() - start;
    logger.error({
      msg: 'plan failed',
      latencyMs: latency,
      snapshotElements: snapshotSize,
      err: err instanceof Error ? err.message : String(err),
    });

    const message =
      err instanceof Error && err.message.includes('empty plan response')
        ? 'AI 응답이 없었어요. 잠시 후 다시 시도해 주세요.'
        : err instanceof Error && err.message.includes('schema mismatch')
          ? 'AI 응답 형식이 맞지 않아요. 다시 시도해 주세요.'
          : '플랜을 생성하지 못했어요. 잠시 후 다시 시도해 주세요.';
    return res.status(500).json({ error: message });
  }
});