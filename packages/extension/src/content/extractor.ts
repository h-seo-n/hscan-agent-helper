import type { DomSnapshot, InteractiveElement, RegionName } from '@hscan/shared-types';

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

const ID_ATTR = 'data-aiwa-id';
const MAX_LABEL = 80;
const MAX_CONTEXT = 240;
const MAX_TEXT_BLOCK = 160;
const MAX_TEXT_BLOCKS = 40;

export interface ExtractOptions {
  doc?: Document;
  win?: Window;
}

export function extractSnapshot(opts: ExtractOptions = {}): DomSnapshot {
  const doc = opts.doc ?? document;
  const win = opts.win ?? (doc.defaultView as Window);

  const elements = Array.from(doc.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR));
  const items: InteractiveElement[] = [];
  let counter = 0;

  for (const el of elements) {
    if (!isCandidate(el, win)) continue;
    const id = ensureId(el, counter++);
    items.push(buildElement(el, id, doc, win));
  }

  const regions = items.reduce<Record<RegionName, InteractiveElement[]>>(
    (acc, item) => {
      (acc[item.region] ??= []).push(item);
      return acc;
    },
    {} as Record<RegionName, InteractiveElement[]>,
  );

  return {
    url: win.location.href,
    title: doc.title,
    capturedAt: Date.now(),
    textBlocks: extractTextBlocks(doc, win),
    regions,
  };
}

function isCandidate(el: HTMLElement, win: Window): boolean {
  if ((el as HTMLInputElement).type === 'password') return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  const style = win.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;

  // Drop elements far outside any reasonable scrollable area.
  const farLeft = rect.right < -2000;
  const farRight = rect.left > (win.innerWidth ?? 0) + 5000;
  const farTop = rect.bottom < -2000;
  const farBottom = rect.top > (win.innerHeight ?? 0) + 5000;
  if (farLeft || farRight || farTop || farBottom) return false;

  return true;
}

function ensureId(el: HTMLElement, fallbackIdx: number): string {
  const existing = el.getAttribute(ID_ATTR);
  if (existing) return existing;

  const candidates = [
    el.id ? `id:${el.id}` : null,
    el.getAttribute('data-testid') ? `tid:${el.getAttribute('data-testid')}` : null,
    el.getAttribute('name') ? `n:${el.getAttribute('name')}` : null,
  ].filter(Boolean) as string[];

  const chosen = candidates[0] ?? `auto:${pathHash(el)}-${fallbackIdx}`;
  el.setAttribute(ID_ATTR, chosen);
  return chosen;
}

function pathHash(el: HTMLElement): string {
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  let depth = 0;
  while (cur && depth < 6) {
    const node: HTMLElement = cur;
    const tag = node.tagName.toLowerCase();
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const idx = Array.from(parent.children).indexOf(node);
    parts.unshift(`${tag}${idx}`);
    cur = parent;
    depth++;
  }
  return djb2(parts.join('>')).toString(36);
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function buildElement(
  el: HTMLElement,
  id: string,
  doc: Document,
  win: Window,
): InteractiveElement {
  const rect = el.getBoundingClientRect();
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role') || tag;
  const label = getLabel(el, doc);
  const region = getRegion(el, win);
  const groupLabel = getGroupLabel(el);
  const visibleNow = isInViewport(rect, win);
  const href = el.getAttribute('href') ?? undefined;
  const status = el.getAttribute('data-aiwa-status') ?? undefined;
  const disabled = isDisabled(el);
  const context = getContext(el);
  const input = tag === 'input' ? (el as HTMLInputElement) : null;
  const textarea = tag === 'textarea' ? (el as HTMLTextAreaElement) : null;
  const checked =
    input && ['checkbox', 'radio'].includes(input.type) ? input.checked : undefined;
  const filled =
    input && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(input.type)
      ? input.value.trim().length > 0
      : textarea
        ? textarea.value.trim().length > 0
        : undefined;

  const elem: InteractiveElement = {
    id,
    tag,
    role,
    label,
    selector: `[${ID_ATTR}="${cssEscape(id)}"]`,
    region,
    visibleNow,
    boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  };
  if (groupLabel) elem.groupLabel = groupLabel;
  if (href) elem.href = href;
  if (status) elem.status = status;
  if (context) elem.context = context;
  if (disabled) elem.disabled = true;
  if (filled !== undefined) elem.filled = filled;
  if (checked !== undefined) elem.checked = checked;
  return elem;
}

function isDisabled(el: HTMLElement): boolean {
  if (el.getAttribute('aria-disabled') === 'true') return true;
  if ('disabled' in el) return Boolean((el as HTMLButtonElement).disabled);
  return false;
}

function getLabel(el: HTMLElement, doc: Document): string {
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return aria.trim().slice(0, MAX_LABEL);

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ref = doc.getElementById(labelledBy);
    const t = ref?.textContent?.trim();
    if (t) return t.slice(0, MAX_LABEL);
  }

  if (el.id) {
    const lbl = doc.querySelector<HTMLElement>(`label[for="${cssEscape(el.id)}"]`);
    const txt = lbl?.textContent?.trim();
    if (txt) return txt.slice(0, MAX_LABEL);
  }

  const placeholder = el.getAttribute('placeholder');
  if (placeholder?.trim()) return placeholder.trim().slice(0, MAX_LABEL);

  const title = el.getAttribute('title');
  if (title?.trim()) return title.trim().slice(0, MAX_LABEL);

  const text = el.textContent?.replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, MAX_LABEL);

  /*const text = (el as HTMLElement).textContent?.replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, MAX_LABEL);*/
  const svgTitle = el.querySelector<SVGTitleElement>('svg title');
  if (svgTitle?.textContent?.trim()) return svgTitle.textContent.trim().slice(0, MAX_LABEL);

  const img = el.querySelector<HTMLImageElement>('img[alt]');
  if (img?.alt?.trim()) return img.alt.trim().slice(0, MAX_LABEL);

  const prev = el.previousElementSibling;
  const prevText = prev?.textContent?.replace(/\s+/g, ' ').trim();
  if (prevText) return prevText.slice(0, MAX_LABEL);

  const parentDirectText = Array.from(el.parentElement?.childNodes ?? [])
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent?.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  if (parentDirectText) return parentDirectText.slice(0, MAX_LABEL);

  const svg = el.querySelector('svg');
  if (svg) {
    const cls = (svg.getAttribute('class') ?? '').replace(/[-_]/g, ' ').trim();
    if (cls) return cls.slice(0, MAX_LABEL);
  }

  const name = el.getAttribute('name');
  return name?.trim() ?? '';

}

