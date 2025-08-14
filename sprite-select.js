
// sprite-select.js
import * as Azure from "./js/azure-api.js"; 

/************ Session detection (non-blocking) ************/
const qs = new URLSearchParams(window.location.search);
const sessionId = qs.get("session") || localStorage.getItem("sessionCode") || null;

// device token (for locking)
const deviceToken = (() => {
  let t = localStorage.getItem("deviceToken");
  if (!t) { t = crypto.randomUUID(); localStorage.setItem("deviceToken", t); }
  return t;
})();

/************ Pixel-accurate hover + click ************/
const sprites = Array.from(document.querySelectorAll(".character"));
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

function wire(img) {
  if (img.complete && (img.naturalWidth || img.width)) buildHitCanvas(img);
  else img.addEventListener("load", () => buildHitCanvas(img), { once: true });

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
    // If we can't verify pixel hit (e.g., image not decoded yet), allow click anyway
    const off = hit.get(img);
    if (off && !isOverInk(img, off, e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (img.classList.contains("locked")) return;

    const charKey = img.dataset.char;
    // If no session, just go straight to canvas (standalone mode)
    if (!sessionId) {
      window.location.href = `canvas.html?char=${charKey}`;
      return;
    }

    // Try Azure lock; if it fails, fall back to navigating (so class can proceed)
    try {
      const res = await Azure.lockCharacter(sessionId, charKey, deviceToken);
      const ok = !!res && !!res.locks && res.locks[charKey] === deviceToken;
      if (!ok) {
        alert("Sorry, this character is already taken.");
        return;
      }
      window.location.href = `canvas.html?char=${charKey}&session=${sessionId}`;
    } catch (err) {
      console.warn("Lock failed, proceeding without lock:", err);
      window.location.href = `canvas.html?char=${charKey}&session=${sessionId}`;
    }
  }, true);
}

sprites.forEach(wire);

// Rebuild hit-maps if images resize
const ro = new ResizeObserver(entries => {
  for (const e of entries) {
    const el = e.target;
    if (el.classList.contains("character")) buildHitCanvas(el);
  }
});
sprites.forEach(img => ro.observe(img));

/************ Refresh locks (non-blocking) ************/
async function refreshLocks() {
  if (!sessionId) return; // standalone mode
  try {
    const sess = await Azure.getSession(sessionId);
    const taken = (sess && sess.locks) || {};
    sprites.forEach(el => {
      const key = el.dataset.char;
      if (taken[key]) el.classList.add("locked");
      else el.classList.remove("locked");
    });
  } catch (e) {
    // don’t spam; log once in a while
    // console.debug("refreshLocks error:", e?.message || e);
  }
}
refreshLocks();
setInterval(refreshLocks, 1000);
