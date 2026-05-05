import type { PlanSessionView } from '@hscan/shared-types';

interface Props {
  session: PlanSessionView | null;
  onCancel: (sessionId: string) => void;
}

const STATE_LABEL: Record<PlanSessionView['state'], string> = {
  idle: '대기',
  'fetching-snapshot': '페이지 분석 중…',
  'calling-plan': '플랜 생성 중…',
  'executing-step': '실행 중…',
  'awaiting-page-ready': '페이지 이동 중…',
  done: '완료',
  failed: '실패',
};

export function ProgressPanel({ session, onCancel }: Props) {
  if (!session) return null;

  const steps = session.currentPlan?.steps ?? [];
  const isActive = session.state !== 'done' && session.state !== 'failed';

  return (
    <div className="progress">
      <div className="progress__header">
        <span className={`progress__badge progress__badge--${session.state}`}>
          {STATE_LABEL[session.state]}
        </span>
        <span className="progress__intent">{session.originalUserMessage}</span>
        {isActive && (
          <button
            type="button"
            className="progress__cancel"
            onClick={() => onCancel(session.id)}
            aria-label="진행 중인 작업 취소"
          >
            취소
          </button>
        )}
      </div>

      {steps.length > 0 && (
        <ol className="progress__steps">
          {steps.map((step, idx) => {
            const status = stepStatus(session, idx);
            return (
              <li key={step.id} className={`progress__step progress__step--${status}`}>
                <span className="progress__step-type">{step.type}</span>
                <span className="progress__step-desc">{step.description}</span>
              </li>
            );
          })}
        </ol>
      )}

      {session.errorMessage && <div className="progress__error">{session.errorMessage}</div>}
    </div>
  );
}

function stepStatus(
  session: PlanSessionView,
  idx: number,
): 'done' | 'active' | 'pending' | 'failed' {
  if (session.state === 'failed' && idx === session.currentStepIndex) return 'failed';
  if (idx < session.currentStepIndex) return 'done';
  if (idx === session.currentStepIndex && session.state !== 'done') return 'active';
  if (session.state === 'done') return 'done';
  return 'pending';
}
