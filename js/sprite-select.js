
// js/sprite-select.js
// Wires pixel-accurate hover & click on .character sprites
// Locks via Azure if available; otherwise just navigates.

import { readCtx, nextURL } from './flow.js';

// Try to import Azure helpers if present
let Azure = null;
try {
  Azure = await import('./azure-api.js');
} catch {
  // ok to proceed without locks locally
}

/************ Session / flow ctx ************/
const ctx = readCtx(); // has session/story/grade if user followed the flow
const sessionId = ctx.session || null;

// stable device token (for locking)
const deviceToken = (() => {
  let t = localStorage.getItem('deviceToken');
  if (!t) { t = (crypto.randomUUID?.() || String(Date.now())); localStorage.setItem('deviceToken', t); }
  return t;
})();

/************ Pixel-accurate hover + click ************/
const hit = new Map();

function buildHitCanvas(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return;

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  hit.set(img, { canvas: c, ctx: cx, w, h });
}

function isOverInk(img, off, evt) {
  const rect = img.getBoundingClientRect();
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  const xEl = clientX - rect.left;
  const yEl = clientY - rect.top;
  const sx = off.w / rect.width;
  const sy = off.h / rect.height;
  const x = Math.floor(xEl * sx);
  const y = Math.floor(yEl * sy);
  if (x < 0 || y < 0 || x >= off.w || y >= off.h) return false;
  return off.ctx.getImageData(x, y, 1, 1).data[3] > 10;
}

function goToCanvas(charKey) {
  // carry flow context forward
  const url = nextURL('canvas.html', ctx, { char: charKey });
  location.href = url;
}

function wire(img) {
  if (img.complete && (img.naturalWidth || img.width)) buildHitCanvas(img);
  else img.addEventListener('load', () => buildHitCanvas(img), { once: true });

  const onMove = (e) => {
    const off = hit.get(img);
    if (!off) return;
    const over = isOverInk(img, off, e);
    img.classList.toggle('hovered', over && !img.classList.contains('locked'));
  };
  const onLeave = () => img.classList.remove('hovered');

  img.addEventListener('mousemove', onMove);
  img.addEventListener('mouseleave', onLeave);
  img.addEventListener('touchstart', onMove, { passive: true });

  img.addEventListener('click', async (e) => {
    const off = hit.get(img);
    if (off && !isOverInk(img, off, e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (img.classList.contains('locked')) return;

    const charKey = img.dataset.char;

    // No session? just navigate (standalone)
    if (!sessionId || !Azure?.lockCharacter) {
      goToCanvas(charKey);
      return;
    }

    // Try Azure lock; on failure, proceed anyway so class can continue
    try {
      const res = await Azure.lockCharacter(sessionId, charKey, deviceToken);
      const ok = !!res && !!res.locks && res.locks[charKey] === deviceToken;
      if (!ok) {
        alert('Sorry, this character is already taken.');
        return;
      }
      goToCanvas(charKey);
    } catch (err) {
      console.warn('Lock failed, proceeding without lock:', err);
      goToCanvas(charKey);
    }
  }, true);
}

function wireAllCurrentSprites() {
  const sprites = Array.from(document.querySelectorAll('.character'));
  sprites.forEach(wire);

  // Rebuild hit-maps if images resize
  const ro = new ResizeObserver(entries => {
    for (const e of entries) {
      const el = e.target;
      if (el.classList.contains('character')) buildHitCanvas(el);
    }
  });
  sprites.forEach(img => ro.observe(img));
}

// In case this script is imported before sprites are injected, delay a tick:
queueMicrotask(wireAllCurrentSprites);

/************ Refresh locks (non-blocking) ************/
async function refreshLocks() {
  if (!sessionId || !Azure?.getSession) return; // standalone mode
  try {
    const sess = await Azure.getSession(sessionId);
    const taken = (sess && sess.locks) || {};
    document.querySelectorAll('.character').forEach(el => {
      const key = el.dataset.char;
      if (taken[key]) el.classList.add('locked');
      else el.classList.remove('locked');
    });
  } catch (_) { /* quiet */ }
}
refreshLocks();
setInterval(refreshLocks, 1000);
