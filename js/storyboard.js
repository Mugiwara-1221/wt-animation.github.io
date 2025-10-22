// js/storyboard.js — colored PNG frame animation

// --- Query & context (must be first) ---
const qs  = new URLSearchParams(location.search);
const ctx = JSON.parse(localStorage.getItem("ctx") || "{}");

// story id (keep fallback logic, normalized with dashes)
const storyId = (qs.get("story") || localStorage.getItem("selectedStory") || "tortoise-hare").replace(/_/g, "-");

// read slide from URL (CANVAS sends 1-based); else from ctx (also 1-based)
const requested1 = Number(qs.get("slide"));
const fromCtx    = Number(ctx.slide);
let initialSlide = 0;
if (!Number.isNaN(requested1)) initialSlide = Math.max(0, requested1 - 1);
else if (!Number.isNaN(fromCtx)) initialSlide = Math.max(0, fromCtx - 1);

// selected character (optional)
const selectedChar = (qs.get("char") || localStorage.getItem("selectedCharacter") || "").toLowerCase();

// storyIDs → repo folders (for frames)
const STORY_FOLDER_MAP = new Map([
  ["tortoise-hare", "tortoise-hare"],
  ["lion-mouse",    "lion-mouse"],
  ["little-ducks",  "little-ducks"],
  ["prince-pauper", "prince-pauper"],
  ["frog-prince", "frog-prince"],
  ["old-mcdonald", "old-mcdonald"],
]);

function resolveStoryFolder(id) {
  const dash = (id || "").replace(/_/g, "-");
  return STORY_FOLDER_MAP.get(dash) || dash;
}

const storyFolder = resolveStoryFolder(storyId);

// DOM
const scene = document.getElementById("scene");

// caches & animation loop registry
const framesCache = new Map();
const loops       = new Set(); 

async function getFrames(prefix, count){
  const key = `${prefix}|${count}`;
  if (framesCache.has(key)) return framesCache.get(key);

  // cache-buster so slide1/tortoise1.png and slide2/tortoise1.png never collide
  const now = Date.now();
  const urls = Array.from({length: count}, (_, i) =>
    `${prefix}${i+1}.png?v=${now}`
  );

  const loaders = urls.map(u =>
    loadImage(u).catch(() => null)
  );

  const images = (await Promise.all(loaders)).filter(Boolean);
  if (!images.length){
    console.warn("[storyboard] no frames loaded for", urls);
  } else {
    console.log("[storyboard] frames:", urls);
  }

  framesCache.set(key, images);
  return images;
}

let manifest = null;
let cur = 0;

const pct = n => `${n}%`;
function slideNoFromPath(p){
  const m = /slide(\d+)\.png/i.exec(p || "");
  return m ? parseInt(m[1],10) : null;
}

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

function loadImage(src){
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("Failed to load " + src));
    im.src = src;
  });
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

/* ---------- Read painted frames saved by canvas (chronological) ---------- */
function getPaintedFrames(storyDash, slide1, charId) {
  const key = `sbFrames:${storyDash}:${slide1}:${charId}`;
  try {
    const obj = JSON.parse(localStorage.getItem(key) || "null");
    if (obj && Array.isArray(obj.frames) && obj.frames.length) {
      return obj.frames; // data URLs or blob URLs already in order 1..N
    }
  } catch {}
  return null;
}

