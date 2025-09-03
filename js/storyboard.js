
// storyboard.js — ordered slides from stories/<story-id>/slide#.png with fallbacks

/* ---------------- context ---------------- */
const qs            = new URLSearchParams(location.search);
const storyId       = (qs.get("story") || localStorage.getItem("selectedStory") || "tortoise-hare").replace(/_/g, "-");
const initialSlide  = Math.max(0, +qs.get("slide") || 0);
const selectedChar  = (qs.get("char") || localStorage.getItem("selectedCharacter") || "").toLowerCase();

const scene = document.getElementById("scene");
let manifest = null;         // { slides:[{background, characters?}] }
let idx = 0;                 // current slide index
const animLoops = new Set(); // cancelers per slide

/* ---------------- utils ---------------- */
function pct(n){ return `${n}%`; }
function loadImage(src){
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("Failed to load " + src));
    im.src = src;
  });
}
async function urlExists(url){
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok;
  } catch { return false; }
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
// accept slide<number>.png OR frame<number> in path
function slideNoFromPath(p){
  const m1 = /slide(\d+)\.png/i.exec(p || "");
  if (m1) return parseInt(m1[1], 10);
  const m2 = /frame(\d+)/i.exec(p || "");
  return m2 ? parseInt(m2[1], 10) : null;
}

