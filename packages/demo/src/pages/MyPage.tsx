const QUICK = [
  { id: 'my-received', label: '받은 내역' },
  { id: 'my-sent', label: '보낸 내역' },
  { id: 'my-noti', label: '알림' },
];

const NOTICES = [
  { label: '알림 설정', href: '#noti' },
  { label: '고객센터', href: '#cs' },
  { label: '사용 설명서', href: '#help' },
  { label: '자주 묻는 질문', href: '#faq' },
  { label: '약관 및 정책', href: '#terms' },
];

export function MyPage() {
  return (
    <div className="mypage">
      <h1 className="mypage__title">내 정보</h1>

      <div className="mypage__card">
        <div className="mypage__userrow">
          <div className="mypage__avatar" aria-hidden="true">
            👤
          </div>
          <span className="mypage__name">허서연</span>
          <button id="btn-settings" type="button" className="mypage__settings">
            설정
          </button>
        </div>
        <div className="mypage__quick">
          {QUICK.map((q) => (
            <button key={q.id} id={q.id} type="button" className="mypage__quickbtn">
              <span className="mypage__quickicon" aria-hidden="true">
                ●
              </span>
              <span>{q.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mypage__card">
        <h2 className="mypage__section">안내</h2>
        <ul className="mypage__list">
          {NOTICES.map((n) => (
            <li key={n.label}>
              <a href={n.href}>{n.label}</a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
