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
});

function getOverlayShadow(): ShadowRoot {
  const host = document.documentElement.querySelector<HTMLElement>('#aiwa-overlay-host');
  if (!host?.shadowRoot) throw new Error('overlay shadow root missing');
  return host.shadowRoot;
}
