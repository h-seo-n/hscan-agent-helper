const HOST_ID = 'aiwa-overlay-host';

interface OverlayState {
  host: HTMLElement;
  box: HTMLElement;
  caption: HTMLElement;
  target: Element | null;
  raf: number | null;
}

let state: OverlayState | null = null;

function ensureHost(): OverlayState {
  if (state) return state;
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
    .box {
      position: fixed;
      border: 2px solid #2563eb;
      border-radius: 8px;
      box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.18);
      pointer-events: none;
      transition: top 0.12s, left 0.12s, width 0.12s, height 0.12s;
      animation: pulse 1.4s ease-in-out infinite;
    }
    .caption {
      position: fixed;
      background: #2563eb;
      color: white;
      font: 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 4px 8px;
      border-radius: 6px;
      pointer-events: none;
      max-width: 240px;
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.18); }
      50%      { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0.32); }
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
  s.target = target;
  s.caption.textContent = text;
  reposition();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
}

export function hideHighlight() {
  if (!state) return;
  state.target = null;
  state.box.style.display = 'none';
  state.caption.style.display = 'none';
  window.removeEventListener('scroll', schedule);
  window.removeEventListener('resize', schedule);
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
  const pad = 4;
  Object.assign(state.box.style, {
    display: 'block',
    top: `${r.top - pad}px`,
    left: `${r.left - pad}px`,
    width: `${r.width + pad * 2}px`,
    height: `${r.height + pad * 2}px`,
  });
  Object.assign(state.caption.style, {
    display: 'block',
    top: `${r.bottom + 8}px`,
    left: `${r.left}px`,
  });
}
