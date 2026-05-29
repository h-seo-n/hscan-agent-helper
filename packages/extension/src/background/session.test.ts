import { describe, it, expect } from 'vitest';
import type { ActionPlan } from '@hscan/shared-types';
import { applyStepResult, createSession, currentStep, loadPlan } from './session';

function makeSession() {
  return createSession({
    id: 'sess-1',
    tabId: 1,
    originalUserMessage: '발급 받고 싶어',
    history: [],
  });
}

const navigatePlan: ActionPlan = {
  steps: [
    {
      id: 's1',
      type: 'navigate',
      targetId: 'tid:tab-images',
      expectedUrlPattern: '/images',
      description: '이동',
    },
  ],
  assistantMessage: '이동할게요',
  done: false,
};

const onPagePlan: ActionPlan = {
  steps: [
    { id: 's2', type: 'highlight', targetId: 'auto:abc-1', description: '검색창' },
    { id: 's3', type: 'explain', description: '여기에 검색하세요' },
  ],
  assistantMessage: '여기서 검색하세요',
  done: true,
};

const inputPlan: ActionPlan = {
  steps: [{ id: 's1', type: 'input', targetId: 'cd-recipient', description: '수령인 이름 입력' }],
  assistantMessage: '수령인 이름부터 입력하세요',
  done: true,
};

describe('PlanSession transitions', () => {
  it('loadPlan moves to executing-step', () => {
    const s = makeSession();
    const t = loadPlan(s, navigatePlan);
    expect(s.state).toBe('executing-step');
    expect(t.kind).toBe('execute-next-step');
    expect(currentStep(s)?.id).toBe('s1');
  });

  it('navigate step → awaiting-page-ready', () => {
    const s = makeSession();
    loadPlan(s, navigatePlan);
    const t = applyStepResult(s, 's1', 'navigated', 'http://x/images');
    expect(s.state).toBe('awaiting-page-ready');
    expect(t.kind).toBe('await-page-ready');
    expect(s.executedSteps).toHaveLength(1);
    expect(s.executedSteps[0]?.status).toBe('navigated');
  });

  it('done step at end of done plan → finish-done', () => {
    const s = makeSession();
    loadPlan(s, onPagePlan);
    applyStepResult(s, 's2', 'done', 'http://x/images');
    const t = applyStepResult(s, 's3', 'done', 'http://x/images');
    expect(t.kind).toBe('finish-done');
    expect(s.state).toBe('done');
  });

  it('failed step retries once via replan', () => {
    const s = makeSession();
    loadPlan(s, onPagePlan);
    const t1 = applyStepResult(s, 's2', 'failed', 'http://x/images', 'oops');
    expect(t1.kind).toBe('replan');
    expect(s.state).toBe('calling-plan');

    // simulate new plan, fail again
    loadPlan(s, onPagePlan);
    s.retries = 1;
    const t2 = applyStepResult(s, 's2', 'failed', 'http://x/images', 'oops2');
    expect(t2.kind).toBe('finish-failed');
    expect(s.state).toBe('failed');
  });

  it('mismatched stepId returns finish-failed', () => {
    const s = makeSession();
    loadPlan(s, navigatePlan);
    const t = applyStepResult(s, 'bogus', 'done', 'http://x/');
    expect(t.kind).toBe('finish-failed');
  });

  it('waiting-user input step finishes without re-executing the same step', () => {
    const s = makeSession();
    loadPlan(s, inputPlan);
    const t = applyStepResult(s, 's1', 'waiting-user', 'http://x/cd-request');
    expect(t.kind).toBe('finish-done');
    expect(s.state).toBe('done');
    expect(s.currentStepIndex).toBe(1);
    expect(s.executedSteps[0]?.status).toBe('waiting-user');
  });

  it('full sequence: navigate → page-ready → replan → highlight → done', () => {
    // start with navigate plan
    const s = makeSession();
    loadPlan(s, navigatePlan);
    applyStepResult(s, 's1', 'navigated', 'http://x/images');
    expect(s.state).toBe('awaiting-page-ready');

    // simulate orchestrator: page-ready handler sets state to fetching-snapshot,
    // then a fresh plan is loaded.
    s.state = 'calling-plan';
    loadPlan(s, onPagePlan);
    expect(s.state).toBe('executing-step');
    applyStepResult(s, 's2', 'done', 'http://x/images');
    const t = applyStepResult(s, 's3', 'done', 'http://x/images');
    expect(t.kind).toBe('finish-done');
    expect(s.state).toBe('done');
    // executedSteps accumulated across pages
    expect(s.executedSteps.map((e) => e.step.id)).toEqual(['s1', 's2', 's3']);
  });
});
