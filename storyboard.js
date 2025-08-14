
// storyboard.js
// import { getSubmissions } from "./js/azure-api.js";

// ----- config -----
const CHAR_ORDER = ["hare", "tortoise", "bear", "squirrel", "bird1", "bird2"];

// Base art to show when there’s no colored sprite yet (static fallback).
// Use whatever assets you prefer here (white-filled or outline).
const FALLBACK_SRC = {
  hare:     "images/hare.png",
  tortoise: "images/frames/tortoise/tortoise1.png", // first outline frame as static
  bear:     "images/bear.png",
  squirrel: "images/squirrel.png",
  bird1:    "images/bird1.png",
  bird2:    "images/bird2.png",
};

// Tortoise animation frames (outline)
const TORTOISE_FRAMES = [
  "images/frames/tortoise/tortoise1.png",
  "images/frames/tortoise/tortoise2.png",
  "images/frames/tortoise/tortoise3.png",
  "images/frames/tortoise/tortoise4.png",
];
const TORTOISE_FPS = 4; // 4 frames/sec

// ----- dom refs -----
const container = document.querySelector(".scene-wrapper");

// localStorage fallback from canvas page
const coloredDataURL = localStorage.getItem("coloredCharacter") || null;
const selectedChar = (localStorage.getItem("selectedCharacter") || "").toLowerCase() || null;

// helper: create a static character image and place using CSS class
function placeStaticCharacter(char, src) {
  const img = document.createElement("img");
  img.className = `character ${char}`;
  img.alt = char;
  img.draggable = false;
  img.src = src;
  container.appendChild(img);
  return img;
}

// helper: animate tortoise by drawing student’s colored layer + outline frames
function placeAnimatedTortoise(coloredSrc) {
  // base node (invisible) so CSS positions/size are correct
  const shadow = document.createElement("img");
  shadow.className = "character tortoise";
  shadow.style.opacity = "0"; // we’ll cover it with a canvas
  shadow.alt = "tortoise-shadow";
  shadow.src = TORTOISE_FRAMES[0];
  container.appendChild(shadow);

  // overlay canvas that exactly matches the .tortoise size/position
  const cvs = document.createElement("canvas");
  cvs.id = "tortoiseAnim";
  cvs.className = "tortoise";              // reuse your .tortoise position/size rules
  cvs.style.display = "block";
  container.appendChild(cvs);

  const ctx = cvs.getContext("2d");

  // ensure canvas pixel size follows CSS size (and HiDPI)
  function syncCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = shadow.clientWidth || 600;
    const cssH = shadow.clientHeight || 600;
    cvs.style.width = cssW + "px";
    cvs.style.height = cssH + "px";
    cvs.width = Math.round(cssW * dpr);
    cvs.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // scale drawing to CSS pixels
  }
  syncCanvasSize();
  window.addEventListener("resize", syncCanvasSize);

  // load colored layer and outline frames
  const colorImg = new Image();
  colorImg.src = coloredSrc;

  Promise.all(
    TORTOISE_FRAMES.map(
      src =>
        new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = rej;
          im.src = src;
        })
    )
  ).then(frames => {
    let idx = 0;
    const frameMs = 1000 / TORTOISE_FPS;

    let last = performance.now();
    function tick(now) {
      if (now - last >= frameMs) {
        last = now;
        const w = cvs.clientWidth || 600;
        const h = cvs.clientHeight || 600;
        ctx.clearRect(0, 0, w, h);
        if (colorImg.complete) ctx.drawImage(colorImg, 0, 0, w, h); // student color
        ctx.drawImage(frames[idx], 0, 0, w, h);                     // outline frame
        idx = (idx + 1) % frames.length;
      }
      requestAnimationFrame(tick);
    }

    if (colorImg.complete) requestAnimationFrame(tick);
    else colorImg.onload = () => requestAnimationFrame(tick);
  }).catch(() => {
    // fallback: static tortoise if frames fail
    placeStaticCharacter("tortoise", coloredSrc || FALLBACK_SRC.tortoise);
  });
}

// ----- main flow -----
// For now (no backend), we place:
//  • the student’s colored character if we have it (and animate if tortoise)
//  • fallbacks for all the others so the scene is complete

// Place everyone once
for (const char of CHAR_ORDER) {
  if (char === "tortoise" && selectedChar === "tortoise" && coloredDataURL) {
    // student colored the tortoise → animate it
    placeAnimatedTortoise(coloredDataURL);
  } else if (selectedChar === char && coloredDataURL) {
    // student colored this non-tortoise → show colored static
    placeStaticCharacter(char, coloredDataURL);
  } else {
    // others → show base art
    placeStaticCharacter(char, FALLBACK_SRC[char]);
  }
}

// Clear legacy items so refreshes don’t duplicate
localStorage.removeItem("coloredCharacter");
localStorage.removeItem("selectedCharacter");
