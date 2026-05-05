import { Router } from 'express';
import { zPlanContext } from '@hscan/shared-types';
import { generatePlan } from '../services/plan.js';

export const planRouter = Router();

planRouter.post('/', async (req, res) => {
  const parsed = zPlanContext.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid PlanContext',
      details: parsed.error.flatten(),
    });
  }

  try {
    const { plan, warnings } = await generatePlan(parsed.data);
    if (warnings.length > 0) {
      console.log('[POST /plan] warnings:', warnings);
    }
    return res.json({ plan, warnings });
  } catch (err) {
    console.error('[POST /plan] failed:', err);
    return res.status(500).json({
      error: '플랜을 생성하지 못했어요. 잠시 후 다시 시도해 주세요.',
    });
  }
});
