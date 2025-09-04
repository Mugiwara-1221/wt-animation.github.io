
// js/sprite-select.js
// Pixel-accurate hover & click on .character sprites.
// Uses Azure locks if available, but NEVER blocks rendering if API is down.

import { readCtx, nextURL } from "./flow.js";

// ---- Try to import Azure helpers (optional at runtime) ----
let Azure = null;
try {
  Azure = await import("./azure-api.js");
} catch {
  // OK to proceed without Azure (GitHub Pages, local file, etc.)
}

/************ Session / flow ctx ************/
const ctx = readCtx();             // story/grade/etc if user followed the flow
const sessionId =
  ctx.session ||
  localStorage.getItem("sessionCode") || // fallback if someone arrived directly
  null;

// Stable device token (for locking identity)
const deviceToken = (() => {
  let t = localStorage.getItem("deviceToken");
  if (!t) {
    t = (crypto.randomUUID?.() || String(Date.now()));
    localStorage.setItem("deviceToken", t);
  }
  return t;
})();

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
  return off.ctx.getImageData(x, y, 1, 1).data[3] > 10;
}

// Include sprite URL so canvas never confuses cross-story characters
function goToCanvas(charKey, spriteUrl) {
  const url = nextURL("canvas.html", ctx, {
    char: charKey,
    sprite: spriteUrl || ""
  });
  location.href = url;
}

function wire(img) {
  // Build hit-map as soon as the image is ready
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
    const off = hit.get(img);
    if (off && !isOverInk(img, off, e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (img.classList.contains("locked")) return;

    const charKey   = img.dataset.char;
    const spriteUrl = img.dataset.sprite || img.src;

    // No session or no Azure? Just navigate — do NOT block rendering.
    if (!sessionId || !Azure?.lockCharacter) {
      goToCanvas(charKey, spriteUrl);
      return;
    }

    // Try Azure lock; on failure, proceed anyway so class can continue.
    try {
      const res = await Azure.lockCharacter(sessionId, charKey, deviceToken);
      const ok = !!res && !!res.locks && res.locks[charKey] === deviceToken;
      if (!ok) {
        alert("Sorry, this character is already taken.");
        return;
      }
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

/************ Boot: ALWAYS wire sprites first ************/
async function boot() {
  if (document.readyState === "loading") {
    await new Promise(r => document.addEventListener("DOMContentLoaded", r, { once: true }));
  }
  wireAllCurrentSprites();   // characters are already injected by sprite-select.html
  scheduleLockRefresh(0);    // non-blocking lock polling
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

boot();
