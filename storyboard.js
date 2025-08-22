// storyboard.js (module)
const params = new URLSearchParams(location.search);
const selectedChar =
  (params.get("char") || localStorage.getItem("selectedCharacter") || "tortoise").toLowerCase();
const coloredDataURL = localStorage.getItem("coloredCharacter") || null;

const scene = document.getElementById("scene");
const cvs   = document.getElementById("animCanvas");
const ctx   = cvs.getContext("2d");

const FRAME_PATHS = [1,2,3,4].map(i => `images/frames/${selectedChar}/${selectedChar}${i}.png`);
const MASK_PATHS  = [1,2,3,4].map(i => `images/frames/${selectedChar}/${selectedChar}_mask_${i}.csv`);

// --- sizing to sit exactly over #scene (HiDPI-aware) ---
function fitCanvasOverScene() {
  const rect = scene.getBoundingClientRect();
  const dpr  = window.devicePixelRatio || 1;
  cvs.style.width  = rect.width  + "px";
  cvs.style.height = rect.height + "px";
  cvs.width  = Math.round(rect.width  * dpr);
  cvs.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const wrapperRect = scene.parentElement.getBoundingClientRect();
  cvs.style.left = (scene.offsetLeft) + "px";
  cvs.style.top  = (scene.offsetTop)  + "px";
}
fitCanvasOverScene();
addEventListener("resize", fitCanvasOverScene);

// --- helpers ---
function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

async function loadCSVMatrix(url) {
  const text = await (await fetch(url)).text();
  const rows = text.trim().split(/\r?\n/);
  const mat  = rows.map(r => r.split(",").map(v => +v));
  const H = mat.length, W = mat[0]?.length || 0;
  return { mat, W, H };
}

/**
 * Build an ImageBitmap alpha mask from a matrix of IDs (mat[H][W]),
 * then SCALE it to (targetW x targetH) so it matches our canvas size.
 */
async function matrixToMaskBitmapScaled(mat, srcW, srcH, targetW, targetH) {
  // 1) build at source size
  const offSrc = new OffscreenCanvas(srcW, srcH);
  const cSrc   = offSrc.getContext("2d", { willReadFrequently: false });
  const imgData = cSrc.createImageData(srcW, srcH);
  let k = 0;
  for (let y = 0; y < srcH; y++) {
    const row = mat[y];
    for (let x = 0; x < srcW; x++) {
      const id = row?.[x] || 0;
      imgData.data[k++] = 255;
      imgData.data[k++] = 255;
      imgData.data[k++] = 255;
      imgData.data[k++] = id > 0 ? 255 : 0; // alpha
    }
  }
  cSrc.putImageData(imgData, 0, 0);

  // 2) scale to target size
  const offTgt = new OffscreenCanvas(targetW, targetH);
  const cTgt   = offTgt.getContext("2d");
  cTgt.imageSmoothingEnabled = false;
  cTgt.drawImage(offSrc, 0, 0, targetW, targetH);
  return offTgt.transferToImageBitmap();
}

async function bitmapToDataURL(bitmap) {
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const g = c.getContext("2d");
  g.drawImage(bitmap, 0, 0);
  if (c.convertToBlob) {
    const blob = await c.convertToBlob({ type: "image/png" });
    return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  }
  return await new Promise(r => c.toBlob(b => { const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(b); }, "image/png"));
}

// --- main ---
(async function run() {
  // Load outline frames
  const outlineFrames = await Promise.all(FRAME_PATHS.map(loadImage));

  // Load masks (and scale each to canvas size)
  const masks = [];
  for (const mpath of MASK_PATHS) {
    const { mat, W, H } = await loadCSVMatrix(mpath);        // W=cols, H=rows from CSV
    const maskBmp = await matrixToMaskBitmapScaled(mat, W, H, cvs.width, cvs.height);
    masks.push(maskBmp);
  }

  // Load colored layer (student paint)
  const colored = coloredDataURL ? await loadImage(coloredDataURL) : null;

  // Animation loop (~4 fps)
  let i = 0, last = 0;
  function tick(ts) {
    if (ts - last > 250) {
      last = ts;

      // 1) start with student's color
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      if (colored) ctx.drawImage(colored, 0, 0, cvs.width, cvs.height);

      // 2) clip color to current frame's mask
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(masks[i], 0, 0);
      ctx.globalCompositeOperation = "source-over";

      // 3) draw current outline frame on top
      const frame = outlineFrames[i];
      ctx.drawImage(frame, 0, 0, cvs.width, cvs.height);

      // next frame
      i = (i + 1) % outlineFrames.length;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

// Optional cleanup so refreshes don’t duplicate prior color
// localStorage.removeItem("coloredCharacter");
// localStorage.removeItem("selectedCharacter");


// storyboard.js (presentation version using GIFs)
// If the student just colored a character, replace that character's GIF with their PNG.
// Everyone else stays animated via GIF for a simple, reliable demo.
/*
const coloredDataURL = localStorage.getItem("coloredCharacter");
const selectedChar = (localStorage.getItem("selectedCharacter") || "").toLowerCase();

// Swap the chosen character's image source to the student's colored PNG (if present)
if (coloredDataURL && selectedChar) {
  const el = document.querySelector(`.character[data-char="${selectedChar}"]`);
  if (el) {
    el.src = coloredDataURL;       // replace GIF with colored PNG
    el.setAttribute("data-colored", "true");
  }
}

// Optional: clear after applying so refresh shows only server-fed results later
localStorage.removeItem("coloredCharacter");
localStorage.removeItem("selectedCharacter");


/*


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

*/
