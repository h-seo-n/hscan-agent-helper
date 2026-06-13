import { useActiveOrigins } from '../hooks/useActiveOrigins';

export function ActivationToggle() {
  const { currentOrigin, enabled, loading, error, setEnabled } = useActiveOrigins();
  const unavailable = loading || !currentOrigin;

  const status = !currentOrigin
    ? '지원하지 않는 탭'
    : enabled
      ? '활성'
      : '비활성';

  return (
    <section className="activation" aria-label="현재 사이트 활성화">
      <div className="activation__copy">
        <span className="activation__title">Hscan Assistant</span>
        <span className="activation__origin">{currentOrigin ?? 'http/https 페이지에서 사용 가능'}</span>
        {error ? <span className="activation__error">{error}</span> : null}
      </div>
      <label className="activation__switch">
        <input
          type="checkbox"
          checked={enabled}
          disabled={unavailable}
          onChange={(event) => void setEnabled(event.currentTarget.checked)}
          aria-label={currentOrigin ? `${currentOrigin}에서 활성화` : '현재 탭에서 활성화'}
        />
        <span className="activation__track" aria-hidden="true">
          <span className="activation__thumb" />
        </span>
        <span className="activation__status">{loading ? '확인 중' : status}</span>
      </label>
    </section>
  );
}
