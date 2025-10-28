// js/storyboard.js — colored PNG frame animation

// --- Query & context (must be first) ---
const qs  = new URLSearchParams(location.search);
const ctx = JSON.parse(localStorage.getItem("ctx") || "{}");

// story id (keep fallback logic, normalized with dashes)
const storyId = (qs.get("story") || localStorage.getItem("selectedStory") || "tortoise-hare").replace(/_/g, "-");

// read slide from URL (1-based coming from canvas); else from ctx (also 1-based)
// convert to 0-based ONLY for indexing internal arrays
const rawSlide    = Number(qs.get("slide"));   // 1-based from canvas.html
const rawCtxSlide = Number(ctx.slide);         // 1-based if it exists in ctx
let initialSlide  = 0;                         // 0-based index used internally

if (Number.isFinite(rawSlide) && rawSlide >= 1) {
  initialSlide = rawSlide - 1;
} else if (Number.isFinite(rawCtxSlide) && rawCtxSlide >= 1) {
  initialSlide = rawCtxSlide - 1;
} else {
  initialSlide = 0; // default to first slide
}


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

//
// ----- Multi-select slide routing helpers -----
function safeParse(s){ try { return JSON.parse(s); } catch { return null; } }

function getSelectedSlides(){
  // from URL (?slides=1,3,5)
  const fromQS = (qs.get("slides") || "")
    .split(",")
    .map(n => Number(n))
    .filter(n => Number.isFinite(n) && n >= 1);

  // from ctx (written by slide-select.js)
  const fromCtx = Array.isArray(ctx.slides)
    ? ctx.slides.map(n => Number(n)).filter(n => Number.isFinite(n) && n >= 1)
    : [];

  // from localStorage (written by slide-select.js)
  const fromLS = (safeParse(localStorage.getItem("selectedSlides")) || [])
    .map(n => Number(n))
    .filter(n => Number.isFinite(n) && n >= 1);

  // merge + dedupe + sort ascending (1-based)
  const merged = [...fromQS, ...fromCtx, ...fromLS];
  return [...new Set(merged)].sort((a,b)=>a-b);
}


function buildSpriteURL(slide1){
  // slide1 must be 1-based in the URL
  const u = new URL("sprite-select.html", location.href);
  u.searchParams.set("story", storyId);
  u.searchParams.set("slide", String(slide1));
  const sid   = qs.get("session") || localStorage.getItem("sessionCode") || ctx.session;
  const grade = qs.get("grade")   || localStorage.getItem("selectedGrade") || ctx.grade;
  if (sid)   u.searchParams.set("session", sid);
  if (grade) u.searchParams.set("grade", grade);
  return u.toString();
}

function goToNextSelectedSlide(){
  const slides = getSelectedSlides();           // 1-based list
  if (!slides.length){ nextSlide(); return; }   // fallback: old behavior
  const current1 = cur + 1;                     // cur is 0-based
  const idx = slides.indexOf(current1);

  // If current slide isn’t in the selection, jump to the first selected > current, else first
  if (idx === -1){
    const next = slides.find(s => s > current1) || slides[0];
    location.href = buildSpriteURL(next);
    return;
  }

  // Otherwise advance within the selected list; if at end, return to slide picker
  if (idx < slides.length - 1){
    location.href = buildSpriteURL(slides[idx + 1]);
  } else {
    location.href = "slide-select.html";
  }
}

function goToPrevSelectedSlide(){
  const slides = getSelectedSlides();
  if (!slides.length){ prevSlide(); return; }
  const current1 = cur + 1;
  const idx = slides.indexOf(current1);

  if (idx > 0){
    location.href = buildSpriteURL(slides[idx - 1]);
  } else {
    location.href = "slide-select.html";
  }
}
//

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
  url.searchParams.set("slide", String(cur + 1)); // keep URL 1-based
  history.replaceState({}, "", url);

  window.__slides = { index: cur, count: manifest.slides.length };
  window.dispatchEvent(new Event("slidechange"));
}

function nextSlide(){ showSlide(cur+1); }
function prevSlide(){ showSlide(cur-1); }
Object.assign(window, { nextSlide, prevSlide, showSlide });

//
// Prefer selected-slides routing for on-screen buttons if present
const nextBtn =
  document.getElementById("nextBtn") ||
  document.querySelector('[data-action="next"]') ||
  Array.from(document.querySelectorAll("button")).find(b => /next/i.test(b.textContent||""));

const prevBtn =
  document.getElementById("prevBtn") ||
  document.querySelector('[data-action="prev"]') ||
  Array.from(document.querySelectorAll("button")).find(b => /back|prev/i.test(b.textContent||""));

nextBtn?.addEventListener("click", (e)=>{ e.preventDefault(); goToNextSelectedSlide(); });
prevBtn?.addEventListener("click", (e)=>{ e.preventDefault(); goToPrevSelectedSlide(); });

// 10/28

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
    if (e.key === "ArrowRight"){ e.preventDefault(); goToNextSelectedSlide(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); goToPrevSelectedSlide(); }
  }); 
})();
