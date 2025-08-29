
// storyboard.js — multi-slide, per-character, per-slide animation

// ───────── context & params ─────────
const qs      = new URLSearchParams(location.search);
const storyId = (qs.get('story') || localStorage.getItem('selectedStory') || 'tortoise-hare');
const slideIx = Math.max(0, Math.min(+qs.get('slide') || 0, 999)); // clamped after load
const selectedChar = (qs.get('char') || localStorage.getItem('selectedCharacter') || '').toLowerCase();

const coloredSingle = localStorage.getItem('coloredCharacter') || null;
let coloredFrames = null;
try {
  const arr = JSON.parse(localStorage.getItem('coloredCharacterFrames') || 'null');
  if (Array.isArray(arr) && arr.length) coloredFrames = arr;
} catch(_) {}

const scene = document.getElementById('scene');
const layerHost = document.getElementById('charHost');

// ───────── utilities ─────────
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
  return rows.map(r => r.split(',').map(v => +v));
}

/** Build a mask bitmap; targetW/H are device-pixel canvas size. */
async function matrixToMaskBitmapScaled(mat, srcW, srcH, targetW, targetH) {
  const offSrc = new OffscreenCanvas(srcW, srcH);
  const cSrc   = offSrc.getContext('2d', { willReadFrequently:true });
  const imgData = cSrc.createImageData(srcW, srcH);
  let k = 0;
  for (let y=0; y<srcH; y++){
    const row = mat[y];
    for (let x=0; x<srcW; x++){
      const id = row?.[x] || 0;
      imgData.data[k++] = 255;
      imgData.data[k++] = 255;
      imgData.data[k++] = 255;
      imgData.data[k++] = id>0 ? 255 : 0;
    }
  }
  cSrc.putImageData(imgData,0,0);

  const offTgt = new OffscreenCanvas(targetW, targetH);
  const cTgt = offTgt.getContext('2d');
  cTgt.imageSmoothingEnabled = false;
  cTgt.drawImage(offSrc, 0, 0, targetW, targetH);
  return offTgt.transferToImageBitmap();
}

const pct = n => `${n}%`;

// Fit a canvas to its CSS size (HiDPI aware, draw using CSS pixels)
function fitCanvasToCSS(cvs){
  const r = cvs.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  cvs.width  = Math.max(1, Math.round(r.width * dpr));
  cvs.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = cvs.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // all subsequent draw sizes are CSS pixels
  return ctx;
}

// ───────── caches ─────────
const frameCache = new Map(); // key: `${char}:${framesPath}:${count}`
const maskCache  = new Map(); // key: `${char}:${maskPrefix}:${count}`

