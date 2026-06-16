import { useState } from 'react';

export function CdRequestPage() {
  const [recipient, setRecipient] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);

  const readyToSubmit =
    recipient.trim().length > 0 && phone.trim().length > 0 && address.trim().length > 0;

  return (
    <div className="cd-request">
      <h1 className="cd-request__title">CD 배송 신청</h1>
      <p className="cd-request__intro">영상 CD를 받을 배송 정보를 입력하세요.</p>

      <form className="cd-request__form">
        <label className="cd-request__field" htmlFor="cd-recipient">
          <span>수령인 이름</span>
          <input
            id="cd-recipient"
            name="recipient"
            type="text"
            placeholder="예: 허서연"
            autoComplete="name"
            value={recipient}
            onChange={(event) => {
              setRecipient(event.target.value);
              setSubmitted(false);
              setShowCompleteDialog(false);
            }}
          />
        </label>

        <label className="cd-request__field" htmlFor="cd-phone">
          <span>연락처</span>
          <input
            id="cd-phone"
            name="phone"
            type="tel"
            placeholder="010-0000-0000"
            autoComplete="tel"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setSubmitted(false);
              setShowCompleteDialog(false);
            }}
          />
        </label>

        <label className="cd-request__field" htmlFor="cd-address">
          <span>배송 주소</span>
          <input
            id="cd-address"
            name="address"
            type="text"
            placeholder="주소를 입력하세요"
            autoComplete="street-address"
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              setSubmitted(false);
              setShowCompleteDialog(false);
            }}
          />
        </label>

        <button
          id="btn-cd-submit"
          type="button"
          className="cd-request__submit"
          disabled={!readyToSubmit}
          onClick={() => {
            setSubmitted(true);
            setShowCompleteDialog(true);
          }}
        >
          확인
        </button>
      </form>

      {submitted && (
        <div
          id="status-cd-request-complete"
          role="status"
          data-aiwa-id="status-cd-request-complete"
          data-aiwa-status="cd-request-complete"
          className="cd-request__status"
        >
          CD 배송 신청이 완료되었습니다.
        </div>
      )}

      {showCompleteDialog && (
        <div className="cd-request__dialog-backdrop" role="presentation">
          <div
            className="cd-request__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cd-complete-title"
          >
            <h2 id="cd-complete-title">CD 배송 신청이 완료되었습니다</h2>
            <p>입력하신 배송 정보로 의료영상 CD 배송 신청이 접수되었습니다.</p>
            <button
              id="btn-cd-complete-close"
              type="button"
              className="cd-request__dialog-close"
              onClick={() => setShowCompleteDialog(false)}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