/* ---------------- caches ---------------- */
const frameCache = new Map(); // `${prefix}|${count}` -> [Image,...]
async function getFrames(prefix, count){
  const key = `${prefix}|${count}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const imgs = await Promise.all(
    Array.from({length:count}, (_,i)=>loadImage(`${prefix}${i+1}.png`))
  );
  frameCache.set(key, imgs);
  return imgs;
}

/* ---------------- colored overlay store (per slide) ---------------- */
// New per-slide store written by canvas.js:
//   localStorage[`coloredFrames:${storyId}:${char}`] = { "1":[dataURL...], "2":[...], ... }
const OVERLAY_KEY = `coloredFrames:${storyId}:${selectedChar}`;
let coloredBySlide = {};
try {
  coloredBySlide = JSON.parse(localStorage.getItem(OVERLAY_KEY) || "{}") || {};
} catch { coloredBySlide = {}; }

// Legacy fallbacks
const coloredSingleLegacy = localStorage.getItem("coloredCharacter") || null;
let coloredFramesLegacy = null;
try {
  const arr = JSON.parse(localStorage.getItem("coloredCharacterFrames") || "null");
  if (Array.isArray(arr) && arr.length) coloredFramesLegacy = arr;
} catch {}

/* ---------------- layer host ---------------- */
let layerHost = document.getElementById("charHost");
if (!layerHost) {
  layerHost = document.createElement("div");
  Object.assign(layerHost.style, {
    position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none"
  });
  scene.parentElement.appendChild(layerHost);
}
function clearCharacters(){
  for (const stop of animLoops) { try { stop(); } catch {} }
  animLoops.clear();
  layerHost.innerHTML = "";
}

/* ---------------- boot: load manifest or auto-discover slides ---------------- */
(async function boot(){
  // 1) try slides.json first
  const slidesURL = `stories/${storyId}/slides.json`;
  if (await urlExists(slidesURL)) {
    manifest = await (await fetch(slidesURL, { cache: "no-store" })).json();
  } else {
    // 2) fallback: discover slide#.png sequentially (1..20)
    const slides = [];
    for (let i = 1; i <= 20; i++) {
      const p = `stories/${storyId}/slide${i}.png`;
      if (await urlExists(p)) slides.push({ background: p, characters: [] });
      else if (slides.length) break; // stop after first gap once we’ve started
    }
    manifest = { storyTitle: storyId.replace(/-/g, " ").replace(/\b\w/g, s=>s.toUpperCase()), slides };
  }

  setTitle();
  await showSlide(Math.min(initialSlide, (manifest.slides?.length || 1) - 1));

  addEventListener("keydown", (e)=>{
    if (e.key === "ArrowRight") nextSlide();
    if (e.key === "ArrowLeft")  prevSlide();
  });
})();

function setTitle(){
  const h2 = document.querySelector("h2");
  if (h2) h2.textContent = `Story Scene: ${manifest?.storyTitle || "Story"}`;
}

/* ---------------- navigation ---------------- */
function nextSlide(){ showSlide(idx + 1); }
function prevSlide(){ showSlide(idx - 1); }
Object.assign(window, { nextSlide, prevSlide, showSlide });

/* ---------------- show a slide ---------------- */
async function showSlide(i){
  if (!manifest) return;
  idx = Math.max(0, Math.min(i, manifest.slides.length - 1));
  const s = manifest.slides[idx];

  // background first (sizes container)
  try {
    const bg = await loadImage(s.background);
    scene.src = bg.src;
  } catch {
    console.error("Background failed:", s.background);
    scene.removeAttribute("src");
  }

  clearCharacters();

  // place characters if provided in slides.json; if not, just show background
  const chars = Array.isArray(s.characters) ? s.characters : [];
  await Promise.allSettled(chars.map(cfg => {
    const basePrefix = cfg.framesPath || `images/frames/${cfg.id}/${cfg.id}`;
    const frameCount = cfg.frameCount || 4;
    const fps        = cfg.fps || 4;
    const z          = cfg.z ?? 1;
    return placeCharacter({ ...cfg, framesPath: basePrefix, frameCount, fps, z });
  }));

  // update URL + inform buttons
  const url = new URL(location.href);
  url.searchParams.set("story", storyId);
  url.searchParams.set("slide", idx);
  history.replaceState({}, "", url);

  window.__slides = { index: idx, count: manifest.slides.length };
  window.dispatchEvent(new Event("slidechange"));
}

/* ---------------- character layer ---------------- */
async function placeCharacter(c){
  const { id, x, y, w, z=1, fps=4, framesPath, frameCount=4 } = c;

  const cvs = document.createElement("canvas");
  cvs.className = `char-layer ${id}`;
  Object.assign(cvs.style, {
    position: "absolute", left: pct(x), top: pct(y), width: pct(w), height: "auto",
    zIndex: String(z), pointerEvents: "none"
  });
  layerHost.appendChild(cvs);
  const ctx = fitCanvasToCSS(cvs);
  const ro = new ResizeObserver(()=>fitCanvasToCSS(cvs));
  ro.observe(cvs);

  try {
    const baseFrames = await getFrames(framesPath, frameCount);

    // choose overlay for THIS slide
    let overlays = null;
    if (id === selectedChar) {
      const slideNo = slideNoFromPath(manifest.slides[idx]?.background);
      if (slideNo && Array.isArray(coloredBySlide[String(slideNo)])) {
        // per-slide overlays (already masked & sized by canvas.js)
        overlays = await Promise.all(coloredBySlide[String(slideNo)].map(loadImage));
      } else if (Array.isArray(coloredFramesLegacy) && coloredFramesLegacy.length) {
        overlays = await Promise.all(coloredFramesLegacy.slice(0, frameCount).map(loadImage));
      } else if (coloredSingleLegacy) {
        overlays = [await loadImage(coloredSingleLegacy)];
      }
    }

    let f = 0;
    const frameMs = 1000 / Math.max(1, fps);

    function draw(ix){
      const r = cvs.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      if (overlays) {
        const ov = overlays[ix % overlays.length];
        ctx.drawImage(ov, 0, 0, r.width, r.height);
      }
      const base = baseFrames[ix % baseFrames.length];
      ctx.drawImage(base, 0, 0, r.width, r.height);
    }

    // first frame now, then loop
    draw(0);
    let rafId = 0, cancelled = false, last = performance.now();
    function tick(ts){
      if (cancelled) return;
      if (ts - last >= frameMs) { last = ts; f = (f+1) % frameCount; draw(f); }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    animLoops.add(() => { cancelled = true; cancelAnimationFrame(rafId); ro.disconnect(); });
  } catch (e) {
    console.warn("Character failed:", id, e);
    ro.disconnect();
  }
}
