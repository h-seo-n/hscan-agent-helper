import { beforeEach, describe, expect, it } from 'vitest';
import { hideHighlight, showHighlight } from './highlight';

describe('highlight overlay', () => {
  beforeEach(() => {
    hideHighlight();
    document.documentElement.querySelector('#aiwa-overlay-host')?.remove();
    document.body.innerHTML = '';
  });

  it('hides after the highlighted target is clicked', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);

    showHighlight(button, '여기를 누르세요.');
    const shadow = getOverlayShadow();
    expect(shadow.querySelector<HTMLElement>('.box')?.style.display).toBe('block');

    button.click();

    expect(shadow.querySelector<HTMLElement>('.box')?.style.display).toBe('none');
    expect(shadow.querySelector<HTMLElement>('.caption')?.style.display).toBe('none');
  });

  it('places the tooltip above the target near the bottom when side space is limited', () => {
    setViewport(1024, 300);
    const button = document.createElement('button');
    mockRect(button, { top: 260, left: 60, width: 900, height: 30 });
    document.body.appendChild(button);

    showHighlight(button, '아래쪽 카드');

    const caption = getCaption();
    expect(Number.parseFloat(caption.style.top)).toBeLessThan(260);
    expect(caption.style.left).toBe('60px');
  });

  it('places the tooltip beside the target when side space is better than vertical space', () => {
    setViewport(500, 300);
    const button = document.createElement('button');
    mockRect(button, { top: 260, left: 20, width: 70, height: 30 });
    document.body.appendChild(button);

    showHighlight(button, '오른쪽 설명');

    const caption = getCaption();
    expect(caption.style.left).toBe('98px');
    expect(Number.parseFloat(caption.style.top)).toBeGreaterThanOrEqual(8);
    expect(Number.parseFloat(caption.style.top)).toBeLessThan(290);
  });
});

function getOverlayShadow(): ShadowRoot {
  const host = document.documentElement.querySelector<HTMLElement>('#aiwa-overlay-host');
  if (!host?.shadowRoot) throw new Error('overlay shadow root missing');
  return host.shadowRoot;
}

function getCaption(): HTMLElement {
  const caption = getOverlayShadow().querySelector<HTMLElement>('.caption');
  if (!caption) throw new Error('overlay caption missing');
  return caption;
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function mockRect(el: Element, rect: { top: number; left: number; width: number; height: number }) {
  const value = {
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => undefined,
  } as DOMRect;
  el.getBoundingClientRect = () => value;
}
