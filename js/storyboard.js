
// js/storyboard.js — PNG frame animation + optional GIF characters

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

/* ----------------- NEW: Mount a GIF when framesPath is a .gif ----------------- */
function mountGif(host, cfg){
  const { id, x, y, w, h, z=1 } = cfg;
  const img = document.createElement("img");
  img.src = cfg.framesPath;           // you already put the GIF here
  img.alt = id || "";
  img.className = `character ${id||""}`;
  Object.assign(img.style, {
    position: "absolute",
    left: pct(x), top: pct(y),
    width: pct(w),
    height: (h != null ? pct(h) : "auto"),
    zIndex: String(z),
    pointerEvents: "none"
  });
  host.appendChild(img);
  const stop = () => { try { img.remove(); } catch {} };
  loops.add(stop);
}

/* ----------------- PNG stack (existing behavior) ----------------- */
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

/* ----------------- Character placement ----------------- */
async function placeCharacter(cfg, slideNo){
  const { id, x, y, w, h, z=1, fps=4 } = cfg;

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

  // If framesPath is a GIF, mount it and return
  const src = (cfg.framesPath || "").trim();
  if (src && /\.gif(\?.*)?$/i.test(src)){
    mountGif(host, cfg);
    return;
  }

  // Otherwise: default PNG frames location (or provided prefix)
  const framesPrefix = src || `images/frames/${storyId}/frame${slideNo}/${id}/${id}`;

  const cvs = document.createElement("canvas");
  cvs.className = `char-layer ${id}`;
  Object.assign(cvs.style, {
    position:"absolute",
    left:pct(x), top:pct(y),
    width:pct(w),
    height:(h != null ? pct(h) : "auto"),
    zIndex:String(z),
    pointerEvents:"none"
  });
  host.appendChild(cvs);
  const ctx = fitCanvasToCSS(cvs);
  const ro  = new ResizeObserver(()=>fitCanvasToCSS(cvs));
  ro.observe(cvs);

  try{
    const baseFrames = await getFrames(framesPrefix, cfg.frameCount || 4);

    // choose / build overlays for THIS slide
    let overlays = null;
    if (id === selectedChar){
      const stored = coloredBySlide[String(slideNo)];
      if (Array.isArray(stored) && stored.length){
        overlays = await Promise.all(stored.map(loadImage));
      } else if (Array.isArray(legacyFrames) && legacyFrames.length){
        overlays = await Promise.all(legacyFrames.slice(0, baseFrames.length).map(loadImage));
      } else if (legacySingle){
        overlays = await buildOverlaysForSlideFromSingle(legacySingle, slideNo, id, cvs);
      }
    }

    function draw(ix){
      const r = cvs.getBoundingClientRect();
      ctx.clearRect(0,0,r.width,r.height);
      if (overlays){
