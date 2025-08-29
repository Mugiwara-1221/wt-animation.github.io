
// storyboard.js — multi-slide runtime (no pop-in, resilient to partial load)

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

// host for character layers
let layerHost = document.getElementById('charHost');
if (!layerHost) {
  layerHost = document.createElement('div');
  Object.assign(layerHost.style, {
    position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none'
  });
  scene.parentElement.appendChild(layerHost);
}

/* utils */
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
async function matrixToMaskBitmapScaled(mat, srcW, srcH, cssW, cssH) {
  const offSrc = new OffscreenCanvas(srcW, srcH);
  const cSrc   = offSrc.getContext('2d', { willReadFrequently: true });
  const imgData = cSrc.createImageData(srcW, srcH);
  let k = 0;
  for (let y=0; y<srcH; y++){
    const row = mat[y];
    for (let x=0; x<srcW; x++){
      const id = row?.[x] || 0;
      imgData.data[k++] = 255; imgData.data[k++] = 255; imgData.data[k++] = 255;
      imgData.data[k++] = id>0 ? 255 : 0;
    }
  }
  cSrc.putImageData(imgData,0,0);
  const offTgt = new OffscreenCanvas(Math.max(1, Math.round(cssW)), Math.max(1, Math.round(cssH)));
  const cTgt = offTgt.getContext('2d');
  cTgt.imageSmoothingEnabled = false;
  cTgt.drawImage(offSrc, 0, 0, offTgt.width, offTgt.height);
  return offTgt.transferToImageBitmap();
}
function fitCanvasToCSS(cvs){
  const r = cvs.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  cvs.width  = Math.max(1, Math.round(r.width  * dpr));
  cvs.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = cvs.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}
const pct = n => `${n}%`;

/* caches */
const frameCache = new Map();      // `${id}:${path}:${count}` -> { images[] }
const maskSrcCache = new Map();    // `${id}:${prefix}:${count}` -> { mats[], srcW, srcH, key }
const maskScaledCache = new Map(); // `${maskSrc.key}:${ix}:${w}x${h}` -> ImageBitmap

