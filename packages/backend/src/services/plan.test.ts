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
});
