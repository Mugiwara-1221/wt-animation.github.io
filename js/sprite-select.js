// js/sprite-select.js
// Pixel-accurate hover & click on .character sprites.
// Now aware of multi-slide selection; preserves slides list and
// allows cycling among ONLY the selected slides.

import {
  readCtx,
  nextURL,
  // ↓ these helpers were added to flow.js in step 1
  getSelectedSlides,
  nextInSelection,
  prevInSelection
} from "./flow.js";

// ---- import Azure helpers (optional at runtime) ----
let Azure = null;
try {
  Azure = await import("./azure-api.js");
} catch {
  // proceed without Azure (GitHub Pages, local file, etc.)
}

/************ Session / flow ctx ************/
const ctx = readCtx(); // story/grade/slide/slides if user followed the flow
const sessionId =
  ctx.session ||
  localStorage.getItem("sessionCode") ||
  null;

// Selected slides (sorted, unique)
const selectedSlides = getSelectedSlides(ctx);

// Ensure we are looking at a valid slide from the selection
let slideNo = Number(ctx.slide) || (selectedSlides?.[0] ?? 1);
if (selectedSlides?.length && !selectedSlides.includes(slideNo)) {
  slideNo = selectedSlides[0];
  // snap URL so refresh/share is correct
  const u = new URL(location.href);
  u.searchParams.set("slide", String(slideNo));
  if (selectedSlides.length) u.searchParams.set("slides", selectedSlides.join(","));
  history.replaceState({}, "", u.toString());
}

// Optional: wire prev/next buttons if present
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
btnPrev?.addEventListener("click", () => goToSlide(prevInSelection(slideNo, selectedSlides)));
btnNext?.addEventListener("click", () => goToSlide(nextInSelection(slideNo, selectedSlides)));

// Also allow keyboard ←/→ to move among selected slides
addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft")  goToSlide(prevInSelection(slideNo, selectedSlides));
  if (e.key === "ArrowRight") goToSlide(nextInSelection(slideNo, selectedSlides));
});

// Stable device token (for locking identity)
const deviceToken = (() => {
  let t = localStorage.getItem("deviceToken");
  if (!t) {
    t = (crypto.randomUUID?.() || String(Date.now()));
    localStorage.setItem("deviceToken", t);
  }
  return t;
})();

// List any temporarily disabled characters here
const TEMP_DISABLED = new Set(["bush"]); // ← replace or empty as needed

/************ Pixel-accurate hover + click ************/
const hit = new Map();

function buildHitCanvas(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const cx = c.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  hit.set(img, { canvas: c, ctx: cx, w, h });
}

function isOverInk(img, off, evt) {
  const rect = img.getBoundingClientRect();
  const p = evt.touches ? evt.touches[0] : evt;
  const xEl = p.clientX - rect.left;
  const yEl = p.clientY - rect.top;
  const sx = off.w / rect.width;
  const sy = off.h / rect.height;
  const x = (xEl * sx) | 0;
  const y = (yEl * sy) | 0;
  if (x < 0 || y < 0 || x >= off.w || y >= off.h) return false;
  return off.ctx.getImageData(x, y, 1, 1).data[3] > 20;
}

// Include slide + sprite URL so canvas has full context.
// IMPORTANT: preserve `slides=` in the URL so downstream pages can cycle among them.
function goToCanvas(charKey, spriteUrl) {
  const url = nextURL("canvas.html", { ...ctx, slide: String(slideNo) }, {
    char: charKey,
    includeSlides: true     // <- flow.nextURL will append slides if available
  });
  // ensure slides query param exists even if some page didn't include it earlier
  const u = new URL(url, location.href);
  if (selectedSlides?.length) u.searchParams.set("slides", selectedSlides.join(","));
  if (spriteUrl) u.searchParams.set("sprite", spriteUrl);
  location.href = u.toString();
}

