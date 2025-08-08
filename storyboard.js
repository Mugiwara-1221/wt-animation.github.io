
// import { colorAFrameAdvanced } from './js/color-map-advanced.js';

const coloredDataURL = localStorage.getItem("coloredCharacter");
const selectedChar = (localStorage.getItem("selectedCharacter") || "").toLowerCase();

const container = document.querySelector(".scene-wrapper");
const fallbackImg = document.getElementById("coloredCharacter");

if (!coloredDataURL || !selectedChar) {
  alert("No character image found. Please color your character first.");
} else if (selectedChar === "tortoise") {
  // --- CONFIG ---
  const frameURLs = [
    "images/frames/tortoise/tortoise1.png",
    "images/frames/tortoise/tortoise2.png",
    "images/frames/tortoise/tortoise3.png",
    "images/frames/tortoise/tortoise4.png"
  ];
  const frameMs = 300;
  const logicalW = 600; // internal drawing size that matches your sprite pipeline
  const logicalH = 600;

  // Canvas that will sit where the CSS puts the tortoise
  const canvas = document.createElement("canvas");
  canvas.className = `character ${selectedChar}`; // reuse your CSS: position + width/height
  canvas.style.zIndex = 2;
  container.appendChild(canvas);

  // HiDPI rendering
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(logicalW * dpr);
  canvas.height = Math.round(logicalH * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  // Load the student's color as an image
  const colorLayer = new Image();
  colorLayer.src = coloredDataURL;

  // Preload all frames first
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
        // draw: color first, outline on top
        ctx.clearRect(0, 0, logicalW, logicalH);
        if (colorLayer.complete) {
          ctx.drawImage(colorLayer, 0, 0, logicalW, logicalH);
        }
        ctx.drawImage(frames[i], 0, 0, logicalW, logicalH);
        i = (i + 1) % frames.length;
      }
      requestAnimationFrame(tick);
    }

    // Once color is ready, start animating
    if (colorLayer.complete) {
      requestAnimationFrame(tick);
    } else {
      colorLayer.onload = () => requestAnimationFrame(tick);
    }

    // Clear storage after we’ve kicked off
    localStorage.removeItem("coloredCharacter");
    localStorage.removeItem("selectedCharacter");
  }).catch(err => {
    console.error("Frame preload failed:", err);
    // Fallback: static image
    fallbackImg.src = coloredDataURL;
    fallbackImg.classList.add(selectedChar);
  });

} else {
  // Non-animated characters: show static
  fallbackImg.src = coloredDataURL;
  fallbackImg.classList.add(selectedChar);

  localStorage.removeItem("coloredCharacter");
  localStorage.removeItem("selectedCharacter");
}

