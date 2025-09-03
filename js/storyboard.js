
// js/storyboard.js — per-slide remasking so colors line up with each animation

const qs            = new URLSearchParams(location.search);
const storyId       = (qs.get("story") || localStorage.getItem("selectedStory") || "tortoise-hare").replace(/_/g,"-");
const initialSlide  = Math.max(0, +qs.get("slide") || 0);
const selectedChar  = (qs.get("char") || localStorage.getItem("selectedCharacter") || "").toLowerCase();

const scene = document.getElementById("scene");
let manifest = null;
let cur = 0;

const pct = n => `${n}%`;
function slideNoFromPath(p){
  const m = /slide(\d+)\.png/i.exec(p||"");
  return m ? parseInt(m[1],10) : null;
}

function loadImage(src){
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("Failed to load " + src));
    im.src = src;
  });
}
async function urlExists(url){
  try{ const r = await fetch(url,{cache:"no-store"}); return r.ok; }catch{ return false; }
}
function fitCanvasToCSS(cvs){
  const r = cvs.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  cvs.width  = Math.max(1, Math.round(r.width  * dpr));
  cvs.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = cvs.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

// --- CSV → mask helpers (scaled to canvas size) ---
async function loadCSVMatrix(url){
  const r = await fetch(url, { cache:"no-store" });
  if (!r.ok) throw new Error("Mask 404 " + url);
  const txt = await r.text();
  return txt.trim().split(/\r?\n/).map(r => r.split(",").map(v=>+v));
}
async function matrixToMaskBitmapScaled(mat, srcW, srcH, cssW, cssH){
  const offSrc = new OffscreenCanvas(srcW, srcH);
  const cSrc   = offSrc.getContext("2d", { willReadFrequently:true });
  const img = cSrc.createImageData(srcW, srcH);
  let k = 0;
  for (let y=0; y<srcH; y++){
    const row = mat[y];
    for (let x=0; x<srcW; x++){
      const a = row?.[x] ? 255 : 0;
      img.data[k++] = 255; img.data[k++] = 255; img.data[k++] = 255; img.data[k++] = a;
    }
  }
  cSrc.putImageData(img, 0, 0);

  const offTgt = new OffscreenCanvas(Math.max(1, Math.round(cssW)), Math.max(1, Math.round(cssH)));
  const cTgt = offTgt.getContext("2d");
  cTgt.imageSmoothingEnabled = false;
  cTgt.drawImage(offSrc, 0, 0, offTgt.width, offTgt.height);
  return offTgt.transferToImageBitmap();
}

// caches
const framesCache = new Map();    // key -> [Image...]
const maskMatCache = new Map();   // key -> { mats, W, H }
const maskBmpCache = new Map();   // key -> ImageBitmap
const loops = new Set();

// colored overlays store (per story/char/slide)
const OVERLAY_KEY = `coloredFrames:${storyId}:${selectedChar}`;
let coloredBySlide = {};
try { coloredBySlide = JSON.parse(localStorage.getItem(OVERLAY_KEY) || "{}") || {}; } catch {}

const legacySingle  = localStorage.getItem("coloredCharacter") || null;
let   legacyFrames  = null;
try { const arr = JSON.parse(localStorage.getItem("coloredCharacterFrames") || "null");
      if (Array.isArray(arr) && arr.length) legacyFrames = arr; } catch {}

function setTitle(){
  const h2 = document.querySelector("h2");
  if (h2) h2.textContent = `Story Scene: ${manifest?.storyTitle || "Story"}`;
}
function clearLayers(){
  for (const stop of loops) { try { stop(); } catch{} }
  loops.clear();
  const host = document.getElementById("charHost");
  if (host) host.innerHTML = "";
}

async function discoverManifest(){
  const url = `stories/${storyId}/slides.json`;
  try{
    const r = await fetch(url, { cache:"no-store" });
    if (r.ok){
      const txt = await r.text();
      try{ return JSON.parse(txt); }
      catch{ console.warn("[slides.json] invalid JSON, falling back"); }
    }
  }catch{}

  // auto-discover slide1.png..slideN.png
  const slides = [];
  for (let i=1;i<=24;i++){
    const p = `stories/${storyId}/slide${i}.png`;
    if (await urlExists(p)) slides.push({ background:p, characters:[] });
    else if (slides.length) break;
  }
  return {
    storyTitle: storyId.replace(/-/g," ").replace(/\b\w/g,s=>s.toUpperCase()),
    slides
  };
}

async function getFrames(prefix, count){
  const key = `${prefix}|${count}`;
  if (framesCache.has(key)) return framesCache.get(key);
  const images = await Promise.all(
    Array.from({length:count},(_,i)=>loadImage(`${prefix}${i+1}.png`))
  );
  framesCache.set(key, images);
  return images;
}

async function getMasksForSlide(charId, slideNo){
  const prefix = `images/frames/${storyId}/frame${slideNo}/${charId}/${charId}_mask_`;
  const key = `${prefix}|4`;
  if (maskMatCache.has(key)) return maskMatCache.get(key);

  const mats = await Promise.all(
    [1,2,3,4].map(i => loadCSVMatrix(`${prefix}${i}.csv`))
  );
  const H = mats[0].length, W = mats[0][0].length;
  const out = { mats, W, H, prefix };
  maskMatCache.set(key, out);
  return out;
}

async function buildOverlaysForSlideFromSingle(coloredImg, slideNo, charId, cvs){
  // scale the user's single colored image to canvas size,
  // then apply each of the 4 masks for THIS slide
  const r = cvs.getBoundingClientRect();
  const base = await loadImage(coloredImg);
  const { mats, W, H, prefix } = await getMasksForSlide(charId, slideNo);

  const overlays = [];
  for (let i=0;i<4;i++){
    const bmpKey = `${prefix}${i+1}|${Math.round(r.width)}x${Math.round(r.height)}`;
    let bmp = maskBmpCache.get(bmpKey);
    if (!bmp){
      bmp = await matrixToMaskBitmapScaled(mats[i], W, H, r.width, r.height);
      maskBmpCache.set(bmpKey, bmp);
    }

    // paint × mask → bitmap image
    const off = document.createElement("canvas");
    off.width = Math.round(r.width);
    off.height = Math.round(r.height);
    const cx = off.getContext("2d");
    cx.imageSmoothingEnabled = false;
    cx.drawImage(base, 0, 0, off.width, off.height);
    cx.globalCompositeOperation = "destination-in";
    cx.drawImage(bmp, 0, 0);
    cx.globalCompositeOperation = "source-over";

    overlays.push(await loadImage(off.toDataURL()));
  }
  return overlays;
}

async function placeCharacter(cfg, slideNo){
  const { id, x, y, w, z=1, fps=4 } = cfg;

  // default base frames location for this slide:
  const framesPrefix = cfg.framesPath ||
    `images/frames/${storyId}/frame${slideNo}/${id}/${id}`;

  const host = (()=>{
    let h = document.getElementById("charHost");
    if (!h){
      h = document.createElement("div");
      h.id = "charHost";
      Object.assign(h.style, { position:"absolute", left:0, top:0, width:"100%", height:"100%", pointerEvents:"none" });
      scene.parentElement.appendChild(h);
    }
    return h;
  })();

  const cvs = document.createElement("canvas");
  cvs.className = `char-layer ${id}`;
  Object.assign(cvs.style, { position:"absolute", left:pct(x), top:pct(y), width:pct(w), height:"auto", zIndex:String(z), pointerEvents:"none" });
  host.appendChild(cvs);
  const ctx = fitCanvasToCSS(cvs);
  const ro  = new ResizeObserver(()=>fitCanvasToCSS(cvs));
  ro.observe(cvs);

  try{
    const baseFrames = await getFrames(framesPrefix, cfg.frameCount || 4);

    // choose / build overlays for THIS slide
    let overlays = null;
    if (id === selectedChar){
      // 1) if we already stored per-slide overlays, use them
      const stored = coloredBySlide[String(slideNo)];
      if (Array.isArray(stored) && stored.length){
        overlays = await Promise.all(stored.map(loadImage));
      }
      // 2) else if legacy 4-frames exist from canvas, use them (best effort)
      else if (Array.isArray(legacyFrames) && legacyFrames.length){
        overlays = await Promise.all(legacyFrames.slice(0, baseFrames.length).map(loadImage));
      }
      // 3) else remask the single colored bitmap through THIS slide's masks
      else if (legacySingle){
        overlays = await buildOverlaysForSlideFromSingle(legacySingle, slideNo, id, cvs);
      }
    }

    function draw(ix){
      const r = cvs.getBoundingClientRect();
      ctx.clearRect(0,0,r.width,r.height);
      if (overlays){
        const ov = overlays[ix % overlays.length];
        ctx.drawImage(ov, 0, 0, r.width, r.height);
      }
      const base = baseFrames[ix % baseFrames.length];
      ctx.drawImage(base, 0, 0, r.width, r.height);
    }

    let i=0, last = performance.now(), raf=0, stop=false;
    const frameMs = 1000 / Math.max(1, fps);
    draw(0);
    function tick(ts){
      if (stop) return;
      if (ts - last >= frameMs){ last = ts; i=(i+1)%baseFrames.length; draw(i); }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    loops.add(()=>{ stop=true; cancelAnimationFrame(raf); ro.disconnect(); });
  }catch(e){
    console.warn("[storyboard] character failed:", id, e);
    ro.disconnect();
  }
}

async function showSlide(i){
  if (!manifest) return;
  cur = Math.max(0, Math.min(i, manifest.slides.length-1));
  const s = manifest.slides[cur];

  // background
  try {
    const bg = await loadImage(s.background);
    scene.src = bg.src;
  } catch {
    console.error("[storyboard] background failed:", s.background);
    scene.removeAttribute("src");
  }

  clearLayers();

  const slideNo =
    slideNoFromPath(s.background) ??
    (manifest.slides.indexOf(s) + 1);

  // place declared characters if provided; otherwise none (background-only slide still works)
  const chars = Array.isArray(s.characters) ? s.characters : [];
  await Promise.allSettled(chars.map(c => placeCharacter({
    frameCount: 4,
    fps: 4,
    z: 1,
    ...c
  }, slideNo)));

  const url = new URL(location.href);
  url.searchParams.set("story", storyId);
  url.searchParams.set("slide", cur);
  history.replaceState({}, "", url);

  window.__slides = { index: cur, count: manifest.slides.length };
  window.dispatchEvent(new Event("slidechange"));
}

function nextSlide(){ showSlide(cur+1); }
function prevSlide(){ showSlide(cur-1); }
Object.assign(window, { nextSlide, prevSlide, showSlide });

(async function boot(){
  manifest = await discoverManifest();
  setTitle();
  if (!manifest.slides?.length){
    console.error("[storyboard] No slides discovered for", storyId);
    return;
  }
  await showSlide(Math.min(initialSlide, manifest.slides.length-1));

  addEventListener("keydown", e=>{
    if (e.key === "ArrowRight") nextSlide();
    if (e.key === "ArrowLeft")  prevSlide();
  });
})();
