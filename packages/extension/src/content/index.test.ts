import { beforeEach, describe, expect, it, vi } from 'vitest';

const hideHighlight = vi.fn();
const showHighlight = vi.fn();

vi.mock('./highlight', () => ({
  hideHighlight,
  showHighlight,
}));

describe('executeStep', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    hideHighlight.mockClear();
    showHighlight.mockClear();
    document.body.innerHTML = '';
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

  it('shows click feedback before clicking the target', async () => {
    vi.useFakeTimers();
    const button = document.createElement('button');
    button.setAttribute('data-aiwa-id', 'id:card-share');
    button.scrollIntoView = vi.fn();
    const click = vi.spyOn(button, 'click');
    document.body.appendChild(button);
    const { executeStep } = await import('./index');

    const result = executeStep({
      id: 's1',
      type: 'click',
      targetId: 'id:card-share',
      description: '의사에게 영상 보여주기 시작 위치',
    });

    expect(showHighlight).toHaveBeenCalledWith(button, '의사에게 영상 보여주기 시작 위치');
    expect(click).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(499);
    expect(click).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ status: 'done' });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('shows highlight feedback for scroll steps', async () => {
    const section = document.createElement('button');
    section.setAttribute('data-aiwa-id', 'id:target');
    section.scrollIntoView = vi.fn();
    document.body.appendChild(section);
    const { executeStep } = await import('./index');

    const result = await executeStep({
      id: 's1',
      type: 'scroll',
      targetId: 'id:target',
      description: '이 위치로 이동했습니다.',
    });

    expect(result).toEqual({ status: 'done' });
    expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(showHighlight).toHaveBeenCalledWith(section, '이 위치로 이동했습니다.');
  });
});
