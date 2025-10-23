
// js/sprite-select.js
// Pixel-accurate hover & click on .character sprites.
// Uses Azure locks if available, but NEVER blocks rendering if API is down.

import { readCtx, nextURL } from "./flow.js";

const hostname = window.location.hostname;
const port = window.location.port;
let API_BASE;
// Case 1: running locally (frontend served from localhost or 127.0.0.1)
if (hostname === "localhost" || hostname === "127.0.0.1") {
  // If you’re serving FastAPI on 5500, use that
  API_BASE = `http://${hostname}:${port}`;
}
// Case 2: production (your deployed site)
else {
  API_BASE = "https://wt-animation-github-io.onrender.com";
}

const WS_BASE = API_BASE.replace(/^http/, "ws");

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

// List any temporarily disabled characters here
const TEMP_DISABLED = new Set(["bush"]); // ← replace with your data-char id(s)
const userid = localStorage.getItem("memberId");

/************ Pixel-accurate hover + click ************/
const hit = new Map();

let socket;

function initSocket(sessionId, userId) {
  socket = new WebSocket(`${WS_BASE}/ws/${sessionId}?user_id=${userId}`);
  socket.addEventListener("open", () => {
    console.log("WebSocket connected");
  });
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "locks") {
      updateLocks(msg.locks);
    }
    // You can add other message types here (system, drawings, etc.)
  });
  socket.addEventListener("close", () => {
    console.log("WebSocket closed, attempting reconnect in 2s");
    setTimeout(() => initSocket(sessionId, userId), 2000);
  });

  socket.addEventListener("error", (err) => {
    console.error("WebSocket error:", err);
  });
}
initSocket(sessionId, userid);

socket.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "locks") {
    updateLocks(msg.locks);
  }
});

function updateLocks(locks) {
  document.querySelectorAll(".character").forEach(el => {
    const key = el.dataset.char;
    if (locks[key]) {
      el.classList.add("locked");
      el.setAttribute("title", `Locked by ${locks[key]}`);
    } else {
      el.classList.remove("locked");
      el.removeAttribute("title");
    }
  });
}

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
  if (img.classList.contains("disabled")) return;   // ← belt-and-suspenders
  const off = hit.get(img);

  // Transparent pixel? Let the element underneath receive this click.
  if (off && !isOverInk(img, off, e)) {
    e.preventDefault();
    e.stopPropagation();

    const prev = img.style.pointerEvents;
    img.style.pointerEvents = "none";               // temporarily ignore this img
    const under = document.elementFromPoint(e.clientX, e.clientY);
    img.style.pointerEvents = prev || "";           // restore immediately

    if (under && under !== img) {
      under.dispatchEvent(new MouseEvent("click", {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY
      }));
    }
    return; // done
  }

  if (img.classList.contains("locked")) return;

  const charKey   = img.dataset.char;
  const spriteUrl = img.dataset.sprite || img.src;

  // No session or no Azure? Just navigate — do NOT block rendering.
  try {
    const res = await fetch(`${API_BASE}/session/${sessionId}/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character: charKey, user_id: parseInt(userid,10) })
    });
    console.log(res);
    if (res.status === 409) {
      alert("Sorry, this character is already taken.");
      return;
    }
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    const ok = data.success && data.locks[charKey] === parseInt(userid);
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
  // Tag disabled sprites
document.querySelectorAll(".character").forEach(img => {
  const id = (img.dataset.char || "").toLowerCase();
  if (TEMP_DISABLED.has(id)) img.classList.add("disabled");
});
  //scheduleLockRefresh(0);    // non-blocking lock polling
}

/************ Refresh locks (non-blocking with backoff) ************/
let lockPollMs = 1000; // start at 1s, back off up to ~10s
function scheduleLockRefresh(delay) {
  setTimeout(refreshLocks, delay);
}

async function refreshLocks() {
  if (!sessionId) return; // nothing to refresh

  try {
    const res = await fetch(`${API_BASE}/session/${sessionId}`);
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const sess = await res.json();
    const taken = (sess && sess.locks) || {};
    document.querySelectorAll(".character").forEach(el => {
      const key = el.dataset.char;
      if (taken[key]) {
        el.classList.add("locked");
      } else {
        el.classList.remove("locked");
      }
    });
    lockPollMs = 1000; // success: fast cadence
  } catch (err) {
    console.warn("getSession failed (UI continues):", err);
    lockPollMs = Math.min(10000, (lockPollMs * 1.7) | 0); // gentle backoff
  } finally {
    scheduleLockRefresh(lockPollMs);
  }
}

// === Strict Pixel-Perfect Router ===
(function enableStrictPixelRouter() {
  const selector = '.character';
  const alphaThreshold = 20;

  // Offscreen cache for alpha sampling
  const hitCache = new WeakMap();

  function ensureHitCanvas(img) {
    let h = hitCache.get(img);
    const w = img.naturalWidth || img.width;
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

  // Find candidate sprites by geometry (since pointer-events:none hides them from elementsFromPoint)
  function spritesUnderPoint(clientX, clientY) {
  const all = Array.from(document.querySelectorAll(selector));
  return all
    .filter(el => {
      const r = el.getBoundingClientRect();
      const hitGeom = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
      return hitGeom && !el.classList.contains("disabled"); // ← skip disabled
    })
    .sort((a, b) => {
      const za = parseInt(getComputedStyle(a).zIndex || '0', 10);
      const zb = parseInt(getComputedStyle(b).zIndex || '0', 10);
      if (za !== zb) return zb - za; // higher z-index first
      // DOM order tie-breaker: later appears on top
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

  // Disable native rectangle hits globally (CSS also does this; JS enforces for dynamic nodes)
  function disableNativeHits() {
    for (const img of document.querySelectorAll(selector)) {
      img.style.pointerEvents = 'none';
      img.style.cursor = 'default';
    }
  }
  disableNativeHits();

  // Hover state (drives your .character.hovered CSS)
  let lastHover = null;
  document.addEventListener('mousemove', (e) => {
    const hit = topOpaqueSpriteAt(e.clientX, e.clientY);
    const canHover = hit && !hit.classList.contains('disabled');  // ← skip disabled

    if (lastHover && lastHover !== hit) lastHover.classList.remove('hovered');
    if (hit && hit !== lastHover) hit.classList.add('hovered');
    lastHover = hit || null;

    document.body.style.cursor = hit ? 'pointer' : 'default';
  }, true);

  // Click routing
  document.addEventListener('click', (e) => {
    if (!e.isTrusted) return; // ignore synthetic clicks we dispatch ourselves
    const hit = topOpaqueSpriteAt(e.clientX, e.clientY);
     if (!hit || hit.classList.contains('disabled')) return;  // ← skip disabled

    // Stop the native click on any containers, route to the right sprite
    e.preventDefault();
    e.stopPropagation();

    // Fire a normal click on the sprite so your wire(img) listener runs
    hit.dispatchEvent(new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: e.clientX,
      clientY: e.clientY
    }));
  }, true);

  // If sprites are added later, keep them inert to native hits
  const mo = new MutationObserver(disableNativeHits);
  mo.observe(document.body, { childList: true, subtree: true });
})();

boot();
