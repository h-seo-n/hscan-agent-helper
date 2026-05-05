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
} from '@shared/types';

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

export function buildPlanContext(session: PlanSession, snapshot: DomSnapshot): PlanContext {
  return {
    sessionId: session.id,
    originalUserMessage: session.originalUserMessage,
    history: session.history,
    snapshot,
    executedSteps: session.executedSteps,
  };
}

export function currentStep(session: PlanSession): ActionStep | null {
  if (!session.currentPlan) return null;
  return session.currentPlan.steps[session.currentStepIndex] ?? null;
}

/**
 * Pure transition function — given a session and a step result, decide the next state.
 * Mutates the session in place and returns a Transition describing what happened so the
 * orchestrator can perform side effects (request snapshot, call /plan, finish, etc).
 */
export type Transition =
  | { kind: 'execute-next-step' }
  | { kind: 'await-page-ready' }
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
    // stay on same step
    return { kind: 'execute-next-step' };
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
    // plan exhausted but not marked done — replan with current snapshot.
    session.state = 'calling-plan';
    return { kind: 'replan' };
  }
  session.state = 'executing-step';
  return { kind: 'execute-next-step' };
}

export function loadPlan(session: PlanSession, plan: ActionPlan): Transition {
  session.currentPlan = plan;
  session.currentStepIndex = 0;
  session.retries = 0;

  if (plan.steps.length === 0) {
    session.state = 'done';
    return { kind: 'finish-done' };
  }
  session.state = 'executing-step';
  return { kind: 'execute-next-step' };
}
