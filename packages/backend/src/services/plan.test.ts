import { describe, it, expect } from 'vitest';
import type { DomSnapshot, InteractiveElement, PlanContext, RegionName } from '@hscan/shared-types';
import { deterministicPlan, fallbackPlan, parsePlan } from './plan';

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

describe('fallbackPlan', () => {
  it('highlights the receive card for a Korean receive request when it is visible', () => {
    const receiveSnapshot: DomSnapshot = {
      ...snapshot,
      regions: {
        ...snapshot.regions,
        main: [
          {
            id: 'id:card-receive',
            tag: 'button',
            role: 'button',
            label: '내 영상 병원에서 받기',
            selector: '[data-aiwa-id="id:card-receive"]',
            region: 'main',
            visibleNow: true,
          },
        ],
      },
    };

    const result = fallbackPlan({
      sessionId: 's1',
      originalUserMessage: '내 영상 받고 싶어',
      history: [],
      snapshot: receiveSnapshot,
      executedSteps: [],
    });

    expect(result.plan.steps[0]).toMatchObject({
      type: 'highlight',
      targetId: 'id:card-receive',
    });
    expect(result.plan.done).toBe(true);
  });
});

describe('deterministicPlan', () => {
  it.each([
    ['홈으로 가줘', 'tid:tab-home'],
    ['영상목록으로 가줘', 'tid:tab-images'],
    ['내정보로 가줘', 'tid:tab-my'],
  ])('clicks navigation tabs: %s', (message, targetId) => {
    const result = deterministicPlan(makeContext(message, homeSnapshot()));

    expect(result?.plan.steps[0]).toMatchObject({
      type: 'click',
      targetId,
    });
    expect(result?.plan.done).toBe(true);
  });

  it.each([
    ['내 영상 의사에게 보여주고 싶어', 'id:card-share'],
    ['내 영상 받고 싶어', 'id:card-receive'],
    ['내 영상 병원으로 보내고 싶어', 'id:card-send'],
    ['고객센터 어디야', 'link-cs'],
  ])('matches home scenario: %s', (message, targetId) => {
    const result = deterministicPlan(makeContext(message, homeSnapshot()));

    expect(result?.plan.steps[0]).toMatchObject({
      type: 'highlight',
      targetId,
    });
    expect(result?.plan.done).toBe(true);
  });

  it.each([
    ['영상 다운로드 하고 싶어', 'btn-download'],
    ['영상 삭제하고 싶어', 'btn-delete'],
    ['의사에게 공유하고 싶어', 'btn-share'],
    ['병원으로 전달하고 싶어', 'btn-transfer'],
    ['영상 검색하고 싶어', 'search-input'],
    ['영상 올리고 싶어', 'btn-upload'],
  ])('matches images page scenario: %s', (message, targetId) => {
    const result = deterministicPlan(makeContext(message, imagesSnapshot()));

    expect(result?.plan.steps[0]).toMatchObject({
      type: 'highlight',
      targetId,
    });
    expect(result?.plan.done).toBe(true);
  });

  it('navigates to images page before handling image-only actions from home', () => {
    const result = deterministicPlan(makeContext('영상 다운로드 하고 싶어', homeSnapshot()));

    expect(result?.plan.steps[0]).toMatchObject({
      type: 'navigate',
      targetId: 'tid:tab-images',
      expectedUrlPattern: '/images',
    });
    expect(result?.plan.done).toBe(false);
  });

  it('navigates to images page before handling named image actions from home', () => {
    const result = deterministicPlan(makeContext('무릎 영상 다운로드해줘', homeSnapshot()));

    expect(result?.plan.steps[0]).toMatchObject({
      type: 'navigate',
      targetId: 'tid:tab-images',
      expectedUrlPattern: '/images',
    });
    expect(result?.plan.done).toBe(false);
  });

  it.each([
    ['무릎 영상 다운로드해줘', 'chk-knee', 'btn-download'],
    ['무를 영상 다운로드해줘', 'chk-knee', 'btn-download'],
    ['Chest 병원으로 보내줘', 'chk-chest', 'btn-transfer'],
    ['뇌 영상 삭제해줘', 'chk-brain', 'btn-delete'],
    ['Spine 의사에게 보내줘', 'chk-spine', 'btn-share'],
  ])('selects a named image before clicking the requested action: %s', (message, checkboxId, actionId) => {
    const result = deterministicPlan(makeContext(message, imagesSnapshot()));

    expect(result?.plan.steps).toEqual([
      expect.objectContaining({
        type: 'click',
        targetId: checkboxId,
      }),
      expect.objectContaining({
        type: 'click',
        targetId: actionId,
      }),
    ]);
    expect(result?.plan.done).toBe(true);
  });

  it('unchecks previously selected images before acting on the requested image', () => {
    const result = deterministicPlan(
      makeContext('Chest 병원으로 보내줘', imagesSnapshot(['chk-brain'])),
    );

    expect(result?.plan.steps).toEqual([
      expect.objectContaining({
        type: 'click',
        targetId: 'chk-brain',
      }),
      expect.objectContaining({
        type: 'click',
        targetId: 'chk-chest',
      }),
      expect.objectContaining({
        type: 'click',
        targetId: 'btn-transfer',
      }),
    ]);
  });

  it('keeps the requested image selected and unchecks the others when it is already selected', () => {
    const result = deterministicPlan(
      makeContext('Chest 병원으로 보내줘', imagesSnapshot(['chk-brain', 'chk-chest'])),
    );

    expect(result?.plan.steps).toEqual([
      expect.objectContaining({
        type: 'click',
        targetId: 'chk-brain',
      }),
      expect.objectContaining({
        type: 'click',
        targetId: 'btn-transfer',
      }),
    ]);
  });

  it('navigates to the CD request page from the home CD card', () => {
    const result = deterministicPlan(makeContext('CD 신청하고 싶어', homeSnapshot()));

    expect(result?.plan.steps[0]).toMatchObject({
      type: 'navigate',
      targetId: 'id:card-cd',
      expectedUrlPattern: '/cd-request',
    });
    expect(result?.plan.done).toBe(false);
  });

  it('treats "CD로 받고 싶어" as a CD request, not hospital receive', () => {
    const result = deterministicPlan(makeContext('내 영상 cd로 받고 싶어', homeSnapshot()));

    expect(result?.plan.steps[0]).toMatchObject({
      type: 'navigate',
      targetId: 'id:card-cd',
      expectedUrlPattern: '/cd-request',
    });
    expect(result?.plan.done).toBe(false);
  });

  it('highlights the first CD request input after arriving on the CD request page', () => {
    const result = deterministicPlan(makeContext('CD 신청하고 싶어', cdRequestSnapshot()));

    expect(result?.plan.steps[0]).toMatchObject({
      type: 'input',
      targetId: 'cd-recipient',
      description: '먼저 수령인 이름을 입력하세요.',
    });
    expect(result?.plan.done).toBe(true);
  });

  it.each([
    ['내 영상 의사에게 보여주기 클릭해줘', 'id:card-share'],
    ['첫 번째 카드 눌러줘', 'id:card-share'],
    ['고객센터 클릭해줘', 'link-cs'],
  ])('creates click steps for explicit click requests: %s', (message, targetId) => {
    const result = deterministicPlan(makeContext(message, homeSnapshot()));

    expect(result?.plan.steps[0]).toMatchObject({
      type: 'click',
      targetId,
    });
    expect(result?.plan.done).toBe(true);
  });

  it('creates a scroll step for explicit scroll requests', () => {
    const result = deterministicPlan(
      makeContext('내 영상 병원으로 보내기 위치로 스크롤해줘', homeSnapshot()),
    );

    expect(result?.plan.steps[0]).toMatchObject({
      type: 'scroll',
      targetId: 'id:card-send',
    });
    expect(result?.plan.done).toBe(true);
  });
});

