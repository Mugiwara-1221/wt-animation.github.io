
// storyboard.js (module)

// -----------------------------
// 1) SLIDESHOW (background)
// -----------------------------
const qs = new URLSearchParams(location.search);
const selectedStory =
  (qs.get('story') || localStorage.getItem('selectedStory') || 'tortoise-hare').toLowerCase();

// Tell us how many slides each story has:
const STORY_SLIDE_COUNTS = {
  'tortoise-hare': 6,
  'lion-and-mouse': 5,
  // add more later, e.g. 'story-3': 4
};

// Build the slide list dynamically based on count
function buildSlidePaths(storyId) {
  const count = STORY_SLIDE_COUNTS[storyId] || 1; // fallback: 1 slide
  return Array.from({ length: count }, (_, i) =>
    `images/stories/${storyId}/slide${i + 1}.png`
  );
}

const slides = buildSlidePaths(selectedStory);

// Scene image is your “background”
const scene = document.getElementById('scene');

// Add Next/Back controls if not in HTML already
(function ensureControls() {
  if (document.getElementById('sb-controls')) return;
  const wrap = document.createElement('div');
  wrap.id = 'sb-controls';
  wrap.style.cssText =
    'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);display:flex;gap:10px;z-index:5';
  wrap.innerHTML = `
    <button id="sb-prev" style="padding:8px 14px;border-radius:10px;border:1px solid #ccd3ea;cursor:pointer">◀ Back</button>
    <button id="sb-next" style="padding:8px 14px;border-radius:10px;border:1px solid #ccd3ea;cursor:pointer">Next ▶</button>
  `;
  document.body.appendChild(wrap);
})();
const prevBtn = document.getElementById('sb-prev');
const nextBtn = document.getElementById('sb-next');

let slideIndex = 0;
function preload(src) { const img = new Image(); img.src = src; }
slides.forEach(preload);

function showSlide(i) {
  slideIndex = ((i % slides.length) + slides.length) % slides.length;
  scene.src = slides[slideIndex];
}
showSlide(0);

prevBtn?.addEventListener('click', () => showSlide(slideIndex - 1));
nextBtn?.addEventListener('click', () => showSlide(slideIndex + 1));
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') showSlide(slideIndex + 1);
  if (e.key === 'ArrowLeft')  showSlide(slideIndex - 1);
});

// -----------------------------
// 2) CHARACTER ANIMATION LAYER
// -----------------------------
const selectedChar =
  (qs.get("char") || localStorage.getItem("selectedCharacter") || "tortoise").toLowerCase();
const coloredDataURL = localStorage.getItem("coloredCharacter") || null;

const cvs = document.getElementById("animCanvas");
const ctx = cvs.getContext("2d");

const FRAME_PATHS = [1,2,3,4].map(i => `images/frames/${selectedChar}/${selectedChar}${i}.png`);
const MASK_PATHS  = [1,2,3,4].map(i => `images/frames/${selectedChar}/${selectedChar}_mask_${i}.csv`);

function fitCanvasToCSSBox() {
  const rect = cvs.getBoundingClientRect();
  const dpr  = window.devicePixelRatio || 1;
  cvs.width  = Math.max(1, Math.round(rect.width  * dpr));
  cvs.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvasToCSSBox();
let _needRebuildMasks = false;
addEventListener("resize", () => { fitCanvasToCSSBox(); _needRebuildMasks = true; });

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
async function matrixToMaskBitmapScaled(mat, srcW, srcH, targetW, targetH) {
  const offSrc = new OffscreenCanvas(srcW, srcH);
  const cSrc   = offSrc.getContext("2d");
  const imgData = cSrc.createImageData(srcW, srcH);
  let k = 0;
  for (let y = 0; y < srcH; y++) {
    const row = mat[y];
    for (let x = 0; x < srcW; x++) {
      const id = row?.[x] || 0;
      imgData.data[k++] = 255;
      imgData.data[k++] = 255;
      imgData.data[k++] = 255;
      imgData.data[k++] = id > 0 ? 255 : 0;
    }
  }
  cSrc.putImageData(imgData, 0, 0);

  const offTgt = new OffscreenCanvas(targetW, targetH);
  const cTgt   = offTgt.getContext("2d");
  cTgt.imageSmoothingEnabled = false;
  cTgt.drawImage(offSrc, 0, 0, targetW, targetH);
  return offTgt.transferToImageBitmap();
}

let outlineFrames = [];
let masks = [];
let _srcMaskData = [];

async function buildMasksToCanvasSize() {
  masks = [];
  for (const { mat, W, H } of _srcMaskData) {
    const bmp = await matrixToMaskBitmapScaled(mat, W, H, cvs.width, cvs.height);
    masks.push(bmp);
  }
}

(async function run() {
  outlineFrames = await Promise.all(FRAME_PATHS.map(loadImage));

  _srcMaskData = [];
  for (const mpath of MASK_PATHS) {
    const data = await loadCSVMatrix(mpath);
    _srcMaskData.push(data);
  }
  await buildMasksToCanvasSize();

  let coloredFrames = null;
  try {
    const arr = JSON.parse(localStorage.getItem("coloredCharacterFrames") || "null");
    if (Array.isArray(arr) && arr.length === 4) {
      coloredFrames = await Promise.all(arr.map(loadImage));
    }
  } catch (_) {}
  const coloredSingle = (!coloredFrames && coloredDataURL) ? await loadImage(coloredDataURL) : null;

  let i = 0, last = 0;
  async function tick(ts) {
    if (_needRebuildMasks) {
      _needRebuildMasks = false;
      await buildMasksToCanvasSize();
    }
    if (ts - last > 250) {
      last = ts;
      ctx.clearRect(0, 0, cvs.width, cvs.height);

      if (coloredFrames) {
        ctx.drawImage(coloredFrames[i], 0, 0, cvs.width, cvs.height);
      } else if (coloredSingle) {
        ctx.drawImage(coloredSingle, 0, 0, cvs.width, cvs.height);
        ctx.globalCompositeOperation = "destination-in";
        if (masks[i]) ctx.drawImage(masks[i], 0, 0);
        ctx.globalCompositeOperation = "source-over";
      }

      ctx.drawImage(outlineFrames[i], 0, 0, cvs.width, cvs.height);

      i = (i + 1) % outlineFrames.length;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
