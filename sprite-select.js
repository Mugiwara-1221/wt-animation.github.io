
// sprite-select.js
import { getSession, lockCharacter } from "./azure-api.js";

// --- Pixel-accurate hover & click for .character images ---
const characters = Array.from(document.querySelectorAll('.character'));

function buildHitCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  return { canvas: c, ctx: cx };
}

function isOverInk(img, off, evt) {
  const rect = img.getBoundingClientRect();
  const xEl = evt.clientX - rect.left;
  const yEl = evt.clientY - rect.top;
  const scaleX = (img.naturalWidth || img.width) / rect.width;
  const scaleY = (img.naturalHeight || img.height) / rect.height;
  const x = Math.floor(xEl * scaleX);
  const y = Math.floor(yEl * scaleY);
  if (x < 0 || y < 0 || x >= off.canvas.width || y >= off.canvas.height) return false;
  const { data } = off.ctx.getImageData(x, y, 1, 1);
  return data[3] > 10; // alpha threshold
}

const hitData = new Map();
characters.forEach(img => {
  if (img.complete) {
    hitData.set(img, buildHitCanvas(img));
  } else {
    img.addEventListener('load', () => hitData.set(img, buildHitCanvas(img)));
  }

  img.addEventListener('mousemove', e => {
    const off = hitData.get(img);
    if (!off) return;
    const overInk = isOverInk(img, off, e);
    img.classList.toggle('hovered', overInk);
  });

  img.addEventListener('mouseleave', () => img.classList.remove('hovered'));
});

// --- Session + locking via Azure ---
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get("session");

if (!sessionId) {
  alert("No session ID found. Please join or create a session first.");
  window.location.href = "session.html";
}

const deviceToken = localStorage.getItem("deviceToken") || crypto.randomUUID();

async function refreshLocks() {
  try {
    const sess = await getSession(sessionId);
    const taken = sess?.locks || {};
    document.querySelectorAll(".character").forEach(el => {
      const key = el.getAttribute("data-char");
      if (taken[key]) el.classList.add("locked");
      else el.classList.remove("locked");
    });
  } catch (e) {
    // fail quietly to avoid UI spam during transient errors
    console.debug("refreshLocks error:", e.message);
  }
}
setInterval(refreshLocks, 1000);
refreshLocks();

document.querySelectorAll(".character").forEach(charEl => {
  charEl.addEventListener("click", async (e) => {
    // block transparent clicks
    const off = hitData.get(charEl);
    if (!off || !isOverInk(charEl, off, e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const selectedChar = charEl.getAttribute("data-char");
    try {
      const res = await lockCharacter(sessionId, selectedChar, deviceToken);
      if (!res || !res.locks || res.locks[selectedChar] !== deviceToken) {
        alert("Sorry, this character is already taken.");
        return;
      }
      window.location.href = `canvas.html?char=${selectedChar}&session=${sessionId}`;
    } catch (err) {
      alert("Failed to lock character. It may already be taken.");
    }
  }, true);
});
