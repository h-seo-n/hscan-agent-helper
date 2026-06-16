import { useNavigate } from 'react-router-dom';

interface Card {
  id: string;
  title: string;
  description: string;
  to: string;
}

const CARDS: Card[] = [
  {
    id: 'card-share',
    title: '내 영상 의사에게 보여주기',
    description: '담당 의사에게 영상 링크를 공유합니다.',
    to: '/images',
  },
  {
    id: 'card-cd',
    title: '내 영상 CD로 배송 받기',
    description: 'CD를 신청하고 우편으로 받아봅니다.',
    to: '/cd-request',
  },
  {
    id: 'card-receive',
    title: '내 영상 병원에서 받기',
    description: '진료받은 병원의 영상을 내 계정으로 가져옵니다.',
    to: '/receive',
  },
  {
    id: 'card-send',
    title: '내 영상 병원으로 보내기',
    description: '다른 병원의 진료실로 영상을 전달합니다.',
    to: '/images',
  },
];

const FOOTER_LINKS = [
  { label: 'CD 발급 가이드', href: '/my' },
  { label: '자료 받기 안내', href: '/my' },
  { label: '고객센터', href: '/my' },
];

export function HomePage() {
  const navigate = useNavigate();
  return (
    <div className="home">
      <section className="home__hero">
        <h1>안녕하세요, 허서연님</h1>
        <p>오늘은 어떤 영상을 다루시겠어요?</p>
      </section>

      <div className="home__cards">
        {CARDS.map((c) => (
          <button
            key={c.id}
            id={c.id}
            type="button"
            className="card"
            onClick={() => navigate(c.to)}
          >
            <span className="card__title">{c.title}</span>
            <span className="card__desc">{c.description}</span>
          </button>
        ))}
      </div>

      <footer className="home__footer">
        <span className="home__footer-title">도움이 필요하신가요?</span>
        <div className="home__footer-links">
          {FOOTER_LINKS.map((l) => (
            <a key={l.label} href={l.href}>
              {l.label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
