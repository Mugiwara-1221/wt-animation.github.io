
// storyboard.js — multi-slide, per-character, per-slide animation
// Fixes: (1) mask alignment by scaling to CSS size, (2) no delay: preload everything in parallel and draw first frame immediately.

const qs      = new URLSearchParams(location.search);
const storyId = (qs.get('story') || localStorage.getItem('selectedStory') || 'tortoise-hare');
const initialSlide = Math.max(0, +qs.get('slide') || 0);

const selectedChar  = (qs.get('char') || localStorage.getItem('selectedCharacter') || '').toLowerCase();
const coloredSingle = localStorage.getItem('coloredCharacter') || null;
let coloredFrames = null;
try {
  const arr = JSON.parse(localStorage.getItem('coloredCharacterFrames') || 'null');
  if (Array.isArray(arr) && arr.length) coloredFrames = arr;
} catch (_) {}

const scene = document.getElementById('scene');

// Host for character layers
let layerHost = document.getElementById('charHost');
if (!layerHost) {
  layerHost = document.createElement('div');
  layerHost.id = 'charHost';
  Object.assign(layerHost.style, {
    position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none'
  });
  scene.parentElement.appendChild(layerHost);
}

/* ───────── utilities ───────── */
function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Failed to load ' + src));
    im.src = src;
  });
}
async function loadCSVMatrix(url) {
  const text = await (await fetch(url)).text();
  return text.trim().split(/\r?\n/).map(r => r.split(',').map(v => +v));
}
// Build an alpha ImageBitmap from a CSV ID-matrix, scaled to CSS pixels:
async function matrixToMaskBitmapScaled(mat, srcW, srcH, cssW, cssH) {
  const offSrc = new OffscreenCanvas(srcW, srcH);
  const cSrc   = offSrc.getContext('2d', { willReadFrequently: true });
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

  const offTgt = new OffscreenCanvas(Math.max(1, Math.round(cssW)), Math.max(1, Math.round(cssH)));
  const cTgt = offTgt.getContext('2d');
  cTgt.imageSmoothingEnabled = false;
  cTgt.drawImage(offSrc, 0, 0, offTgt.width, offTgt.height);
  return offTgt.transferToImageBitmap();
}

// Fit a canvas backing store to its CSS size (HiDPI aware)
function fitCanvasToCSS(cvs) {
  const r = cvs.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  cvs.width  = Math.max(1, Math.round(r.width  * dpr));
  cvs.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = cvs.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}
const pct = n => `${n}%`;

/* ───────── caches ───────── */
const frameCache = new Map(); // key: `${char}:${framesPath}:${count}`
const maskSrcCache = new Map(); // key: `${char}:${maskPrefix}:${count}` -> { mats, srcW, srcH }
const maskScaledCache = new Map(); // key: `${char}:${maskPrefix}:${ix}:${w}x${h}` -> ImageBitmap

