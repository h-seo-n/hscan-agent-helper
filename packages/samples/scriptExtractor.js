// HScan 주요 페이지에서 DevTools 콘솔에 붙여 실행
(() => {
  const INTERACTIVE_SELECTOR = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="status"]',
    '[role="alert"]',
    '[data-aiwa-status]',
    '.cursor-pointer',
    '[contenteditable="true"]',
  ].join(',');

  const MAX_TEXT_BLOCKS = 40;
  const MAX_TEXT_BLOCK = 160;

  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width === 0 || r.height === 0) return false;
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    return true;
  };

  const getRect = (el) => {
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  };

  const isDisabled = (el) => {
    if (el.getAttribute?.('aria-disabled') === 'true') return true;
    return !!el.disabled;
  };

  const normalizeText = (value) => (value || '').replace(/\s+/g, ' ').trim();

  const getRegion = (el) => {
    let cur = el;
    while (cur && cur !== document.body) {
      const role = cur.getAttribute?.('role');
      const tag = cur.tagName?.toLowerCase();
      if (tag === 'header' || role === 'banner') return 'header';
      if (tag === 'nav' || role === 'navigation') return 'nav';
      if (tag === 'main' || role === 'main') return 'main';
      if (tag === 'aside' || role === 'complementary') return 'aside';
      if (tag === 'footer' || role === 'contentinfo') return 'footer';
      cur = cur.parentElement;
    }
    return 'unknown';
  };

  const getGroupLabel = (el) => {
    let cur = el.parentElement;
    while (cur && cur !== document.body) {
      const tag = cur.tagName?.toLowerCase();
      const role = cur.getAttribute?.('role');
      if (['nav', 'section', 'aside'].includes(tag) || ['menu', 'menubar', 'list'].includes(role)) {
        const label =
          cur.getAttribute('aria-label') ||
          cur.querySelector('h1,h2,h3,h4,legend,summary')?.innerText?.trim();
        if (label) return label.slice(0, 40);
      }
      cur = cur.parentElement;
    }
    return null;
  };

  const getLabel = (el) => {
    const aria = el.getAttribute?.('aria-label');
    if (aria) return aria.trim();
    const labelledBy = el.getAttribute?.('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.innerText?.trim())
        .filter(Boolean)
        .join(' ');
      if (text) return text.slice(0, 80);
    }
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl) return lbl.innerText.trim();
    }
    const ph = el.getAttribute?.('placeholder');
    if (ph) return ph.trim();
    const title = el.getAttribute?.('title');
    if (title) return title.trim().slice(0, 80);
    const txt = el.innerText?.trim();
    if (txt) return txt.slice(0, 80);
    return el.getAttribute?.('name') || '';
  };

  const getContext = (el) => {
    const own = normalizeText(el.innerText || el.textContent || '');
    let cur = el.parentElement;
    let fallback = '';
    while (cur && cur !== document.body) {
      const text = normalizeText(cur.innerText || cur.textContent || '');
      if (text && text !== own) {
        if (text.length <= 240) return text;
        if (!fallback) fallback = text.slice(0, 240);
      }
      cur = cur.parentElement;
    }
    return fallback || null;
  };

  const getFilled = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return el.value.trim().length > 0;
    if (tag !== 'input') return undefined;
    if (['checkbox', 'radio', 'button', 'submit', 'reset'].includes(el.type)) return undefined;
    return el.value.trim().length > 0;
  };

  const isVisibleTextParent = (el) => {
    const tag = el.tagName?.toLowerCase();
    if (['script', 'style', 'noscript'].includes(tag)) return false;
    if (el.getAttribute?.('aria-hidden') === 'true') return false;
    return isVisible(el);
  };

  const getTextBlocks = () => {
    const blocks = [];
    const seen = new Set();
    const addBlock = (value) => {
      const text = normalizeText(value).slice(0, MAX_TEXT_BLOCK);
      if (text && !seen.has(text)) {
        seen.add(text);
        blocks.push(text);
      }
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = normalizeText(node.textContent || '');
        if (text.length < 2) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || !isVisibleTextParent(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node = walker.nextNode();
    while (node && blocks.length < MAX_TEXT_BLOCKS) {
      addBlock(node.textContent || '');
      node = walker.nextNode();
    }
    for (const pinBlock of getPinCodeTextBlocks()) {
      if (blocks.length >= MAX_TEXT_BLOCKS) break;
      addBlock(pinBlock);
    }
    return blocks;
  };

  const hasSeparateDigitChildren = (el) => {
    const digitChildren = Array.from(el.children).filter((child) =>
      /^\d$/.test(normalizeText(child.textContent || '')),
    );
    return digitChildren.length >= 6;
  };

  const hasPinContext = (el) => {
    let cur = el;
    while (cur && cur !== document.body) {
      const text = normalizeText(cur.textContent || '');
      if (/pin\s*코드|핀\s*코드|PIN\s*code/i.test(text)) return true;
      cur = cur.parentElement;
    }
    return /pin\s*코드|핀\s*코드|PIN\s*code/i.test(normalizeText(document.body?.textContent || ''));
  };

  const getPinCodeTextBlocks = () => {
    const out = [];
    for (const el of Array.from(document.querySelectorAll('div,section,article'))) {
      if (!isVisibleTextParent(el)) continue;
      if (!hasPinContext(el)) continue;

      const digits = normalizeText(el.textContent || '').replace(/\s+/g, '');
      if (!/^\d{6}$/.test(digits)) continue;
      if (!hasSeparateDigitChildren(el)) continue;

      out.push(`PIN코드 6자리: ${digits}`);
    }
    return Array.from(new Set(out));
  };

  const elements = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR))
    .filter((el) => el.type !== 'password' && isVisible(el))
    .map((el, i) => {
      const tag = el.tagName.toLowerCase();
      const filled = getFilled(el);
      return {
        idx: i,
        tag,
        role: el.getAttribute('role') || tag,
        label: getLabel(el),
        region: getRegion(el),
        groupLabel: getGroupLabel(el),
        href: el.getAttribute('href') || null,
        status: el.getAttribute('data-aiwa-status') || null,
        context: getContext(el),
        disabled: isDisabled(el),
        checked: ['checkbox', 'radio'].includes(el.type) ? !!el.checked : undefined,
        filled,
        hasId: !!el.id,
        hasTestid: !!el.getAttribute('data-testid'),
        classes: (el.className || '').toString().slice(0, 80),
        rect: getRect(el),
      };
    });

  const grouped = elements.reduce((acc, e) => {
    (acc[e.region] ||= []).push(e);
    return acc;
  }, {});

  const result = {
    url: location.href,
    title: document.title,
    capturedAt: Date.now(),
    textBlocks: getTextBlocks(),
    summary: {
      total: elements.length,
      byRegion: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length])),
    },
    regions: grouped,
  };

  console.log(JSON.stringify(result, null, 2));
  copy(JSON.stringify(result, null, 2));
  console.log('✅ Copied to clipboard');
})();
