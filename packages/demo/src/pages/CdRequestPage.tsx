export function CdRequestPage() {
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
          />
        </label>

        <button id="btn-cd-submit" type="button" className="cd-request__submit">
          확인
        </button>
      </form>
    </div>
  );
}
