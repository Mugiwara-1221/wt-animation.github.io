
// sprite-select.js
import { getSession, lockCharacter } from "./azure-api.js";

/* =========================
   Session handling (Azure)
   ========================= */
const urlParams = new URLSearchParams(window.location.search);
const sessionId =
  urlParams.get("session") ||
  localStorage.getItem("sessionCode"); // fallback if you came from session.html

if (!sessionId) {
  alert("No session ID found. Please join or create a session first.");
  window.location.href = "session.html";
}

const deviceToken = localStorage.getItem("deviceToken") || crypto.randomUUID();
localStorage.setItem("deviceToken", deviceToken);

/* ==========================================
   Pixel-accurate hover/click on .character
   ========================================== */
const characters = Array.from(document.querySelectorAll(".character"));

/** Offscreen hit-test canvas per image */
const hit = new Map();

/** Build or rebuild offscreen canvas for an <img> */
function buildHitCanvas(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return; // not ready yet

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  hit.set(img, { canvas: c, ctx: cx, w, h });
}

/** True if pointer is over a non-transparent pixel of img */
function isOverInk(img, off, evt) {
  const rect = img.getBoundingClientRect();
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;

  const xEl = clientX - rect.left;
  const yEl = clientY - rect.top;

  // map element coords -> natural image coords
  const scaleX = off.w / rect.width;
  const scaleY = off.h / rect.height;
  const x = Math.floor(xEl * scaleX);
  const y = Math.floor(yEl * scaleY);

  if (x < 0 || y < 0 || x >= off.w || y >= off.h) return false;
  const a = off.ctx.getImageData(x, y, 1, 1).data[3];
  return a > 10; // alpha threshold
}

/** Attach listeners to one sprite image */
function wireCharacter(img) {
  // Build hit canvas when ready
  if (img.complete && (img.naturalWidth || img.width)) {
    buildHitCanvas(img);
  } else {
    img.addEventListener("load", () => buildHitCanvas(img), { once: true });
  }

  // Pixel-accurate hover
  const onMove = (e) => {
    const off = hit.get(img);
    if (!off) return;
    const over = isOverInk(img, off, e);
    img.classList.toggle("hovered", over && !img.classList.contains("locked"));
  };
  const onLeave = () => img.classList.remove("hovered");

  img.addEventListener("mousemove", onMove);
  img.addEventListener("mouseleave", onLeave);

  // Touch hover-ish (optional visual feedback)
  img.addEventListener("touchstart", (e) => {
    const off = hit.get(img);
    if (!off) return;
    const over = isOverInk(img, off, e);
    img.classList.toggle("hovered", over && !img.classList.contains("locked"));
  }, { passive: true });

  // Pixel-accurate click + locking
  img.addEventListener(
    "click",
    async (e) => {
      const off = hit.get(img);
      if (!off || !isOverInk(img, off, e) || img.classList.contains("locked")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const selectedChar = img.getAttribute("data-char");
      try {
        const res = await lockCharacter(sessionId, selectedChar, deviceToken);
        if (!res || !res.locks || res.locks[selectedChar] !== deviceToken) {
          alert("Sorry, this character is already taken.");
          return;
        }
        window.location.href = `canvas.html?char=${selectedChar}&session=${sessionId}`;
      } catch (err) {
        console.error(err);
        alert("Failed to lock character. It may already be taken.");
      }
    },
    true
  );
}

// Wire all characters
characters.forEach(wireCharacter);

// If images might resize (responsive), rebuild hit canvases when they do.
const ro = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const el = entry.target;
    if (el.classList && el.classList.contains("character")) {
      // Rebuild using latest pixels (hover accuracy)
      buildHitCanvas(el);
    }
  }
});
characters.forEach((img) => ro.observe(img));

/* =========================
   Refresh locks from Azure
   ========================= */
async function refreshLocks() {
  try {
    const sess = await getSession(sessionId);
    const taken = sess?.locks || {};
    characters.forEach((el) => {
      const key = el.getAttribute("data-char");
      if (taken[key]) {
        el.classList.add("locked");
        el.setAttribute("aria-disabled", "true");
      } else {
        el.classList.remove("locked");
        el.removeAttribute("aria-disabled");
      }
    });
  } catch (e) {
    console.debug("refreshLocks error:", e?.message || e);
  }
}
// Pull once fast, then poll
refreshLocks();
const lockTimer = setInterval(refreshLocks, 1000);

// Optional: clear polling when leaving page
window.addEventListener("beforeunload", () => clearInterval(lockTimer));
