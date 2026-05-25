import { beforeEach, describe, expect, it, vi } from 'vitest';

const hideHighlight = vi.fn();
const showHighlight = vi.fn();

vi.mock('./highlight', () => ({
  hideHighlight,
  showHighlight,
}));

describe('executeStep', () => {
  beforeEach(() => {
    vi.resetModules();
    hideHighlight.mockClear();
    showHighlight.mockClear();
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(() => Promise.resolve()),
        onMessage: { addListener: vi.fn() },
      },
    } as unknown as typeof chrome;
  });

  it('keeps the current highlight visible while an explain step is processed', async () => {
    const { executeStep } = await import('./index');

    const result = await executeStep({
      id: 's2',
      type: 'explain',
      description: '여기서 내 영상을 확인하세요.',
    });

    expect(result).toEqual({ status: 'done' });
    expect(hideHighlight).not.toHaveBeenCalled();
  });

  it('resolves a snapshot target id to the highlighted element', async () => {
    document.body.innerHTML = '<button data-aiwa-id="id:card-receive">내 영상 병원에서 받기</button>';
    const target = document.querySelector('button');
    if (!target) throw new Error('target missing');
    target.scrollIntoView = vi.fn();
    const { executeStep } = await import('./index');

    const result = await executeStep({
      id: 's1',
      type: 'highlight',
      targetId: 'id:card-receive',
      description: '병원 영상 받기 시작 위치',
    });

    expect(result).toEqual({ status: 'done' });
    expect(showHighlight).toHaveBeenCalledWith(target, '병원 영상 받기 시작 위치');
  });
});
