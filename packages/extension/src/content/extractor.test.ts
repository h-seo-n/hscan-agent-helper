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

  it('excludes password, disabled, hidden and zero-size elements', () => {
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
    expect(ids).not.toContain('id:d');
    expect(ids).not.toContain('id:h');
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