function wire(img) {
  // Build hit-map when the image is ready
  if (img.complete && (img.naturalWidth || img.width)) buildHitCanvas(img);
  else {
    if ("decode" in img) {
      img.decode().then(() => buildHitCanvas(img)).catch(() => buildHitCanvas(img));
    } else {
      img.addEventListener("load", () => buildHitCanvas(img), { once: true });
    }
  }

  const onMove = (e) => {
    const off = hit.get(img);
    if (!off) return;
    const over = isOverInk(img, off, e);
    img.classList.toggle("hovered", over && !img.classList.contains("locked"));
  };
  const onLeave = () => img.classList.remove("hovered");

  img.addEventListener("mousemove", onMove);
  img.addEventListener("mouseleave", onLeave);
  img.addEventListener("touchstart", onMove, { passive: true });

  img.addEventListener("click", async (e) => {
    if (img.classList.contains("disabled")) return;
    const off = hit.get(img);

    // Transparent pixel? route to element underneath
    if (off && !isOverInk(img, off, e)) {
      e.preventDefault();
      e.stopPropagation();

      const prev = img.style.pointerEvents;
      img.style.pointerEvents = "none";
      const under = document.elementFromPoint(e.clientX, e.clientY);
      img.style.pointerEvents = prev || "";

      if (under && under !== img) {
        under.dispatchEvent(new MouseEvent("click", {
          view: window, bubbles: true, cancelable: true,
          clientX: e.clientX, clientY: e.clientY
        }));
      }
      return;
    }

    if (img.classList.contains("locked")) return;

    const charKey   = img.dataset.char;
    const spriteUrl = img.dataset.sprite || img.src;

    if (!sessionId || !Azure?.lockCharacter) {
      goToCanvas(charKey, spriteUrl);
      return;
    }
    try {
      const res = await Azure.lockCharacter(sessionId, charKey, deviceToken);
      const ok = !!res && !!res.locks && res.locks[charKey] === deviceToken;
      if (!ok) { alert("Sorry, this character is already taken."); return; }
      goToCanvas(charKey, spriteUrl);
    } catch (err) {
      console.warn("Lock failed, proceeding without lock:", err);
      goToCanvas(charKey, spriteUrl);
    }
  }, true);
}

function wireAllCurrentSprites() {
  const sprites = Array.from(document.querySelectorAll(".character"));
  sprites.forEach(wire);

  // Rebuild hit-maps if elements resize
  const ro = new ResizeObserver(entries => {
    for (const e of entries) {
      const el = e.target;
      if (el.classList.contains("character")) buildHitCanvas(el);
    }
  });
  sprites.forEach(img => ro.observe(img));
}

/************ Refresh locks (non-blocking with backoff) ************/
let lockPollMs = 1000; // start at 1s, back off up to ~10s
function scheduleLockRefresh(delay) {
  setTimeout(refreshLocks, delay);
}

async function refreshLocks() {
  if (!sessionId || !Azure?.getSession) return; // standalone: nothing to refresh
  try {
    const sess = await Azure.getSession(sessionId);
    const taken = (sess && sess.locks) || {};
    document.querySelectorAll(".character").forEach(el => {
      const key = el.dataset.char;
      if (taken[key]) el.classList.add("locked");
      else el.classList.remove("locked");
    });
    lockPollMs = 1000; // success: fast cadence
  } catch (err) {
    console.warn("getSession failed (UI continues):", err);
    lockPollMs = Math.min(10000, (lockPollMs * 1.7) | 0); // gentle backoff
  } finally {
    scheduleLockRefresh(lockPollMs);
  }
}

