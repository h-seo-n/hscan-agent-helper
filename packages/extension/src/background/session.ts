import type {
  ActionPlan,
  ActionStep,
  ChatMessage,
  DomSnapshot,
  ExecutedStep,
  PlanContext,
  PlanSessionState,
  PlanSessionView,
  StepStatus,
} from '@hscan/shared-types';

export interface PlanSession {
  id: string;
  tabId: number;
  state: PlanSessionState;
  originalUserMessage: string;
  history: ChatMessage[];
  executedSteps: ExecutedStep[];
  currentPlan: ActionPlan | null;
  currentStepIndex: number;
  lastSnapshot: DomSnapshot | null;
  errorMessage?: string;
  retries: number;
  pendingPageReady: boolean;
  pageChangeSeq: number;
  lastUserActivityAt: number;
}

export function createSession(args: {
  id: string;
  tabId: number;
  originalUserMessage: string;
  history: ChatMessage[];
}): PlanSession {
  return {
    id: args.id,
    tabId: args.tabId,
    state: 'idle',
    originalUserMessage: args.originalUserMessage,
    history: args.history,
    executedSteps: [],
    currentPlan: null,
    currentStepIndex: 0,
    lastSnapshot: null,
    retries: 0,
    pendingPageReady: false,
    pageChangeSeq: 0,
    lastUserActivityAt: 0,
  };
}

export function toView(session: PlanSession): PlanSessionView {
  const view: PlanSessionView = {
    id: session.id,
    state: session.state,
    originalUserMessage: session.originalUserMessage,
    currentPlan: session.currentPlan,
    currentStepIndex: session.currentStepIndex,
    executedSteps: session.executedSteps,
  };
  if (session.errorMessage) view.errorMessage = session.errorMessage;
  return view;
}

// 세션의 현재 상태와 새로 추출된 스냅샷을 합쳐 Backend /plan 엔드포인트에 보낼 페이로드를 만든다
export function buildPlanContext(session: PlanSession, snapshot: DomSnapshot): PlanContext {
  return {
    sessionId: session.id,
    originalUserMessage: session.originalUserMessage,
    history: session.history,
    snapshot,
    executedSteps: session.executedSteps,
  };
}

// 
export function currentStep(session: PlanSession): ActionStep | null {
  if (!session.currentPlan) return null;
  return session.currentPlan.steps[session.currentStepIndex] ?? null;
}

/**
 * Pure transition function — given a session and a step result, decide the next state.
 * Mutates the session in  place and returns a Transition describing what happened so the
 * orchestrator can perform side effects (request snapshot, call /plan, finish, etc).
 */
export type Transition =
  | { kind: 'execute-next-step' }
  | { kind: 'await-page-ready' }
  | { kind: 'fetch-snapshot' }
  | { kind: 'wait-for-user' }
  | { kind: 'replan' }
  | { kind: 'finish-done' }
  | { kind: 'finish-failed'; reason: string };

export function applyStepResult(
  session: PlanSession,
  stepId: string,
  status: StepStatus,
  url: string,
  reason?: string,
): Transition {
  const step = currentStep(session);
  if (!step || step.id !== stepId) {
    return { kind: 'finish-failed', reason: `step-result for unknown step ${stepId}` };
  }

  const executed: ExecutedStep = { step, status, finishedAtUrl: url };
  if (reason) executed.reason = reason;
  session.executedSteps.push(executed);

  if (status === 'waiting-user') {
    session.currentStepIndex += 1;
    session.state = 'waiting-user';
    return { kind: 'wait-for-user' };
  }
  if (status === 'navigated') {
    session.state = 'awaiting-page-ready';
    return { kind: 'await-page-ready' };
  }
  if (status === 'failed') {
    if (session.retries < 1) {
      session.retries += 1;
      session.state = 'calling-plan';
      return { kind: 'replan' };
    }
    session.state = 'failed';
    session.errorMessage = reason ?? 'step failed';
    return { kind: 'finish-failed', reason: reason ?? 'step failed' };
  }

  // status === 'done'
  session.currentStepIndex += 1;
  if (session.currentPlan && session.currentStepIndex >= session.currentPlan.steps.length) {
    if (session.currentPlan.done) {
      session.state = 'done';
      return { kind: 'finish-done' };
    }
    if (isPassivePlan(session.currentPlan)) {
      session.state = 'waiting-user';
      return { kind: 'wait-for-user' };
    }
    // plan exhausted but the scenario is not complete. Re-read the page before asking
    // the planner for the next milestone, because the last step may have changed the UI.
    session.state = 'fetching-snapshot';
    return { kind: 'fetch-snapshot' };
  }
  session.state = 'executing-step';
  return { kind: 'execute-next-step' };
}

function isPassivePlan(plan: ActionPlan): boolean {
  return plan.steps.every((step) =>
    step.type === 'highlight' || step.type === 'explain' || step.type === 'scroll',
  );
}

// 새로 받은 ActionPlan을 세션에 장착
export function loadPlan(session: PlanSession, plan: ActionPlan): Transition {
  session.currentPlan = plan;
  session.currentStepIndex = 0;
  session.retries = 0;

  if (plan.steps.length === 0) {
    if (plan.done) {
      session.state = 'done';
      return { kind: 'finish-done' };
    }
    session.state = 'failed';
    session.errorMessage = 'planner returned no executable steps before the scenario was complete';
    return { kind: 'finish-failed', reason: session.errorMessage };
  }
  session.state = 'executing-step';
  return { kind: 'execute-next-step' };
}
