
// storyboard.js — ordered slides with per-slide colored overlays (no CSV at runtime)

/* ---------------- context ---------------- */
const qs            = new URLSearchParams(location.search);
const storyIdDashed = (qs.get("story") || localStorage.getItem("selectedStory") || "tortoise-hare").replace(/_/g, "-");
const initialSlide  = Math.max(0, +qs.get("slide") || 0);
const selectedChar  = (qs.get("char") || localStorage.getItem("selectedCharacter") || "").toLowerCase();

const scene = document.getElementById("scene");

/* Dashed id -> your repo folder */
const STORY_FOLDER_MAP = new Map([
  ["tortoise-hare", "tortoise_and_the_hare"],
  ["lion-mouse",    "lion_and_the_mouse"],
]);
const storyFolder = STORY_FOLDER_MAP.get(storyIdDashed) || storyIdDashed;

/* Legacy fallbacks (old storage keys) */
const coloredSingleLegacy = localStorage.getItem("coloredCharacter") || null;
let coloredFramesLegacy = null;
try {
  const arr = JSON.parse(localStorage.getItem("coloredCharacterFrames") || "null");
  if (Array.isArray(arr) && arr.length) coloredFramesLegacy = arr;
} catch {}

/* New per-slide storage (written by canvas.js) */
const COLORED_KEY = `coloredFrames:${storyFolder}:${selectedChar}`;
let coloredBySlide = {}; // { "1":[dataURL...], "2":[...], ... }
try {
  const raw = localStorage.getItem(COLORED_KEY);
  if (raw) coloredBySlide = JSON.parse(raw) || {};
} catch { coloredBySlide = {}; }

/* ---------------- small utils ---------------- */
function pct(n){ return `${n}%`; }
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
function frameNumberFromBackground(bgPath){
  // supports ".../frame5.png" and ".../frame5/<anything>.png"
  const m = /frame(\d+)/i.exec(bgPath || "");
  return m ? parseInt(m[1], 10) : null;
}

/* ---------------- caches ---------------- */
const frameCache = new Map(); // `${prefix}|${count}` -> [Image,...]
async function getFrames(prefix, count){
  const key = `${prefix}|${count}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const imgs = await Promise.all(Array.from({length:count}, (_,i)=>loadImage(`${prefix}${i+1}.png`)));
  frameCache.set(key, imgs);
  return imgs;
}

/* ---------------- runtime state ---------------- */
let manifest = null;
let idx = 0;
const animLoops = new Set();

/* host for character layers */
let layerHost = document.getElementById("charHost");
if (!layerHost) {
  layerHost = document.createElement("div");
  Object.assign(layerHost.style, {
    position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none"
  });
  scene.parentElement.appendChild(layerHost);
}

/* ---------------- boot ---------------- */
(async function boot(){
  // Load storyboard manifest (ordered slides)
  manifest = await (await fetch(`stories/${storyFolder}/slides.json`, { cache: "no-store" })).json();

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

function clearCharacters(){
  for (const stop of animLoops) { try { stop(); } catch {} }
  animLoops.clear();
  layerHost.innerHTML = "";
}

/* ---------------- slide/show logic ---------------- */
async function showSlide(i){
  if (!manifest) return;
  idx = Math.max(0, Math.min(i, manifest.slides.length - 1));
  const s = manifest.slides[idx];

  // 1) background first (sets size)
  try {
    const bg = await loadImage(s.background);
    scene.src = bg.src;
  } catch {
    console.error("Background failed:", s.background);
    scene.removeAttribute("src");
  }

  clearCharacters();

  // 2) characters for this slide, in parallel
  const tasks = (s.characters || []).map(cfg => {
    const basePrefix = cfg.framesPath || `images/frames/${cfg.id}/${cfg.id}`;
    return placeCharacterForSlide({ ...cfg, framesPath: basePrefix });
  });
  await Promise.allSettled(tasks);

  // 3) URL + inform buttons
  const url = new URL(location.href);
  url.searchParams.set("story", storyIdDashed);
  url.searchParams.set("slide", idx);
  history.replaceState({}, "", url);

  window.__slides = { index: idx, count: manifest.slides.length };
  window.dispatchEvent(new Event("slidechange"));
}

function nextSlide(){ showSlide(idx + 1); }
function prevSlide(){ showSlide(idx - 1); }
Object.assign(window, { nextSlide, prevSlide, showSlide });

/* ---------------- character placement ---------------- */
async function placeCharacterForSlide(c){
  const { id, x, y, w, z=1, fps=4, framesPath, frameCount=4 } = c;

  // Build canvas layer
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
    // Base line-art / original frames
    const baseFrames = await getFrames(framesPath, frameCount);

    // Decide overlays for THIS slide (priority: per-slide → legacy 4-pack → legacy single)
    let overlays = null;
    const frameNo = frameNumberFromBackground(manifest.slides[idx].background);

    if (id === selectedChar && frameNo && coloredBySlide[String(frameNo)]) {
      // Per-slide pre-masked overlays saved by canvas.js
      overlays = await Promise.all(coloredBySlide[String(frameNo)].map(loadImage));
    } else if (id === selectedChar && Array.isArray(coloredFramesLegacy) && coloredFramesLegacy.length) {
      // Legacy array (one set for all slides)
      overlays = await Promise.all(coloredFramesLegacy.slice(0, frameCount).map(loadImage));
    } else if (id === selectedChar && coloredSingleLegacy) {
      // Legacy single image (mask at runtime no longer required; just draw once each frame)
      overlays = [await loadImage(coloredSingleLegacy)];
    }

    // Draw/animate
    let i = 0;
    const frameMs = 1000 / Math.max(1, fps);

    function draw(ix){
      const r = cvs.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);

      if (overlays) {
        const ov = overlays[ix % overlays.length]; // already masked & sized by canvas.js
        ctx.drawImage(ov, 0, 0, r.width, r.height);
      }
      const base = baseFrames[ix % baseFrames.length];
      ctx.drawImage(base, 0, 0, r.width, r.height);
    }

    // first frame immediately
    draw(0);

    // loop animation
    let rafId = 0, cancelled = false, last = performance.now();
    function tick(ts){
      if (cancelled) return;
      if (ts - last >= frameMs) { last = ts; i = (i + 1) % frameCount; draw(i); }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    animLoops.add(() => { cancelled = true; cancelAnimationFrame(rafId); ro.disconnect(); });
  } catch (e) {
    console.warn("Character failed:", id, e);
    ro.disconnect();
  }
}