/* ----------------- Character placement ----------------- */
async function placeCharacter(cfg, slideNo){
  const { id, x, y, w, h, z = 1 } = cfg;
  const frameCount = cfg.frameCount || 4;
  const fps        = cfg.fps ?? 6;

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

  const framesPrefix = (cfg.framesPath && cfg.framesPath.trim()) ||
    `images/frames/${storyFolder}/frame${slideNo}/${id}/${id}`;

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
    // 1) Prefer painted frames for the selected character on this slide
  const paintedURLs = getPaintedFrames(storyId, slideNo, id);
let baseFrames = null;

if (paintedURLs) {
  const loaders = paintedURLs.map(u =>
    u ? loadImage(u).catch(() => null) : Promise.resolve(null)
  );
  const imgs = (await Promise.all(loaders)).filter(Boolean);

  // accept 1-frame or multi-frame bundles
  if (imgs.length) {
    baseFrames = imgs;
    // if the manifest says single-frame, clamp to 1
    if ((cfg.frameCount || 0) <= 1 && baseFrames.length > 1) {
      baseFrames = [baseFrames[0]];
    }
  }
}

if (!baseFrames) {
  const now = Date.now();

  if ((frameCount || 0) <= 1) {
    // SINGLE-FRAME
    const singleURL = /\.png$/i.test(framesPrefix)
      ? `${framesPrefix}?v=${now}`
      : `${framesPrefix}1.png?v=${now}`;
    try {
      const img = await loadImage(singleURL);
      baseFrames = [img];
    } catch {
      console.warn("[storyboard] single-frame load failed:", singleURL);
      baseFrames = [];
    }
  } else {
    // MULTI-FRAME
    const stem = /\.png$/i.test(framesPrefix)
      ? framesPrefix.replace(/\.png$/i, "")
      : framesPrefix;
    baseFrames = await getFrames(stem, frameCount);
  }
}

/* >>> ADD THESE LINES <<< */
// bail if we still have nothing
if (!baseFrames || !baseFrames.length) {
  console.warn("[storyboard] no frames to draw for", id);
  ro.disconnect();
  return;
}

// local draw helper (must be after baseFrames is set)
function draw(ix) {
  const r = cvs.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  const frame = baseFrames[Math.min(ix, baseFrames.length - 1)];
  if (frame) ctx.drawImage(frame, 0, 0, r.width, r.height);
}

draw(0);

// --- decide whether to animate ---
const shouldAnimate = (frameCount > 1) && (baseFrames.length > 1) && (fps > 0);

if (shouldAnimate) {
  let i = 0, last = performance.now(), raf = 0, stop = false;
  const frameMs = 1000 / Math.max(1, fps);
  function tick(ts) {
    if (stop) return;
    if (ts - last >= frameMs) {
      last = ts;
      i = (i + 1) % baseFrames.length;
      draw(i);
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  loops.add(() => {
    stop = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
  });
} else {
  // single-frame path: stay static (e.g., 5 Little Ducks)
  loops.add(() => ro.disconnect());
}
  } catch (e) {
    console.warn("[storyboard] character failed:", id, e);
    ro.disconnect();
  }
}

/* ---------------- Manifest discovery ---------------- */
async function discoverManifest(){
  const url = `stories/${storyId}/slides.json`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
  const txt = await r.text();
  try { return JSON.parse(txt); }
  catch { throw new Error("slides.json is invalid JSON"); }
}

/* ---------------- Slide rendering ---------------- */
async function showSlide(i){
  if (!manifest) return;
  cur = Math.max(0, Math.min(i, manifest.slides.length - 1));

  // drop any previously cached frame bitmaps
  framesCache.clear();

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

  const chars = Array.isArray(s.characters) ? s.characters : [];
  await Promise.allSettled(
    chars.map(c => placeCharacter(
      {
        frameCount: c.frameCount || 4,
        fps:        c.fps ?? 6,
        z:          1,
        ...c
      },
      slideNo
    ))
  );

  // keep URL in sync
  const url = new URL(location.href);
  url.searchParams.set("story", storyId);
  url.searchParams.set("slide", String(cur + 1));  // keep URL 1-based
  history.replaceState({}, "", url);


  window.__slides = { index: cur, count: manifest.slides.length };
  window.dispatchEvent(new Event("slidechange"));
}

function nextSlide(){ showSlide(cur+1); }
function prevSlide(){ showSlide(cur-1); }
Object.assign(window, { nextSlide, prevSlide, showSlide });

/* ---------------- Boot ---------------- */
(async function boot(){
  manifest = await discoverManifest();
  setTitle();
  if (!manifest.slides?.length){
    console.error("[storyboard] No slides discovered for", storyId);
    return;
  }
  await showSlide(Math.min(initialSlide, manifest.slides.length - 1));

  addEventListener("keydown", e=>{
    if (e.key === "ArrowRight") nextSlide();
    if (e.key === "ArrowLeft")  prevSlide();
  });
})();
