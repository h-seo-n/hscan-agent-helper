import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

interface Props {
  children: ReactNode;
}

const TABS = [
  { to: '/', label: '홈', testid: 'tab-home' },
  { to: '/images', label: '내 영상 목록', testid: 'tab-images' },
  { to: '/my', label: '내 정보', testid: 'tab-my' },
];

export function AppShell({ children }: Props) {
  const { pathname } = useLocation();
  const immersive = pathname.startsWith('/receive');
  return (
    <div className={immersive ? 'shell shell--immersive' : 'shell'}>
      {!immersive && (
        <header className="shell__header">
          <a href="/" className="shell__logo" id="logo-home">
            DemoScan
          </a>
          <div className="shell__header-right">
            <button type="button" id="btn-user" className="shell__user">
              허서연님
            </button>
            <button type="button" aria-label="알림" className="shell__icon">
              🔔
            </button>
            <button type="button" aria-label="언어 변경" className="shell__icon">
              🌐
            </button>
          </div>
        </header>
      )}
      <div className="shell__page">{children}</div>
      {!immersive && (
        <nav className="shell__tabbar" aria-label="주요 메뉴">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              data-testid={t.testid}
              end
              className={({ isActive }) =>
                `shell__tab ${isActive || pathname === t.to ? 'shell__tab--active' : ''}`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
