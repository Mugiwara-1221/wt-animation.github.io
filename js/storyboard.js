// js/storyboard.js — PNG frame animation (no static/GIF fallbacks)

// --- Query & context (must be first) ---
const qs  = new URLSearchParams(location.search);
const ctx = JSON.parse(localStorage.getItem("ctx") || "{}");

// story id (keep fallback logic, normalized with dashes)
const storyId = (qs.get("story") || localStorage.getItem("selectedStory") || "tortoise-hare").replace(/_/g, "-");

// read slide from URL (0-based for storyboard); else from ctx (usually 1-based)
const requested = Number(qs.get("slide"));
const fromCtx   = Number(ctx.slide);
let initialSlide = 0;
if (!Number.isNaN(requested)) initialSlide = Math.max(0, requested);
else if (!Number.isNaN(fromCtx)) initialSlide = Math.max(0, fromCtx - 1);

// selected character (optional)
const selectedChar = (qs.get("char") || localStorage.getItem("selectedCharacter") || "").toLowerCase();

// storyIDs → repo folders (for frames)
const STORY_FOLDER_MAP = new Map([
  ["tortoise-hare", "tortoise-hare"],
  ["lion-mouse",    "lion_and_the_mouse"],
  ["little-ducks",  "5_little_ducks"],
]);
function resolveStoryFolder(id) {
  const dash = (id || "").replace(/_/g, "-");
  return STORY_FOLDER_MAP.get(dash) || dash;
}
const storyFolder = resolveStoryFolder(storyId);

// DOM
const scene = document.getElementById("scene");

// caches
const framesCache   = new Map(); // key -> [Image...]
const loops         = new Set();

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

/* ----------------- PNG stack loader ----------------- */
async function getFrames(prefix, count) {
  const key = `${prefix}|${count}`;
  if (framesCache.has(key)) return framesCache.get(key);

  // Try to load 1..count; ignore any 404s so we don't crash mid-lesson
  const loaders = Array.from({ length: count }, (_, i) =>
    loadImage(`${prefix}${i + 1}.png`).catch(() => null)
  );
  const images = (await Promise.all(loaders)).filter(Boolean);
  if (!images.length) {
    console.warn("[storyboard] no frames loaded for", prefix);
  }
  framesCache.set(key, images);
  return images;
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
    let baseFrames;
    const paintedURLs = (id.toLowerCase() === selectedChar)
      ? getPaintedFrames(storyId, slideNo, id)
      : null;

    if (paintedURLs) {
      baseFrames = await Promise.all(paintedURLs.map(loadImage));
    } else {
      // 2) Fallback to repo frames
      baseFrames = await getFrames(framesPrefix, frameCount);
    }

    function draw(ix) {
      const r = cvs.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      if (baseFrames && baseFrames.length > 0) {
        const frame = baseFrames[ix % baseFrames.length];
        if (frame) ctx.drawImage(frame, 0, 0, r.width, r.height);
      }
    }

    // draw & animate if multiple frames and fps > 0
    draw(0);
    if (baseFrames.length > 1 && fps > 0) {
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
      loops.add(() => ro.disconnect());
    }
  }catch(e){
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
  url.searchParams.set("slide", cur);
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
