const HOST_ID = 'aiwa-overlay-host';
const HIGHLIGHT_PADDING = 4;
const CAPTION_GAP = 8;
const VIEWPORT_MARGIN = 8;
const CAPTION_FALLBACK_WIDTH = 180;
const CAPTION_FALLBACK_HEIGHT = 28;

interface OverlayState {
  host: HTMLElement;
  box: HTMLElement;
  caption: HTMLElement;
  target: Element | null;
  raf: number | null;
}

let state: OverlayState | null = null;

function ensureHost(): OverlayState {
  if (state?.host.isConnected) return state;
  state = null;
  const host = document.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    zIndex: '2147483647',
    pointerEvents: 'none',
  });
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      --aiwa-blue: #1d4ed8;
      --aiwa-blue-strong: #1e40af;
      --aiwa-ring: rgba(37, 99, 235, 0.30);
      --aiwa-ring-soft: rgba(37, 99, 235, 0.16);
      --aiwa-shadow: rgba(15, 23, 42, 0.22);
    }
    .box {
      position: fixed;
      border: 3px solid var(--aiwa-blue);
      border-radius: 10px;
      box-shadow:
        0 0 0 4px var(--aiwa-ring-soft),
        0 10px 24px var(--aiwa-shadow),
        inset 0 0 0 1px rgba(255, 255, 255, 0.85);
      pointer-events: none;
      transition: top 0.12s, left 0.12s, width 0.12s, height 0.12s;
      animation: pulse 1.4s ease-in-out infinite;
    }
    .caption {
      position: fixed;
      box-sizing: border-box;
      background: var(--aiwa-blue-strong);
      color: white;
      font: 600 13px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      letter-spacing: 0;
      padding: 7px 10px;
      border-radius: 8px;
      box-shadow: 0 8px 18px var(--aiwa-shadow);
      pointer-events: none;
      max-width: min(280px, calc(100vw - 16px));
      overflow-wrap: anywhere;
    }
    @keyframes pulse {
      0%, 100% {
        box-shadow:
          0 0 0 4px var(--aiwa-ring-soft),
          0 10px 24px var(--aiwa-shadow),
          inset 0 0 0 1px rgba(255, 255, 255, 0.85);
      }
      50% {
        box-shadow:
          0 0 0 8px var(--aiwa-ring),
          0 10px 24px var(--aiwa-shadow),
          inset 0 0 0 1px rgba(255, 255, 255, 0.85);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .box {
        animation: none;
        transition: none;
      }
    }
  `;
  shadow.appendChild(style);

  const box = document.createElement('div');
  box.className = 'box';
  shadow.appendChild(box);

  const caption = document.createElement('div');
  caption.className = 'caption';
  shadow.appendChild(caption);

  document.documentElement.appendChild(host);
  state = { host, box, caption, target: null, raf: null };
  return state;
}

export function showHighlight(target: Element, text: string) {
  const s = ensureHost();
  detachTargetListener(s.target);
  s.target = target;
  s.target.addEventListener('click', onTargetClick, { once: true });
  s.caption.textContent = text;
  reposition();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
}

export function hideHighlight() {
  if (!state) return;
  detachTargetListener(state.target);
  state.target = null;
  state.box.style.display = 'none';
  state.caption.style.display = 'none';
  window.removeEventListener('scroll', schedule);
  window.removeEventListener('resize', schedule);
}

function onTargetClick() {
  hideHighlight();
}

function detachTargetListener(target: Element | null) {
  target?.removeEventListener('click', onTargetClick);
}

function schedule() {
  if (!state) return;
  if (state.raf != null) return;
  state.raf = requestAnimationFrame(() => {
    if (!state) return;
    state.raf = null;
    reposition();
  });
}

function reposition() {
  if (!state || !state.target) return;
  const r = state.target.getBoundingClientRect();
  Object.assign(state.box.style, {
    display: 'block',
    top: `${r.top - HIGHLIGHT_PADDING}px`,
    left: `${r.left - HIGHLIGHT_PADDING}px`,
    width: `${r.width + HIGHLIGHT_PADDING * 2}px`,
    height: `${r.height + HIGHLIGHT_PADDING * 2}px`,
  });

  Object.assign(state.caption.style, {
    display: 'block',
    visibility: 'hidden',
    top: '0px',
    left: '0px',
  });
  const captionRect = state.caption.getBoundingClientRect();
  const captionWidth = captionRect.width || CAPTION_FALLBACK_WIDTH;
  const captionHeight = captionRect.height || CAPTION_FALLBACK_HEIGHT;
  const captionPosition = getCaptionPosition(r, captionWidth, captionHeight);

  Object.assign(state.caption.style, {
    display: 'block',
    visibility: 'visible',
    top: `${captionPosition.top}px`,
    left: `${captionPosition.left}px`,
  });
}

function getCaptionPosition(
  targetRect: DOMRect,
  captionWidth: number,
  captionHeight: number,
): { top: number; left: number } {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const spaceBelow = viewportHeight - targetRect.bottom - VIEWPORT_MARGIN - CAPTION_GAP;
  const spaceAbove = targetRect.top - VIEWPORT_MARGIN - CAPTION_GAP;
  const spaceRight = viewportWidth - targetRect.right - VIEWPORT_MARGIN - CAPTION_GAP;
  const spaceLeft = targetRect.left - VIEWPORT_MARGIN - CAPTION_GAP;

  if (spaceBelow >= captionHeight) {
    return {
      top: targetRect.bottom + CAPTION_GAP,
      left: clamp(targetRect.left, VIEWPORT_MARGIN, viewportWidth - captionWidth - VIEWPORT_MARGIN),
    };
  }

  const side = bestSide(spaceRight, spaceLeft, captionWidth);
  if (side === 'right') {
    return {
      top: clamp(
        targetRect.top + targetRect.height / 2 - captionHeight / 2,
        VIEWPORT_MARGIN,
        viewportHeight - captionHeight - VIEWPORT_MARGIN,
      ),
      left: targetRect.right + CAPTION_GAP,
    };
  }
  if (side === 'left') {
    return {
      top: clamp(
        targetRect.top + targetRect.height / 2 - captionHeight / 2,
        VIEWPORT_MARGIN,
        viewportHeight - captionHeight - VIEWPORT_MARGIN,
      ),
      left: targetRect.left - CAPTION_GAP - captionWidth,
    };
  }

  if (spaceAbove >= captionHeight || spaceAbove >= spaceBelow) {
    return {
      top: Math.max(VIEWPORT_MARGIN, targetRect.top - CAPTION_GAP - captionHeight),
      left: clamp(targetRect.left, VIEWPORT_MARGIN, viewportWidth - captionWidth - VIEWPORT_MARGIN),
    };
  }

  return {
    top: clamp(targetRect.bottom + CAPTION_GAP, VIEWPORT_MARGIN, viewportHeight - captionHeight - VIEWPORT_MARGIN),
    left: clamp(targetRect.left, VIEWPORT_MARGIN, viewportWidth - captionWidth - VIEWPORT_MARGIN),
  };
}

function bestSide(
  spaceRight: number,
  spaceLeft: number,
  captionWidth: number,
): 'right' | 'left' | null {
  if (spaceRight >= captionWidth && spaceRight >= spaceLeft) return 'right';
  if (spaceLeft >= captionWidth) return 'left';
  if (spaceRight >= captionWidth) return 'right';
  return null;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
