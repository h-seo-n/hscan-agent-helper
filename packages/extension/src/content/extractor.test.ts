import { describe, it, expect, beforeEach } from 'vitest';
import { extractSnapshot, getRegion, getGroupLabel } from './extractor';

function setHtml(html: string) {
  document.body.innerHTML = html;
}

describe('extractSnapshot', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 480, configurable: true });
  });

  it('classifies elements by semantic landmarks', () => {
    setHtml(`
      <header><a href="/" id="logo">DemoScan</a></header>
      <nav aria-label="주요 메뉴"><a href="/images" data-testid="tab-images">내 영상 목록</a></nav>
      <main><button id="btn-main">실행</button></main>
      <footer><a href="/help">고객센터</a></footer>
    `);
    const snap = extractSnapshot();
    const logo = findById(snap, 'id:logo');
    const tab = findById(snap, 'tid:tab-images');
    const btn = findById(snap, 'id:btn-main');
    const help = snap.regions.footer?.find((e) => e.label === '고객센터');

    expect(logo?.region).toBe('header');
    expect(tab?.region).toBe('nav');
    expect(btn?.region).toBe('main');
    expect(help?.region).toBe('footer');
  });

  it('inherits group label from nearest nav with aria-label', () => {
    setHtml(`
      <nav aria-label="검사·진료">
        <a href="/issue" data-testid="link-issue">영상 발급</a>
      </nav>
    `);
    const snap = extractSnapshot();
    const link = findById(snap, 'tid:link-issue');
    expect(link?.groupLabel).toBe('검사·진료');
  });

  it('excludes password, hidden and zero-size elements while marking disabled controls', () => {
    setHtml(`
      <main>
        <input type="password" id="pw" />
        <button id="d" disabled>off</button>
        <button id="h" style="display:none">hidden</button>
        <button id="ok">ok</button>
      </main>
    `);
    const snap = extractSnapshot();
    const ids = collectIds(snap);
    expect(ids).not.toContain('id:pw');
    expect(ids).not.toContain('id:h');
    expect(findById(snap, 'id:d')?.disabled).toBe(true);
    expect(ids).toContain('id:ok');
  });

  it('assigns stable data-aiwa-id and reuses it on second extraction', () => {
    setHtml(`<main><button>익명 버튼</button></main>`);
    extractSnapshot();
    const btn = document.querySelector('button')!;
    const firstId = btn.getAttribute('data-aiwa-id');
    expect(firstId).toBeTruthy();

    extractSnapshot();
    const secondId = btn.getAttribute('data-aiwa-id');
    expect(secondId).toBe(firstId);
  });

  it('prefers id over data-testid over name', () => {
    setHtml(`<main><input id="i1" data-testid="t1" name="n1" /></main>`);
    const snap = extractSnapshot();
    const ids = collectIds(snap);
    expect(ids).toContain('id:i1');
  });

  it('includes clickable div cards marked with cursor-pointer', () => {
    setHtml(`
      <main>
        <div class="rounded-xl cursor-pointer">
          <span>내 영상 CD로 배송 받기</span>
        </div>
      </main>
    `);
    const snap = extractSnapshot();
    const card = Object.values(snap.regions).flat().find((e) =>
      e.label.includes('내 영상 CD로 배송 받기'),
    );

    expect(card?.tag).toBe('div');
    expect(card?.id).toMatch(/^auto:/);
  });

  it('includes checkbox checked state', () => {
    setHtml(`<main><label><input id="knee" type="checkbox" checked />Knee (R) 선택</label></main>`);
    const snap = extractSnapshot();
    const checkbox = findById(snap, 'id:knee');
    expect(checkbox?.checked).toBe(true);
  });

  it('includes only input filled state without exposing the typed value', () => {
    setHtml(`<main><label for="cd-phone">연락처</label><input id="cd-phone" value="010-1234-5678" /></main>`);
    const snap = extractSnapshot();
    const input = findById(snap, 'id:cd-phone');
    expect(input?.label).toBe('연락처');
    expect(input?.filled).toBe(true);
    expect(JSON.stringify(snap)).not.toContain('010-1234-5678');
  });

  it('includes persistent status elements for workflow completion signals', () => {
    setHtml(`
      <main>
        <div
          role="status"
          data-aiwa-id="status-download-complete"
          data-aiwa-status="download-complete"
        >
          다운로드: 1건 처리 완료 (mock)
        </div>
      </main>
    `);
    const snap = extractSnapshot();
    const status = findById(snap, 'status-download-complete');
    expect(status?.role).toBe('status');
    expect(status?.label).toBe('다운로드: 1건 처리 완료 (mock)');
    expect(status?.status).toBe('download-complete');
  });

  it('captures visible text blocks and nearby context for checkout screens', () => {
    setHtml(`
      <main>
        <h1>신청 항목과 결제 금액을 확인해 주세요</h1>
        <section>
          <h2>등기우편으로 의료영상 CD 받기</h2>
          <p>등기우편비 별도입니다</p>
          <button id="address">배송지 입력하기</button>
        </section>
        <label><input id="agree" type="checkbox" /> 위 내용을 모두 확인했습니다.</label>
        <footer>
          <span>총 결제금액(세금포함)</span>
          <strong>1,000원</strong>
          <button id="pay" disabled>결제하기</button>
        </footer>
      </main>
    `);

    const snap = extractSnapshot();
    const address = findById(snap, 'id:address');
    const agree = findById(snap, 'id:agree');
    const pay = findById(snap, 'id:pay');

    expect(snap.textBlocks).toEqual(
      expect.arrayContaining([
        '신청 항목과 결제 금액을 확인해 주세요',
        '등기우편으로 의료영상 CD 받기',
        '총 결제금액(세금포함)',
        '1,000원',
      ]),
    );
    expect(address?.context).toContain('등기우편으로 의료영상 CD 받기');
    expect(agree?.label).toBe('위 내용을 모두 확인했습니다.');
    expect(agree?.checked).toBe(false);
    expect(pay?.disabled).toBe(true);
  });

  it('combines separate PIN digit blocks into a readable text block', () => {
    setHtml(`
      <main>
        <h1>PIN코드 6자리를 의사에게 알려주세요</h1>
        <p>의료 영상을 확인할 의사에게 하단 URL주소에 들어가서 PIN코드를 입력하도록 안내해주세요.</p>
        <div class="flex flex-wrap justify-center gap-1">
          <div>1</div>
          <div>8</div>
          <div>7</div>
          <div>0</div>
          <div>9</div>
          <div>8</div>
        </div>
      </main>
    `);

    const snap = extractSnapshot();

    expect(snap.textBlocks).toContain('PIN코드 6자리: 187098');
  });
});