const SEMANTIC_REGION: Record<string, RegionName> = {
  header: 'header',
  banner: 'header',
  nav: 'nav',
  navigation: 'nav',
  main: 'main',
  aside: 'aside',
  complementary: 'aside',
  footer: 'footer',
  contentinfo: 'footer',
};

export function getRegion(el: HTMLElement, win: Window): RegionName {
  let cur: HTMLElement | null = el;
  while (cur && cur !== cur.ownerDocument.body) {
    const tag = cur.tagName.toLowerCase();
    const role = cur.getAttribute('role');
    if (SEMANTIC_REGION[tag]) return SEMANTIC_REGION[tag] as RegionName;
    if (role && SEMANTIC_REGION[role]) return SEMANTIC_REGION[role] as RegionName;
    cur = cur.parentElement;
  }

  const CLASS_HINTS: Array<[RegExp, RegionName]> = [
    [/\b(header|top-?bar|site-?header|gnb)\b/i, 'header'],
    [/\b(nav|navbar|navigation|tab-?bar|bottom-?bar|side-?bar|sidebar)\b/i, 'nav'],
    [/\b(footer|site-?footer|bottom)\b/i, 'footer'],
    [/\b(aside|side-?panel|drawer)\b/i, 'aside'],
  ];

  let cur3: HTMLElement | null = el;
  while (cur3 && cur3 !== cur3.ownerDocument.body) {
    const cls = cur3.className ?? '';
    for (const [pattern, region] of CLASS_HINTS) {
      if (pattern.test(cls)) return region;
    }
    cur3 = cur3.parentElement;
  }

  

  // Heuristic fallback based on position.
  const rect = el.getBoundingClientRect();
  const vh = win.innerHeight || 800;
  const vw = win.innerWidth || 480;

  const cur2 = nearestPositioned(el, win);
  if (cur2) {
    const pos = win.getComputedStyle(cur2).position;
    const r = cur2.getBoundingClientRect();
    if (pos === 'fixed' || pos === 'sticky') {
      if (r.top <= vh * 0.15) return 'header';
      if (r.bottom >= vh * 0.85) return 'nav';
      if (r.left <= vw * 0.15 || r.right >= vw * 0.85) return 'aside';
    }
  }

  // Top sliver of the page → header. Bottom sliver → nav (mobile-tabbar pattern).
  if (rect.top <= vh * 0.1) return 'header';
  if (rect.top >= vh * 0.85) return 'nav';
  return 'main';
}

function nearestPositioned(el: HTMLElement, win: Window): HTMLElement | null {
  let cur: HTMLElement | null = el;
  while (cur && cur !== cur.ownerDocument.body) {
    const pos = win.getComputedStyle(cur).position;
    if (pos === 'fixed' || pos === 'sticky' || pos === 'absolute') return cur;
    cur = cur.parentElement;
  }
  return null;
}

const GROUP_TAGS = new Set(['nav', 'section', 'aside', 'ul', 'ol', 'menu']);
const GROUP_ROLES = new Set(['menu', 'menubar', 'list', 'toolbar', 'tablist', 'navigation']);

