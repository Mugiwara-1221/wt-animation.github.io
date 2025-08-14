
// sprite-select.js — Pixel-accurate hover + Azure-ready locking
import { getSession, lockCharacter } from "./azure-api.js"; // keep import if Azure API is ready

const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get("session") || localStorage.getItem("sessionCode");
if (!sessionId) {
  alert("No session ID found. Please join or create a session first.");
  window.location.href = "session.html";
}

const deviceToken = localStorage.getItem("deviceToken") || crypto.randomUUID();
localStorage.setItem("deviceToken", deviceToken);

const characters = Array.from(document.querySelectorAll(".character"));
const hitMap = new Map();

// Build offscreen canvas for hit test
async function buildHitCanvas(img) {
  if ("decode" in img) {
    try { await img.decode(); } catch {}
  } else {
    await new Promise(r => (img.complete ? r() : img.addEventListener("load", r, { once: true })));
  }
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  hitMap.set(img, { canvas: c, ctx, w: c.width, h: c.height });
}

function isOverInk(img, off, evt) {
  const rect = img.getBoundingClientRect();
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  const xEl = clientX - rect.left;
  const yEl = clientY - rect.top;
  const scaleX = off.w / rect.width;
  const scaleY = off.h / rect.height;
  const x = Math.floor(xEl * scaleX);
  const y = Math.floor(yEl * scaleY);
  if (x < 0 || y < 0 || x >= off.w || y >= off.h) return false;
  return off.ctx.getImageData(x, y, 1, 1).data[3] > 10;
}

async function wireCharacter(img) {
  await buildHitCanvas(img);

  img.addEventListener("mousemove", e => {
    const off = hitMap.get(img);
    if (!off) return;
    const over = isOverInk(img, off, e);
    img.classList.toggle("hovered", over && !img.classList.contains("locked"));
  });
  img.addEventListener("mouseleave", () => img.classList.remove("hovered"));

  img.addEventListener("click", async e => {
    const off = hitMap.get(img);
    if (!off || !isOverInk(img, off, e) || img.classList.contains("locked")) return;
    const selectedChar = img.getAttribute("data-char");

    try {
      const res = await lockCharacter(sessionId, selectedChar, deviceToken);
      if (!res || !res.locks || res.locks[selectedChar] !== deviceToken) {
        alert("Sorry, this character is already taken.");
        return;
      }
      window.location.href = `canvas.html?char=${selectedChar}&session=${sessionId}`;
    } catch {
      alert("Failed to lock character. It may already be taken.");
    }
  });
}

characters.forEach(wireCharacter);

// Poll locks from Azure
async function refreshLocks() {
  try {
    const sess = await getSession(sessionId);
    const taken = sess?.locks || {};
    characters.forEach(el => {
      const key = el.getAttribute("data-char");
      if (taken[key]) el.classList.add("locked");
      else el.classList.remove("locked");
    });
  } catch {}
}
refreshLocks();
setInterval(refreshLocks, 1000);
