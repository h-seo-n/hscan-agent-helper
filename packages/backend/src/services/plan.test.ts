import { describe, it, expect } from 'vitest';
import type { DomSnapshot } from '@hscan/shared-types';
import { parsePlan } from './plan';

const snapshot: DomSnapshot = {
  url: 'http://localhost:5174/',
  title: 'DemoScan',
  capturedAt: 0,
  regions: {
    nav: [
      {
        id: 'tid:tab-images',
        tag: 'a',
        role: 'a',
        label: '내 영상 목록',
        selector: '[data-aiwa-id="tid:tab-images"]',
        region: 'nav',
        visibleNow: true,
      },
    ],
    main: [
      {
        id: 'id:card-cd',
        tag: 'button',
        role: 'button',
        label: '내 영상 CD로 배송 받기',
        selector: '[data-aiwa-id="id:card-cd"]',
        region: 'main',
        visibleNow: true,
      },
    ],
    header: [],
    footer: [],
    aside: [],
    unknown: [],
  },
};

describe('parsePlan', () => {
  it('accepts a valid plan', () => {
    const raw = JSON.stringify({
      steps: [
        {
          id: 's1',
          type: 'navigate',
          targetId: 'tid:tab-images',
          expectedUrlPattern: '/images',
          description: '이동합니다',
        },
      ],
      assistantMessage: '이동할게요',
      done: false,
    });
    const { plan } = parsePlan(raw, snapshot);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.type).toBe('navigate');
  });

  it('rejects unknown targetId', () => {
    const raw = JSON.stringify({
      steps: [{ id: 's1', type: 'highlight', targetId: 'id:does-not-exist', description: 'x' }],
      assistantMessage: 'x',
      done: true,
    });
    expect(() => parsePlan(raw, snapshot)).toThrowError(/unknown targetId/);
  });

  it('rejects unknown step type', () => {
    const raw = JSON.stringify({
      steps: [{ id: 's1', type: 'teleport', targetId: 'id:card-cd', description: 'no' }],
      assistantMessage: 'x',
      done: true,
    });
    expect(() => parsePlan(raw, snapshot)).toThrowError(/schema mismatch/);
  });

  it('rejects missing required field', () => {
    const raw = JSON.stringify({
      steps: [{ id: 's1', type: 'highlight', description: 'no targetId' }],
      assistantMessage: 'x',
      done: true,
    });
    expect(() => parsePlan(raw, snapshot)).toThrowError(/schema mismatch/);
  });

  it('truncates steps after first navigate and warns', () => {
    const raw = JSON.stringify({
      steps: [
        {
          id: 's1',
          type: 'navigate',
          targetId: 'tid:tab-images',
          description: '이동',
        },
        { id: 's2', type: 'highlight', targetId: 'id:card-cd', description: '잘못' },
      ],
      assistantMessage: '이동',
      done: false,
    });
    const { plan, warnings } = parsePlan(raw, snapshot);
    expect(plan.steps).toHaveLength(1);
    expect(warnings.some((w) => w.includes('truncated'))).toBe(true);
  });

  it('rejects malformed JSON', () => {
    expect(() => parsePlan('{not json', snapshot)).toThrowError(/invalid JSON/);
  });
  
  it('accepts multi-step plan: highlight + input + click', () => {
    const multiSnapshot: DomSnapshot = {
      url: 'http://localhost:5174/images',
      title: 'DemoScan - 영상 목록',
      capturedAt: 0,
      regions: {
        nav: [],
        header: [],
        footer: [],
        aside: [],
        unknown: [],
        main: [
          {
            id: 'search-input',
            tag: 'input',
            role: 'textbox',
            label: '병원명 또는 이름 검색',
            selector: '[data-aiwa-id="search-input"]',
            region: 'main',
            visibleNow: true,
          },
          {
            id: 'btn-download',
            tag: 'button',
            role: 'button',
            label: '다운로드',
            selector: '[data-aiwa-id="btn-download"]',
            region: 'main',
            visibleNow: true,
          },
        ],
      },
    };

    const raw = JSON.stringify({
      steps: [
        { id: 's1', type: 'highlight', targetId: 'search-input', description: '검색창' },
        { id: 's2', type: 'input', targetId: 'search-input', value: '', description: '이름 입력' },
        { id: 's3', type: 'highlight', targetId: 'btn-download', description: '다운로드 버튼' },
        { id: 's4', type: 'explain', description: '버튼을 눌러 다운로드하세요.' },
      ],
      assistantMessage: '영상 이름을 검색한 뒤 다운로드 버튼을 눌러 주세요.',
      done: true,
    });

    const { plan, warnings } = parsePlan(raw, multiSnapshot);
    expect(plan.steps).toHaveLength(4);
    expect(plan.steps[0]?.type).toBe('highlight');
    expect(plan.steps[1]?.type).toBe('input');
    expect(plan.steps[2]?.type).toBe('highlight');
    expect(plan.steps[3]?.type).toBe('explain');
    expect(plan.done).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it('truncates steps after navigate even in multi-step plan', () => {
    const raw = JSON.stringify({
      steps: [
        {
          id: 's1',
          type: 'navigate',
          targetId: 'tid:tab-images',
          description: '이동',
        },
        { id: 's2', type: 'highlight', targetId: 'id:card-cd', description: '하이라이트' },
        { id: 's3', type: 'explain', description: '설명' },
      ],
      assistantMessage: '이동할게요.',
      done: false,
    });

    const { plan, warnings } = parsePlan(raw, snapshot);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.type).toBe('navigate');
    expect(warnings.some((w) => w.includes('truncated'))).toBe(true);
  });
});