export function getGroupLabel(el: HTMLElement): string | undefined {
  let cur: HTMLElement | null = el.parentElement;
  while (cur && cur !== cur.ownerDocument.body) {
    const tag = cur.tagName.toLowerCase();
    const role = cur.getAttribute('role') ?? '';
    if (GROUP_TAGS.has(tag) || GROUP_ROLES.has(role)) {
      const aria = cur.getAttribute('aria-label');
      if (aria?.trim()) return aria.trim().slice(0, 40);
      const labelledBy = cur.getAttribute('aria-labelledby');
      if (labelledBy) {
        const ref = cur.ownerDocument.getElementById(labelledBy);
        const t = ref?.textContent?.trim();
        if (t) return t.slice(0, 40);
      }
      const heading = cur.querySelector<HTMLElement>('h1,h2,h3,h4,legend,summary');
      const t = heading?.textContent?.trim();
      if (t) return t.slice(0, 40);
    }
    cur = cur.parentElement;
  }
  return undefined;
}

function isInViewport(rect: DOMRect, win: Window): boolean {
  const vh = win.innerHeight || 0;
  const vw = win.innerWidth || 0;
  return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
}

function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  return s.replace(/["\\]/g, '\\$&');
}

function getContext(el: HTMLElement): string | undefined {
  const own = normalizeText(el.textContent ?? '');
  let fallback = '';
  let cur = el.parentElement;

  while (cur && cur !== cur.ownerDocument.body) {
    const text = normalizeText(cur.textContent ?? '');
    if (text && text !== own) {
      if (text.length <= MAX_CONTEXT) return text;
      if (!fallback) fallback = text.slice(0, MAX_CONTEXT);
    }
    cur = cur.parentElement;
  }

  return fallback || undefined;
}

function extractTextBlocks(doc: Document, win: Window): string[] {
  const root = doc.body;
  if (!root) return [];

  const blocks: string[] = [];
  const seen = new Set<string>();
  const addBlock = (value: string) => {
    const text = normalizeText(value).slice(0, MAX_TEXT_BLOCK);
    if (text && !seen.has(text)) {
      seen.add(text);
      blocks.push(text);
    }
  };
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = normalizeText(node.textContent ?? '');
      if (text.length < 2) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || !isVisibleTextParent(parent, win)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node = walker.nextNode();
  while (node && blocks.length < MAX_TEXT_BLOCKS) {
    addBlock(node.textContent ?? '');
    node = walker.nextNode();
  }

  for (const pinBlock of extractPinCodeTextBlocks(doc, win)) {
    if (blocks.length >= MAX_TEXT_BLOCKS) break;
    addBlock(pinBlock);
  }

  return blocks;
}

function extractPinCodeTextBlocks(doc: Document, win: Window): string[] {
  const out: string[] = [];
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>('div,section,article'));
  for (const el of candidates) {
    if (!isVisibleTextParent(el, win)) continue;
    if (!hasPinContext(el)) continue;

    const digits = normalizeText(el.textContent ?? '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(digits)) continue;
    if (!hasSeparateDigitChildren(el)) continue;

    out.push(`PIN코드 6자리: ${digits}`);
  }
  return Array.from(new Set(out));
}

function hasSeparateDigitChildren(el: HTMLElement): boolean {
  const digitChildren = Array.from(el.children).filter((child) =>
    /^\d$/.test(normalizeText(child.textContent ?? '')),
  );
  return digitChildren.length >= 6;
}

function hasPinContext(el: HTMLElement): boolean {
  let cur: HTMLElement | null = el;
  while (cur && cur !== cur.ownerDocument.body) {
    const text = normalizeText(cur.textContent ?? '');
    if (/pin\s*코드|핀\s*코드|PIN\s*code/i.test(text)) return true;
    cur = cur.parentElement;
  }
  const bodyText = normalizeText(el.ownerDocument.body?.textContent ?? '');
  return /pin\s*코드|핀\s*코드|PIN\s*code/i.test(bodyText);
}

function isVisibleTextParent(el: HTMLElement, win: Window): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'noscript') return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;

  const style = win.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  return rect.bottom > -200 && rect.right > -200 && rect.top < (win.innerHeight || 0) + 2000;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Strip noisy fields so the snapshot we send to the LLM is small. */
export function snapshotForLlm(snapshot: DomSnapshot): DomSnapshot {
  const stripped: DomSnapshot = {
    url: snapshot.url,
    title: snapshot.title,
    capturedAt: snapshot.capturedAt,
    ...(snapshot.textBlocks ? { textBlocks: snapshot.textBlocks } : {}),
    regions: {} as Record<RegionName, InteractiveElement[]>,
  };
  for (const [region, items] of Object.entries(snapshot.regions) as [
    RegionName,
    InteractiveElement[],
  ][]) {
    stripped.regions[region] = items.map((it) => {
      const out: InteractiveElement = {
        id: it.id,
        tag: it.tag,
        role: it.role,
        label: it.label,
        selector: it.selector,
        region: it.region,
        visibleNow: it.visibleNow,
      };
      if (it.groupLabel) out.groupLabel = it.groupLabel;
      if (it.href) out.href = it.href;
      if (it.status) out.status = it.status;
      if (it.context) out.context = it.context;
      if (it.disabled !== undefined) out.disabled = it.disabled;
      if (it.filled !== undefined) out.filled = it.filled;
      if (it.checked !== undefined) out.checked = it.checked;
      return out;
    });
  }
  return stripped;
}