/************ Strict Pixel-Perfect Router ************/
(function enableStrictPixelRouter() {
  const selector = '.character';
  const alphaThreshold = 20;

  const hitCache = new WeakMap();

  function ensureHitCanvas(img) {
    let h = hitCache.get(img);
    const w  = img.naturalWidth || img.width;
    const hh = img.naturalHeight || img.height;
    if (h && h.w === w && h.h === hh) return h;

    if (!img.complete || !w || !hh) {
      img.addEventListener('load', () => ensureHitCanvas(img), { once: true });
      return null;
    }
    const c = document.createElement('canvas');
    c.width = w; c.height = hh;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = false;
    cx.clearRect(0, 0, w, hh);
    cx.drawImage(img, 0, 0, w, hh);
    h = { canvas: c, ctx: cx, w, h: hh };
    hitCache.set(img, h);
    return h;
  }

  function alphaAt(img, clientX, clientY) {
    const rect = img.getBoundingClientRect();
    const h = ensureHitCanvas(img);
    if (!h) return 0;
    const x = Math.floor((clientX - rect.left) * (h.w / rect.width));
    const y = Math.floor((clientY - rect.top)  * (h.h / rect.height));
    if (x < 0 || y < 0 || x >= h.w || y >= h.h) return 0;
    return h.ctx.getImageData(x, y, 1, 1).data[3];
  }

  function spritesUnderPoint(clientX, clientY) {
    const all = Array.from(document.querySelectorAll(selector));
    return all
      .filter(el => {
        const r = el.getBoundingClientRect();
        const hitGeom = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
        return hitGeom && !el.classList.contains("disabled");
      })
      .sort((a, b) => {
        const za = parseInt(getComputedStyle(a).zIndex || '0', 10);
        const zb = parseInt(getComputedStyle(b).zIndex || '0', 10);
        if (za !== zb) return zb - za; // higher z-index first
        return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
      });
  }

  function topOpaqueSpriteAt(clientX, clientY) {
    const candidates = spritesUnderPoint(clientX, clientY);
    for (const img of candidates) {
      const a = alphaAt(img, clientX, clientY);
      if (a > alphaThreshold) return img;
    }
    return null;
  }

  function disableNativeHits() {
    for (const img of document.querySelectorAll(selector)) {
      img.style.pointerEvents = 'none';
      img.style.cursor = 'default';
    }
  }
  disableNativeHits();

  let lastHover = null;
  document.addEventListener('mousemove', (e) => {
    const h = topOpaqueSpriteAt(e.clientX, e.clientY);
    const canHover = h && !h.classList.contains('disabled');
    if (lastHover && lastHover !== h) lastHover.classList.remove('hovered');
    if (h && h !== lastHover && canHover) h.classList.add('hovered');
    lastHover = h || null;
    document.body.style.cursor = h ? 'pointer' : 'default';
  }, true);

  document.addEventListener('click', (e) => {
    if (!e.isTrusted) return; // ignore synthetic clicks
    const h = topOpaqueSpriteAt(e.clientX, e.clientY);
    if (!h || h.classList.contains('disabled')) return;
    e.preventDefault();
    e.stopPropagation();
    h.dispatchEvent(new MouseEvent('click', {
      view: window, bubbles: true, cancelable: true,
      clientX: e.clientX, clientY: e.clientY
    }));
  }, true);

  const mo = new MutationObserver(disableNativeHits);
  mo.observe(document.body, { childList: true, subtree: true });
})();

/************ Navigation helpers ************/
function goToSlide(n) {
  if (!n || n === slideNo) return;
  slideNo = Number(n);
  const u = new URL(location.href);
  u.searchParams.set("slide", String(slideNo));
  if (selectedSlides?.length) u.searchParams.set("slides", selectedSlides.join(","));
  location.href = u.toString(); // reload to show the proper page-specific characters
}

/************ Boot ************/
async function boot() {
  if (document.readyState === "loading") {
    await new Promise(r => document.addEventListener("DOMContentLoaded", r, { once: true }));
  }
  wireAllCurrentSprites(); // characters are already in the DOM (page-specific)
  // Tag disabled sprites
  document.querySelectorAll(".character").forEach(img => {
    const id = (img.dataset.char || "").toLowerCase();
    if (TEMP_DISABLED.has(id)) img.classList.add("disabled");
  });
  scheduleLockRefresh(0); // non-blocking lock polling
}
boot();
