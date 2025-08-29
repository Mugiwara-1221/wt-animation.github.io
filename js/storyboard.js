
// storyboard.js — multi-slide, per-character, per-slide animation

// ───────── context & params ─────────
const qs      = new URLSearchParams(location.search);
const storyId = (qs.get('story') || localStorage.getItem('selectedStory') || 'tortoise-hare');
const slideIx = Math.max(0, Math.min(+qs.get('slide') || 0, 999)); // clamped later to length
const selectedChar = (qs.get('char') || localStorage.getItem('selectedCharacter') || '').toLowerCase();
const coloredSingle = localStorage.getItem('coloredCharacter') || null;
let coloredFrames = null;
try {
  const arr = JSON.parse(localStorage.getItem('coloredCharacterFrames') || 'null');
  if (Array.isArray(arr) && arr.length) coloredFrames = arr;
} catch(_) {}

const scene = document.getElementById('scene');

// container for all character canvases
let layerHost = document.getElementById('charHost');
if (!layerHost) {
  layerHost = document.createElement('div');
  layerHost.id = 'charHost';
  layerHost.style.position = 'absolute';
  layerHost.style.left = '0';
  layerHost.style.top = '0';
  layerHost.style.width = '100%';
  layerHost.style.height = '100%';
  layerHost.style.pointerEvents = 'none';
  scene.parentElement.appendChild(layerHost);
}

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

// % helpers (positions are stored as % of the slide)
function pct(n){ return `${n}%`; }
function cssPx(n){ return `${n}px`; }

// Fit a canvas to its CSS size (HiDPI aware)
function fitCanvasToCSS(cvs){
  const r = cvs.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  cvs.width  = Math.max(1, Math.round(r.width * dpr));
  cvs.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = cvs.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// ───────── caches ─────────
const frameCache = new Map(); // key: `${char}:${framesPath}`, value: {images:Image[], w,h}
const maskCache  = new Map(); // key: `${char}:${maskCsvPrefix}`, per-frame raw CSV mats

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
  // store src dimensions from first mat
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
  // charCfg fields (from manifest):
  // { id, x, y, w, z, fps, framesPath, frameCount, maskCsvPrefix? }
  const { id, x, y, w, z=1, fps=4, framesPath, frameCount, maskCsvPrefix } = charCfg;

  // Build canvas
  const cvs = document.createElement('canvas');
  cvs.className = `char-layer ${id}`;
  cvs.style.position = 'absolute';
  cvs.style.left = pct(x);
  cvs.style.top  = pct(y);
  cvs.style.width = pct(w);
  cvs.style.height = 'auto';
  cvs.style.zIndex = String(z);
  cvs.style.pointerEvents = 'none';
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
  const coloredImgs = hasPerFrameColor ? await Promise.all(coloredFrames.slice(0,frameCount).map(loadImage))
                                       : (isStudentChar && coloredSingle ? [await loadImage(coloredSingle)] : null);

  // Mask data if we must trim a single colored layer per frame
  let maskData = null;
  if (!hasPerFrameColor && coloredImgs && maskCsvPrefix) {
    maskData = await getMasks(id, maskCsvPrefix, frameCount);
  }

  // Animation loop
  let idx = 0;
  const frameMs = 1000 / Math.max(1, fps);
  let last = 0, rafId = 0, cancelled=false;

  async function tick(ts){
    if (cancelled) return;
    if (ts - last >= frameMs) {
      last = ts;
      const r = cvs.getBoundingClientRect();
      ctx.clearRect(0,0,r.width,r.height);

      if (hasPerFrameColor) {
        // draw pre-masked colored frame
        ctx.drawImage(coloredImgs[idx], 0, 0, r.width, r.height);
      } else if (coloredImgs) {
        // draw single colored layer, then mask per-frame if masks available
        ctx.drawImage(coloredImgs[0], 0, 0, r.width, r.height);
        if (maskData) {
          const bmp = await matrixToMaskBitmapScaled(
            maskData.mats[idx], maskData.srcW, maskData.srcH, cvs.width, cvs.height
          );
          ctx.globalCompositeOperation = 'destination-in';
          ctx.drawImage(bmp, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      // outline on top
      ctx.drawImage(frames[idx], 0, 0, r.width, r.height);

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
    // Ensure required fields (framesPath can be absolute or relative to images/frames/<char>/)
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

// Navigation helpers (wire these to your UI buttons if you like)
function nextSlide(){ if (manifest) showSlide(Math.min(currentSlide+1, manifest.slides.length-1)); }
function prevSlide(){ if (manifest) showSlide(Math.max(currentSlide-1, 0)); }
Object.assign(window, { nextSlide, prevSlide, showSlide });

// ───────── dev: quick position tweak (drag with Alt key) ─────────
// drag a character canvas to adjust x/y (percent). logs JSON to console.
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
  layerHost.addEventListener('pointerup', e=>{
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

  // optional: wire simple keyboard nav
  addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft')  prevSlide();
  });
})();
