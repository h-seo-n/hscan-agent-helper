// HScan 주요 페이지에서 DevTools 콘솔에 붙여 실행
(() => {
  const INTERACTIVE_SELECTOR = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[contenteditable="true"]',
  ].join(',');

  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width === 0 || r.height === 0) return false;
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    return true;
  };

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
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl) return lbl.innerText.trim();
    }
    const ph = el.getAttribute?.('placeholder');
    if (ph) return ph.trim();
    const txt = el.innerText?.trim();
    if (txt) return txt.slice(0, 80);
    return el.getAttribute?.('name') || '';
  };

  const elements = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR))
    .filter((el) => el.type !== 'password' && !el.disabled && isVisible(el))
    .map((el, i) => ({
      idx: i,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      label: getLabel(el),
      region: getRegion(el),
      groupLabel: getGroupLabel(el),
      href: el.getAttribute('href') || null,
      hasId: !!el.id,
      hasTestid: !!el.getAttribute('data-testid'),
      classes: (el.className || '').toString().slice(0, 60),
      rect: getRect(el),

    }));

  const grouped = elements.reduce((acc, e) => {
    (acc[e.region] ||= []).push(e);
    return acc;
  }, {});

  const result = {
    url: location.href,
    title: document.title,
    capturedAt: Date.now(),
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