function makeContext(message: string, domSnapshot: DomSnapshot): PlanContext {
  return {
    sessionId: 's1',
    originalUserMessage: message,
    history: [
      {
        id: 'm1',
        role: 'user',
        content: message,
        createdAt: 0,
      },
    ],
    snapshot: domSnapshot,
    executedSteps: [],
  };
}

function homeSnapshot(): DomSnapshot {
  return {
    ...snapshot,
    regions: {
      ...snapshot.regions,
      nav: [
        {
          id: 'tid:tab-home',
          tag: 'a',
          role: 'a',
          label: '홈',
          selector: '[data-aiwa-id="tid:tab-home"]',
          region: 'nav',
          visibleNow: true,
        },
        {
          id: 'tid:tab-images',
          tag: 'a',
          role: 'a',
          label: '내 영상 목록',
          selector: '[data-aiwa-id="tid:tab-images"]',
          region: 'nav',
          visibleNow: true,
        },
        {
          id: 'tid:tab-my',
          tag: 'a',
          role: 'a',
          label: '내 정보',
          selector: '[data-aiwa-id="tid:tab-my"]',
          region: 'nav',
          visibleNow: true,
        },
      ],
      main: [
        homeElement('id:card-share', '내 영상 의사에게 보여주기 담당 의사에게 영상 링크를 공유합니다.'),
        homeElement('id:card-cd', '내 영상 CD로 배송 받기 CD를 신청하고 우편으로 받아봅니다.'),
        homeElement('id:card-receive', '내 영상 병원에서 받기 진료받은 병원의 영상을 내 계정으로 가져옵니다.'),
        homeElement('id:card-send', '내 영상 병원으로 보내기 다른 병원의 진료실로 영상을 전달합니다.'),
      ],
      footer: [
        homeElement('link-cd-guide', 'CD 발급 가이드', 'footer', 'a'),
        homeElement('link-data-guide', '자료 받기 안내', 'footer', 'a'),
        homeElement('link-cs', '고객센터', 'footer', 'a'),
      ],
    },
  };
}

