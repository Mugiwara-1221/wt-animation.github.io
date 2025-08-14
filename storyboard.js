
// storyboard.js
import { getSubmissions } from "./js/azure-api.js";

const container = document.querySelector(".scene-wrapper");
const fallbackImg = document.getElementById("coloredCharacter");

// Try to get session from URL, then from localStorage
const urlParams = new URLSearchParams(window.location.search);
const sessionCode = urlParams.get("session") || localStorage.getItem("sessionCode");

// Fallback to legacy localStorage single-user flow (if no server data yet)
const localColored = localStorage.getItem("coloredCharacter");
const localSelected = (localStorage.getItem("selectedCharacter") || "").toLowerCase();

function placeStaticCharacter(character, dataURL) {
  const img = document.createElement("img");
  img.src = dataURL;
  img.alt = character;
  img.className = `character ${character}`;
  img.style.zIndex = 2;
  container.appendChild(img);
}

function placeAnimatedTortoise(dataURL) {
  const frameURLs = [
    "images/frames/tortoise/tortoise1.png",
    "images/frames/tortoise/tortoise2.png",
    "images/frames/tortoise/tortoise3.png",
    "images/frames/tortoise/tortoise4.png"
  ];
  const frameMs = 300;
  const logicalW = 600;
  const logicalH = 600;

  const canvas = document.createElement("canvas");
  canvas.className = `character tortoise`;
  canvas.style.zIndex = 2;
  container.appendChild(canvas);

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(logicalW * dpr);
  canvas.height = Math.round(logicalH * dpr);
  canvas.style.width = `${logicalW}px`;
  canvas.style.height = `${logicalH}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const colorLayer = new Image();
  colorLayer.src = dataURL;

  Promise.all(frameURLs.map(src => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  }))).then(frames => {
    let i = 0;
    let last = performance.now();

    function tick(now) {
      if (now - last >= frameMs) {
        last = now;
        ctx.clearRect(0, 0, logicalW, logicalH);
        if (colorLayer.complete) ctx.drawImage(colorLayer, 0, 0, logicalW, logicalH);
        ctx.drawImage(frames[i], 0, 0, logicalW, logicalH);
        i = (i + 1) % frames.length;
      }
      requestAnimationFrame(tick);
    }

    if (colorLayer.complete) requestAnimationFrame(tick);
    else colorLayer.onload = () => requestAnimationFrame(tick);
  }).catch(err => {
    console.error("Tortoise frames failed; falling back to static:", err);
    placeStaticCharacter("tortoise", dataURL);
  });
}

async function loadFromServer() {
  if (!sessionCode) return false;

  try {
    const submissions = await getSubmissions(sessionCode);
    // Expected: [{ character: "hare"|"tortoise"|..., dataURL: "data:image/png;base64,..."}]
    if (!Array.isArray(submissions) || submissions.length === 0) return false;

    submissions.forEach(({ character, dataURL }) => {
      const key = (character || "").toLowerCase();
      if (key === "tortoise") placeAnimatedTortoise(dataURL);
      else placeStaticCharacter(key, dataURL);
    });
    return true;
  } catch (e) {
    console.error("Server submissions load failed:", e);
    return false;
  }
}

(async function init() {
  const ok = await loadFromServer();
  if (!ok) {
    // Fallback: legacy local single
    if (!localColored || !localSelected) {
      alert("No character images found yet. Please color your character first.");
      return;
    }
    if (localSelected === "tortoise") placeAnimatedTortoise(localColored);
    else placeStaticCharacter(localSelected, localColored);
  }

  // Clear legacy storage to avoid confusion on refresh
  localStorage.removeItem("coloredCharacter");
  localStorage.removeItem("selectedCharacter");
})();