async function getFrames(charId, framesPath, frameCount) {
  const key = `${charId}:${framesPath}:${frameCount}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const images = await Promise.all(
    Array.from({ length: frameCount }, (_, i) => loadImage(`${framesPath}${i + 1}.png`))
  );
  const out = { images };
  frameCache.set(key, out);
  return out;
}
async function getMaskSrc(charId, maskPrefix, frameCount) {
  const key = `${charId}:${maskPrefix}:${frameCount}`;
  if (maskSrcCache.has(key)) return maskSrcCache.get(key);
  const mats = await Promise.all(
    Array.from({ length: frameCount }, (_, i) => loadCSVMatrix(`${maskPrefix}${i + 1}.csv`))
  );
  const H = mats[0].length, W = mats[0][0].length;
  const out = { mats, srcW: W, srcH: H, key };
  maskSrcCache.set(key, out);
  return out;
}

/* ───────── scene & slides manifest ───────── */
let manifest = null;
let currentSlide = 0;
const animLoops = new Set();

function setTitle() {
  const h2 = document.querySelector('h2');
  if (h2) h2.textContent = `Story Scene: ${manifest?.storyTitle || 'Story'}`;
}

function clearCharacters() {
  for (const stop of animLoops) { try { stop(); } catch {} }
  animLoops.clear();
  layerHost.innerHTML = '';
}

/* Create a character canvas and start animation; resolves once the first frame is drawn */
async function placeAnimatedCharacter(charCfg) {
  const { id, x, y, w, z = 1, fps = 4, framesPath, frameCount, maskCsvPrefix } = charCfg;

  // Canvas layer
  const cvs = document.createElement('canvas');
  cvs.className = `char-layer ${id}`;
  Object.assign(cvs.style, {
    position: 'absolute', left: pct(x), top: pct(y), width: pct(w), height: 'auto', zIndex: String(z), pointerEvents: 'none'
  });
  layerHost.appendChild(cvs);
  const ctx = fitCanvasToCSS(cvs);
  const resizeObs = new ResizeObserver(() => fitCanvasToCSS(cvs));
  resizeObs.observe(cvs);

  // Load all assets in parallel
  const [{ images: frames }, colorImgs, maskSrc] = await Promise.all([
    getFrames(id, framesPath, frameCount),
    (async () => {
      const isStudent = selectedChar === id;
      const hasPF = isStudent && Array.isArray(coloredFrames) && coloredFrames.length >= frameCount;
      if (hasPF) return Promise.all(coloredFrames.slice(0, frameCount).map(loadImage));
      if (isStudent && coloredSingle) return [await loadImage(coloredSingle)];
      return null;
    })(),
    (async () => {
      if (maskCsvPrefix && (!colorImgs || colorImgs.length === 1)) {
        return getMaskSrc(id, maskCsvPrefix, frameCount);
      }
      return null;
    })(),
  ]);

  // Helper: get (or build) a scaled mask bitmap that matches the canvas's CSS size
  async function getScaledMask(ix) {
    if (!maskSrc) return null;
    const r = cvs.getBoundingClientRect();
    const key = `${maskSrc.key}:${ix}:${Math.round(r.width)}x${Math.round(r.height)}`;
    if (maskScaledCache.has(key)) return maskScaledCache.get(key);
    const bmp = await matrixToMaskBitmapScaled(maskSrc.mats[ix], maskSrc.srcW, maskSrc.srcH, r.width, r.height);
    maskScaledCache.set(key, bmp);
    return bmp;
  }

  // Draw one frame immediately (no 250ms wait)
  async function drawFrame(ix) {
    const r = cvs.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);

    if (colorImgs) {
      if (colorImgs.length > 1) {
        ctx.drawImage(colorImgs[ix], 0, 0, r.width, r.height);
      } else {
        ctx.drawImage(colorImgs[0], 0, 0, r.width, r.height);
        const bmp = await getScaledMask(ix);
        if (bmp) {
          ctx.globalCompositeOperation = 'destination-in';
          ctx.drawImage(bmp, 0, 0, r.width, r.height);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
    ctx.drawImage(frames[ix], 0, 0, r.width, r.height);
  }

  // First render now
  await drawFrame(0);

  // Start loop
  let idx = 1 % frameCount;
  const frameMs = 1000 / Math.max(1, fps);
  let last = performance.now();
  let rafId = 0, cancelled = false;

  async function tick(ts) {
    if (cancelled) return;
    if (ts - last >= frameMs) {
      last = ts;
      await drawFrame(idx);
      idx = (idx + 1) % frameCount;
    }
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  const stop = () => { cancelled = true; cancelAnimationFrame(rafId); resizeObs.disconnect(); };
  animLoops.add(stop);
}

/* Show a slide: preload background + all characters in parallel, then reveal */
async function showSlide(ix) {
  if (!manifest) return;
  currentSlide = Math.max(0, Math.min(ix, manifest.slides.length - 1));
  const s = manifest.slides[currentSlide];

  // Preload background first so we know dimensions
  const bg = await loadImage(s.background);
  scene.src = bg.src;

  // Wipe prior characters and place all for this slide IN PARALLEL (no sequential wait)
  clearCharacters();
  const promises = (s.characters || []).map(c => {
    const basePath   = c.framesPath || `images/frames/${c.id}/${c.id}`;
    const masksPref  = c.maskCsvPrefix || `images/frames/${c.id}/${c.id}_mask_`;
    return placeAnimatedCharacter({
      id: c.id, x: c.x, y: c.y, w: c.w, z: c.z || 1,
      fps: c.fps || 4,
      framesPath: basePath,
      frameCount: c.frameCount || 4,
      maskCsvPrefix: masksPref
    });
  });
  await Promise.all(promises); // ensure first frame of each is drawn

  // Persist slide index in URL
  const url = new URL(location.href);
  url.searchParams.set('story', storyId);
  url.searchParams.set('slide', currentSlide);
  history.replaceState({}, '', url);
}

function nextSlide() { if (manifest) showSlide(Math.min(currentSlide + 1, manifest.slides.length - 1)); }
function prevSlide() { if (manifest) showSlide(Math.max(currentSlide - 1, 0)); }
Object.assign(window, { nextSlide, prevSlide, showSlide });

// Drag-to-tweak positions (Alt + drag)
(function enableDevDrag(){
  let drag = null;
  layerHost.addEventListener('pointerdown', e=>{
    if (!e.altKey) return;
    const el = e.target.closest('.char-layer');
    if (!el) return;
    e.preventDefault();
    const hostRect = layerHost.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    const rect = el.getBoundingClientRect();
    const startPos = { left: rect.left - hostRect.left, top: rect.top - hostRect.top };
    const id = [...el.classList].find(c => c !== 'char-layer');
    drag = { el, id, hostRect, start, startPos };
    el.setPointerCapture(e.pointerId);
  });
  layerHost.addEventListener('pointermove', e=>{
    if (!drag) return;
    const dx = e.clientX - drag.start.x;
    const dy = e.clientY - drag.start.y;
    const nx = ((drag.startPos.left + dx) / drag.hostRect.width) * 100;
    const ny = ((drag.startPos.top  + dy) / drag.hostRect.height) * 100;
    drag.el.style.left = pct(Math.max(0, Math.min(100, nx)));
    drag.el.style.top  = pct(Math.max(0, Math.min(100, ny)));
  });
  layerHost.addEventListener('pointerup', ()=>{
    if (!drag) return;
    const rect = drag.el.getBoundingClientRect();
    const nx = ((rect.left - drag.hostRect.left) / drag.hostRect.width) * 100;
    const ny = ((rect.top  - drag.hostRect.top ) / drag.hostRect.height) * 100;
    console.log(`// slide ${currentSlide+1}, ${drag.id}: { "x": ${nx.toFixed(2)}, "y": ${ny.toFixed(2)} }`);
    drag = null;
  });
})();

// Boot
(async function boot(){
  manifest = await (await fetch(`stories/${storyId}/slides.json`)).json();
  setTitle();
  await showSlide(Math.min(initialSlide, manifest.slides.length - 1));
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft')  prevSlide();
  });
})();