async function getFrames(charId, framesPath, frameCount) {
  const key = `${charId}:${framesPath}:${frameCount}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const images = await Promise.all(
    Array.from({length: frameCount}, (_,i)=>loadImage(`${framesPath}${i+1}.png`))
  );
  const out = { images, w: images[0]?.naturalWidth||600, h: images[0]?.naturalHeight||600 };
  frameCache.set(key, out);
  return out;
}

async function getMasks(charId, maskPrefix, frameCount) {
  const key = `${charId}:${maskPrefix}:${frameCount}`;
  if (maskCache.has(key)) return maskCache.get(key);
  const mats = await Promise.all(
    Array.from({length: frameCount}, (_,i)=>loadCSVMatrix(`${maskPrefix}${i+1}.csv`))
  );
  const H = mats[0].length, W = mats[0][0].length;
  const out = { mats, srcW: W, srcH: H };
  maskCache.set(key, out);
  return out;
}

// ───────── scene & slides manifest ─────────
let manifest = null;          // loaded stories/<story>/slides.json
let currentSlide = 0;
const animLoops = new Set();  // cancel functions for per-character animation

function setTitle() {
  const h2 = document.querySelector('h2');
  if (!h2) return;
  const title = manifest?.storyTitle || 'Story';
  h2.textContent = `Story Scene: ${title}`;
}

function setSceneBackground(path) {
  scene.src = path;
}

// Clear all character canvases & cancel loops
function clearCharacters() {
  for (const stop of animLoops) try { stop(); } catch {}
  animLoops.clear();
  layerHost.innerHTML = '';
}

// Create one character layer (canvas) and start its animation
async function placeAnimatedCharacter(slide, charCfg) {
  // { id, x, y, w, z, fps, framesPath, frameCount, maskCsvPrefix? }
  const { id, x, y, w, z=1, fps=4, framesPath, frameCount, maskCsvPrefix } = charCfg;

  // Build canvas
  const cvs = document.createElement('canvas');
  cvs.className = `char-layer ${id}`;
  Object.assign(cvs.style, {
    position: 'absolute',
    left: pct(x), top: pct(y),
    width: pct(w), height: 'auto',
    zIndex: String(z),
    pointerEvents: 'none'
  });
  layerHost.appendChild(cvs);

  // Size it now, and whenever the scene resizes
  const ctx = fitCanvasToCSS(cvs);
  const resizeObs = new ResizeObserver(()=>fitCanvasToCSS(cvs));
  resizeObs.observe(cvs);

  // Load frames (+ masks if we need to mask a single colored layer)
  const { images:frames } = await getFrames(id, framesPath, frameCount);

  // Student color use cases
  const isStudentChar = selectedChar === id;
  const hasPerFrameColor = isStudentChar && Array.isArray(coloredFrames) && coloredFrames.length >= frameCount;
  const coloredImgs = hasPerFrameColor
    ? await Promise.all(coloredFrames.slice(0,frameCount).map(loadImage))
    : (isStudentChar && coloredSingle ? [await loadImage(coloredSingle)] : null);

  // Mask data if we must trim a single colored layer per frame
  let maskData = null;
  if (!hasPerFrameColor && coloredImgs && maskCsvPrefix) {
    maskData = await getMasks(id, maskCsvPrefix, frameCount);
  }

  // Animation loop (DPR-safe drawing: always use CSS sizes)
  let idx = 0;
  const frameMs = 1000 / Math.max(1, fps);
  let last = 0, rafId = 0, cancelled=false;

  function tick(ts){
    if (cancelled) return;
    if (ts - last >= frameMs) {
      last = ts;

      const cssW = cvs.clientWidth  || layerHost.clientWidth;
      const cssH = cvs.clientHeight || layerHost.clientHeight;

      ctx.clearRect(0,0,cssW,cssH);

      if (hasPerFrameColor) {
        ctx.drawImage(coloredImgs[idx], 0, 0, cssW, cssH);
      } else if (coloredImgs) {
        ctx.drawImage(coloredImgs[0], 0, 0, cssW, cssH);
        if (maskData) {
          // build mask in device pixels, but DRAW at CSS size
          matrixToMaskBitmapScaled(
            maskData.mats[idx], maskData.srcW, maskData.srcH, cvs.width, cvs.height
          ).then(bmp => {
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(bmp, 0, 0, cssW, cssH);
            ctx.globalCompositeOperation = 'source-over';
          });
        }
      }

      // outline on top
      ctx.drawImage(frames[idx], 0, 0, cssW, cssH);

      idx = (idx + 1) % frames.length;
    }
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  // cancel function for this character
  const stop = () => { cancelled = true; cancelAnimationFrame(rafId); resizeObs.disconnect(); };
  animLoops.add(stop);
}

// Show a slide (background + characters)
async function showSlide(ix) {
  if (!manifest) return;
  currentSlide = Math.max(0, Math.min(ix, manifest.slides.length - 1));

  const s = manifest.slides[currentSlide];

  // background
  setSceneBackground(s.background);

  // characters
  clearCharacters();
  for (const c of (s.characters || [])) {
    const charId = c.id;
    const basePath = c.framesPath || `images/frames/${charId}/${charId}`;
    const masksPrefix = c.maskCsvPrefix || `images/frames/${charId}/${charId}_mask_`;
    await placeAnimatedCharacter(s, {
      id: charId,
      x: c.x, y: c.y, w: c.w, z: c.z || 1,
      fps: c.fps || 4,
      framesPath: basePath,
      frameCount: c.frameCount || 4,
      maskCsvPrefix: masksPrefix
    });
  }

  // update query (so refresh keeps slide)
  const url = new URL(location.href);
  url.searchParams.set('story', storyId);
  url.searchParams.set('slide', currentSlide);
  history.replaceState({}, '', url);
}

// Navigation helpers (also used by the buttons in HTML)
function nextSlide(){ if (manifest) showSlide(Math.min(currentSlide+1, manifest.slides.length-1)); }
function prevSlide(){ if (manifest) showSlide(Math.max(currentSlide-1, 0)); }
Object.assign(window, { nextSlide, prevSlide, showSlide });

// ───────── dev: quick position tweak (drag with Alt key) ─────────
(function enableDevDrag(){
  let drag = null;
  layerHost.addEventListener('pointerdown', e=>{
    if (!e.altKey) return;                // hold Alt to drag
    const el = e.target.closest('.char-layer');
    if (!el) return;
    e.preventDefault();
    const hostRect = layerHost.getBoundingClientRect();
    const start = { x:e.clientX, y:e.clientY };
    const rect = el.getBoundingClientRect();
    const startPos = { left: rect.left - hostRect.left, top: rect.top - hostRect.top };
    const id = [...el.classList].find(c => c!=='char-layer');
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
    console.log(`// slide ${currentSlide+1}, ${drag.id} new pos:`, { id:drag.id, x:+nx.toFixed(2), y:+ny.toFixed(2) });
    drag = null;
  });
})();

// ───────── boot ─────────
(async function boot(){
  // load manifest
  const url = `stories/${storyId}/slides.json`;
  manifest = await (await fetch(url)).json();
  setTitle();
  await showSlide(Math.min(slideIx, manifest.slides.length-1));

  // keyboard nav
  addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft')  prevSlide();
  });
})();