async function getFrames(id, path, count){
  const key = `${id}:${path}:${count}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const images = await Promise.all(Array.from({length:count},(_,i)=>loadImage(`${path}${i+1}.png`)));
  const out = { images };
  frameCache.set(key, out);
  return out;
}
async function getMaskSrc(id, prefix, count){
  const key = `${id}:${prefix}:${count}`;
  if (maskSrcCache.has(key)) return maskSrcCache.get(key);
  const mats = await Promise.all(Array.from({length:count},(_,i)=>loadCSVMatrix(`${prefix}${i+1}.csv`)));
  const H = mats[0].length, W = mats[0][0].length;
  const out = { mats, srcW: W, srcH: H, key };
  maskSrcCache.set(key, out); return out;
}

/* manifest / slides */
let manifest = null;
let currentSlide = 0;
const animLoops = new Set();

function setTitle(){
  const h2 = document.querySelector('h2');
  if (h2) h2.textContent = `Story Scene: ${manifest?.storyTitle || 'Story'}`;
}
function clearCharacters(){
  for (const stop of animLoops) { try { stop(); } catch {} }
  animLoops.clear();
  layerHost.innerHTML = '';
}

/* one character layer; resolves after first frame is drawn */
async function placeAnimatedCharacter(c){
  const { id, x, y, w, z=1, fps=4, framesPath, frameCount, maskCsvPrefix } = c;

  const cvs = document.createElement('canvas');
  cvs.className = `char-layer ${id}`;
  Object.assign(cvs.style, { position:'absolute', left:pct(x), top:pct(y), width:pct(w), height:'auto', zIndex:String(z), pointerEvents:'none' });
  layerHost.appendChild(cvs);
  const ctx = fitCanvasToCSS(cvs);
  const ro = new ResizeObserver(()=>fitCanvasToCSS(cvs));
  ro.observe(cvs);

  // Load everything in parallel, but don't fail the whole slide if this one fails
  try {
    const [{ images:frames }, colorImgs, maskSrc] = await Promise.all([
      getFrames(id, framesPath, frameCount),
      (async () => {
        const isMe = selectedChar === id;
        const hasPF = isMe && Array.isArray(coloredFrames) && coloredFrames.length >= frameCount;
        if (hasPF) return Promise.all(coloredFrames.slice(0, frameCount).map(loadImage));
        if (isMe && coloredSingle) return [await loadImage(coloredSingle)];
        return null;
      })(),
      (async () => {
        if (maskCsvPrefix) return getMaskSrc(id, maskCsvPrefix, frameCount);
        return null;
      })(),
    ]);

    async function getScaledMask(ix){
      if (!maskSrc) return null;
      const r = cvs.getBoundingClientRect();
      const key = `${maskSrc.key}:${ix}:${Math.round(r.width)}x${Math.round(r.height)}`;
      if (maskScaledCache.has(key)) return maskScaledCache.get(key);
      const bmp = await matrixToMaskBitmapScaled(maskSrc.mats[ix], maskSrc.srcW, maskSrc.srcH, r.width, r.height);
      maskScaledCache.set(key, bmp);
      return bmp;
    }

    async function drawFrame(ix){
      const r = cvs.getBoundingClientRect();
      ctx.clearRect(0,0,r.width,r.height);
      if (colorImgs) {
        if (colorImgs.length > 1) {
          ctx.drawImage(colorImgs[ix], 0,0, r.width, r.height);
        } else {
          ctx.drawImage(colorImgs[0], 0,0, r.width, r.height);
          const bmp = await getScaledMask(ix);
          if (bmp) {
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(bmp,0,0,r.width,r.height);
            ctx.globalCompositeOperation = 'source-over';
          }
        }
      }
      ctx.drawImage(frames[ix], 0,0, r.width, r.height);
    }

    // first frame now
    await drawFrame(0);

    // loop
    let idx = 1 % frameCount;
    const frameMs = 1000 / Math.max(1, fps);
    let last = performance.now();
    let rafId = 0, cancelled = false;

    async function tick(ts){
      if (cancelled) return;
      if (ts - last >= frameMs) { last = ts; await drawFrame(idx); idx = (idx+1)%frameCount; }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    animLoops.add(() => { cancelled = true; cancelAnimationFrame(rafId); ro.disconnect(); });
  } catch (e) {
    console.warn('Character failed to place:', id, e);
    ro.disconnect();
  }
}

/* show a slide; resilient to partial failures */
async function showSlide(ix){
  if (!manifest) return;
  currentSlide = Math.max(0, Math.min(ix, manifest.slides.length-1));
  const s = manifest.slides[currentSlide];

  // load background first to size host
  try {
    const bg = await loadImage(s.background);
    scene.src = bg.src;
  } catch(e) {
    console.error('Background failed to load:', s.background, e);
    scene.removeAttribute('src');
  }

  clearCharacters();

  // place all characters in parallel; don't block if one fails
  const placements = (s.characters || []).map(cfg => {
    const base = cfg.framesPath   || `images/frames/${cfg.id}/${cfg.id}`;
    const mpfx = cfg.maskCsvPrefix || `images/frames/${cfg.id}/${cfg.id}_mask_`;
    return placeAnimatedCharacter({ ...cfg, framesPath: base, maskCsvPrefix: mpfx });
  });
  await Promise.allSettled(placements);

  // update URL + inform buttons
  const url = new URL(location.href);
  url.searchParams.set('story', storyId);
  url.searchParams.set('slide', currentSlide);
  history.replaceState({}, '', url);

  window.__slides = { index: currentSlide, count: manifest.slides.length };
  window.dispatchEvent(new Event('slidechange'));
}

function nextSlide(){ showSlide(currentSlide + 1); }
function prevSlide(){ showSlide(currentSlide - 1); }
Object.assign(window, { nextSlide, prevSlide, showSlide });

/* Boot */
(async function boot(){
  manifest = await (await fetch(`stories/${storyId}/slides.json`)).json();
  setTitle();
  await showSlide(Math.min(initialSlide, manifest.slides.length-1));

  addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft')  prevSlide();
  });
})();
