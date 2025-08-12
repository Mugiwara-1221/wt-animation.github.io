
import { getDatabase, ref, onValue, set, get } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

//

// Pixel-accurate hover & click for .character images
const characters = Array.from(document.querySelectorAll('.character'));

// build an offscreen canvas for each image once it loads
function buildHitCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  return { canvas: c, ctx: cx };
}

// return true if mouse over a non-transparent pixel
function isOverInk(img, off, evt) {
  const rect = img.getBoundingClientRect();
  // mouse position relative to the *displayed* element
  const xEl = evt.clientX - rect.left;
  const yEl = evt.clientY - rect.top;

  // scale to intrinsic pixel coords
  const scaleX = (img.naturalWidth || img.width) / rect.width;
  const scaleY = (img.naturalHeight || img.height) / rect.height;
  const x = Math.floor(xEl * scaleX);
  const y = Math.floor(yEl * scaleY);

  if (x < 0 || y < 0 || x >= off.canvas.width || y >= off.canvas.height) return false;

  const { data } = off.ctx.getImageData(x, y, 1, 1);
  const alpha = data[3];                 // 0..255
  return alpha > 10;                     // small threshold
}

const hitData = new Map(); // img -> {canvas,ctx}

characters.forEach(img => {
  // ensure intrinsic size is available
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
    img.style.pointerEvents = 'auto'; // keep events flowing
  });

  img.addEventListener('mouseleave', () => {
    img.classList.remove('hovered');
  });

  // Gate the click so you can’t select via empty pixels
  img.addEventListener('click', e => {
    const off = hitData.get(img);
    if (!off || !isOverInk(img, off, e)) {
      // ignore clicks on transparent areas
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    // proceed with your existing selection logic
    const selected = img.getAttribute('data-char') || 'unknown';
    // If you have session logic, keep it; otherwise:
    window.location.href = `canvas.html?char=${selected}`;
  }, true);
});

//

// Get session ID from query string
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get("session");

if (!sessionId) {
  alert("No session ID found. Please join or create a session first.");
  window.location.href = "session.html";
}

const db = getDatabase();
const charactersRef = ref(db, `sessions/${sessionId}/characters`);

// Load current character lock state
onValue(charactersRef, snapshot => {
  const data = snapshot.val() || {};

  document.querySelectorAll(".character").forEach(char => {
    const charKey = char.getAttribute("data-char");
    if (data[charKey]) {
      char.classList.add("locked");
    } else {
      char.classList.remove("locked");
    }
  });
});

// Handle character selection
document.querySelectorAll(".character").forEach(char => {
  char.addEventListener("click", async () => {
    const selectedChar = char.getAttribute("data-char");
    const charRef = ref(db, `sessions/${sessionId}/characters/${selectedChar}`);

    const snapshot = await get(charRef);
    if (snapshot.exists()) {
      alert("Sorry, this character is already taken.");
      return;
    }

    await set(charRef, true); // Lock character

    // Redirect to canvas with char and session
    window.location.href = `canvas.html?char=${selectedChar}&session=${sessionId}`;
  });
});