function imagesSnapshot(checkedIds: string[] = []): DomSnapshot {
  return {
    ...snapshot,
    url: 'http://localhost:5174/images',
    regions: {
      ...snapshot.regions,
      main: [
        homeElement('search-input', '병원명 또는 이름 검색', 'main', 'input'),
        homeElement('chk-knee', 'Knee (R) 선택', 'main', 'input', checkedIds.includes('chk-knee')),
        homeElement('chk-chest', 'Chest 선택', 'main', 'input', checkedIds.includes('chk-chest')),
        homeElement('chk-brain', 'Brain 선택', 'main', 'input', checkedIds.includes('chk-brain')),
        homeElement('chk-spine', 'Spine 선택', 'main', 'input', checkedIds.includes('chk-spine')),
        homeElement('btn-upload', '영상 올리기'),
        homeElement('btn-share', '의사공유'),
        homeElement('btn-transfer', '병원전달'),
        homeElement('btn-cd', 'CD신청'),
        homeElement('btn-download', '다운로드'),
        homeElement('btn-delete', '삭제'),
      ],
    },
  };
}

function cdRequestSnapshot(): DomSnapshot {
  return {
    ...snapshot,
    url: 'http://localhost:5174/cd-request',
    regions: {
      ...snapshot.regions,
      main: [
        homeElement('cd-recipient', '수령인 이름', 'main', 'input'),
        homeElement('cd-phone', '연락처', 'main', 'input'),
        homeElement('cd-address', '배송 주소', 'main', 'input'),
        homeElement('btn-cd-submit', '확인'),
      ],
    },
  };
}

function homeElement(
  id: string,
  label: string,
  region: RegionName = 'main',
  tag = 'button',
  checked?: boolean,
): InteractiveElement {
  const element: InteractiveElement = {
    id,
    tag,
    role: tag,
    label,
    selector: `[data-aiwa-id="${id}"]`,
    region,
    visibleNow: true,
  };
  if (checked !== undefined) element.checked = checked;
  return element;
}