describe('getRegion heuristics', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });

  it('falls back to position when no semantic ancestor', () => {
    // No <header>/<nav>/<main>; element rendered at bottom should classify as nav.
    setHtml(`<div><button id="btn-bottom">btn</button></div>`);
    const btn = document.querySelector<HTMLElement>('#btn-bottom')!;
    (btn as unknown as { __rect: DOMRect }).__rect = new DOMRect(0, 720, 100, 40);
    expect(getRegion(btn, window)).toBe('nav');
  });
});

describe('getGroupLabel', () => {
  it('falls back to nearest heading when no aria-label', () => {
    document.body.innerHTML = `
      <section>
        <h2>발급 메뉴</h2>
        <button id="x">CD 신청</button>
      </section>
    `;
    const btn = document.querySelector<HTMLElement>('#x')!;
    expect(getGroupLabel(btn)).toBe('발급 메뉴');
  });
});

function collectIds(snap: ReturnType<typeof extractSnapshot>): string[] {
  const out: string[] = [];
  for (const items of Object.values(snap.regions)) {
    for (const it of items ?? []) out.push(it.id);
  }
  return out;
}

function findById(snap: ReturnType<typeof extractSnapshot>, id: string) {
  for (const items of Object.values(snap.regions)) {
    for (const it of items ?? []) if (it.id === id) return it;
  }
  return undefined;
}

describe('getLabel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers aria-label over everything', () => {
    setHtml(`<main><button aria-label="닫기">X</button></main>`);
    const snap = extractSnapshot();
    const btn = Object.values(snap.regions).flat().find((e) => e.tag === 'button');
    expect(btn?.label).toBe('닫기');
  });

  it('falls back to title attribute when no text', () => {
    setHtml(`<main><button title="설정"></button></main>`);
    const snap = extractSnapshot();
    const btn = Object.values(snap.regions).flat().find((e) => e.tag === 'button');
    expect(btn?.label).toBe('설정');
  });

  it('extracts label from SVG <title> for icon-only button', () => {
    setHtml(`
      <main>
        <button>
          <svg><title>메뉴 열기</title></svg>
        </button>
      </main>
    `);
    const snap = extractSnapshot();
    const btn = Object.values(snap.regions).flat().find((e) => e.tag === 'button');
    expect(btn?.label).toBe('메뉴 열기');
  });

  it('extracts label from img alt for image button', () => {
    setHtml(`<main><button><img alt="프로필 사진" /></button></main>`);
    const snap = extractSnapshot();
    const btn = Object.values(snap.regions).flat().find((e) => e.tag === 'button');
    expect(btn?.label).toBe('프로필 사진');
  });

  it('falls back to previous sibling text', () => {
    setHtml(`
      <main>
        <span>날짜 선택</span><button id="date-btn"></button>
      </main>
    `);
    const snap = extractSnapshot();
    const btn = Object.values(snap.regions).flat().find((e) => e.id === 'id:date-btn');
    expect(btn?.label).toBe('날짜 선택');
  });

  it('uses aria-labelledby reference', () => {
    setHtml(`
      <main>
        <span id="lbl-search">검색</span>
        <input aria-labelledby="lbl-search" id="search" />
      </main>
    `);
    const snap = extractSnapshot();
    const input = Object.values(snap.regions).flat().find((e) => e.id === 'id:search');
    expect(input?.label).toBe('검색');
  });
});

describe('getRegion class hint', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 480, configurable: true });
  });

  it('classifies by class name when no semantic tag', () => {
    setHtml(`
      <div class="navbar">
        <button id="btn-nav">메뉴</button>
      </div>
    `);
    const snap = extractSnapshot();
    const btn = Object.values(snap.regions).flat().find((e) => e.id === 'id:btn-nav');
    expect(btn?.region).toBe('nav');
  });

  it('classifies header by class name', () => {
    setHtml(`
      <div class="site-header">
        <button id="btn-logo">로고</button>
      </div>
    `);
    const snap = extractSnapshot();
    const btn = Object.values(snap.regions).flat().find((e) => e.id === 'id:btn-logo');
    expect(btn?.region).toBe('header');
  });
});
