
// storyboard.js — robust slide loader with auto-discovery fallback

const qs            = new URLSearchParams(location.search);
const storyId       = (qs.get("story") || localStorage.getItem("selectedStory") || "tortoise-hare").replace(/_/g,"-");
const initialSlide  = Math.max(0, +qs.get("slide") || 0);
const selectedChar  = (qs.get("char") || localStorage.getItem("selectedCharacter") || "").toLowerCase();

const scene = document.getElementById("scene");
let manifest = null;
let idx = 0;
const animLoops = new Set();

/* ---------- utils ---------- */
const pct = n => `${n}%`;

function loadImage(src){
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("Failed to load " + src));
    im.src = src;
  });
}

async function urlExists(url){
  try{
    const r = await fetch(url, { cache: "no-store" });
    return r.ok;
  }catch{ return false; }
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

function slideNoFromPath(p){
  const m1 = /slide(\d+)\.png/i.exec(p || "");
  if (m1) return parseInt(m1[1], 10);
  const m2 = /frame(\d+)/i.exec(p || "");
  return m2 ? parseInt(m2[1], 10) : null;
}

/* ---------- caches ---------- */
const frameCache = new Map(); // `${prefix}|${count}` -> Image[]

async function getFrames(prefix, count){
  const key = `${prefix}|${count}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const frames = await Promise.all(
    Array.from({length:count}, (_,i)=>loadImage(`${prefix}${i+1}.png`))
  );
  frameCache.set(key, frames);
  return frames;
}

/* ---------- colored overlays (per-slide) ---------- */
const OVERLAY_KEY = `coloredFrames:${storyId}:${selectedChar}`;
let coloredBySlide = {};
try { coloredBySlide = JSON.parse(localStorage.getItem(OVERLAY_KEY) || "{}") || {}; }
catch { coloredBySlide = {}; }

const coloredSingleLegacy  = localStorage.getItem("coloredCharacter") || null;
let   coloredFramesLegacy  = null;
try {
  const arr = JSON.parse(localStorage.getItem("coloredCharacterFrames") || "null");
  if (Array.isArray(arr) && arr.length) coloredFramesLegacy = arr;
} catch {}

/* ---------- host for character layers ---------- */
let layerHost = document.getElementById("charHost");
if (!layerHost) {
  layerHost = document.createElement("div");
  Object.assign(layerHost.style, {
    position:"absolute", left:0, top:0, width:"100%", height:"100%", pointerEvents:"none"
  });
  scene.parentElement.appendChild(layerHost);
}
function clearCharacters(){
  for (const stop of animLoops) { try { stop(); } catch {} }
  animLoops.clear();
  layerHost.innerHTML = "";
}

/* ---------- boot ---------- */
(async function boot(){
  manifest = await loadManifestOrDiscover(storyId);
  setTitle();

  if (!manifest.slides?.length) {
    console.error("[storyboard] No slides found for story:", storyId);
    return;
  }

  await showSlide(Math.min(initialSlide, manifest.slides.length-1));

  addEventListener("keydown", (e)=>{
    if (e.key === "ArrowRight") nextSlide();
    if (e.key === "ArrowLeft")  prevSlide();
  });
})();

async function loadManifestOrDiscover(storyId){
  const slidesURL = `stories/${storyId}/slides.json`;

  // A) try slides.json safely
  try {
    const r = await fetch(slidesURL, { cache: "no-store" });
    if (r.ok) {
      const txt = await r.text();   // guard against HTML error pages
      try {
        const json = JSON.parse(txt);
        console.info("[storyboard] Using slides.json for", storyId);
        return json;
      } catch {
        console.warn("[storyboard] slides.json exists but is not valid JSON; falling back to auto-discovery.");
      }
    } else {
      console.info("[storyboard] slides.json not found (", r.status, "); using auto-discovery.");
    }
  } catch (err) {
    console.warn("[storyboard] slides.json fetch failed; using auto-discovery.", err);
  }

  // B) fallback: discover slide1.png..slideN.png
  const slides = [];
  for (let i = 1; i <= 20; i++) {
    const p = `stories/${storyId}/slide${i}.png`;
    if (await urlExists(p)) slides.push({ background:p, characters:[] });
    else if (slides.length) break; // stop after first gap once we’ve started
  }
  return {
    storyTitle: storyId.replace(/-/g, " ").replace(/\b\w/g, s=>s.toUpperCase()),
    slides
  };
}

function setTitle(){
  const h2 = document.querySelector("h2");
  if (h2) h2.textContent = `Story Scene: ${manifest?.storyTitle || "Story"}`;
}

/* ---------- navigation ---------- */
function nextSlide(){ showSlide(idx + 1); }
function prevSlide(){ showSlide(idx - 1); }
Object.assign(window, { nextSlide, prevSlide, showSlide });

/* ---------- render ---------- */
async function showSlide(i){
  idx = Math.max(0, Math.min(i, manifest.slides.length - 1));
  const s = manifest.slides[idx];

  // background first
  try {
    const bg = await loadImage(s.background);
    scene.src = bg.src;
  } catch {
    console.error("[storyboard] Background failed:", s.background);
    scene.removeAttribute("src");
  }

  clearCharacters();

  // characters (optional if slides.json provides them)
  const chars = Array.isArray(s.characters) ? s.characters : [];
  await Promise.allSettled(chars.map(cfg => {
    const basePrefix = cfg.framesPath || `images/frames/${cfg.id}/${cfg.id}`;
    const frameCount = cfg.frameCount || 4;
    const fps        = cfg.fps || 4;
    const z          = cfg.z ?? 1;
    return placeCharacter({ ...cfg, framesPath: basePrefix, frameCount, fps, z });
  }));

  // update URL + announce
  const url = new URL(location.href);
  url.searchParams.set("story", storyId);
  url.searchParams.set("slide", idx);
  history.replaceState({}, "", url);

  window.__slides = { index: idx, count: manifest.slides.length };
  window.dispatchEvent(new Event("slidechange"));
}

async function placeCharacter(c){
  const { id, x, y, w, z=1, fps=4, framesPath, frameCount=4 } = c;

  const cvs = document.createElement("canvas");
  cvs.className = `char-layer ${id}`;
  Object.assign(cvs.style, {
    position:"absolute", left:pct(x), top:pct(y), width:pct(w), height:"auto",
    zIndex:String(z), pointerEvents:"none"
  });
  layerHost.appendChild(cvs);
  const ctx = fitCanvasToCSS(cvs);
  const ro = new ResizeObserver(()=>fitCanvasToCSS(cvs));
  ro.observe(cvs);

  try {
    const baseFrames = await getFrames(framesPath, frameCount);

    // overlay selection for THIS slide
    let overlays = null;
    if (id === selectedChar) {
      const slideNo = slideNoFromPath(manifest.slides[idx]?.background);
      if (slideNo && Array.isArray(coloredBySlide[String(slideNo)])) {
        overlays = await Promise.all(coloredBySlide[String(slideNo)].map(loadImage));
      } else if (Array.isArray(coloredFramesLegacy) && coloredFramesLegacy.length) {
        overlays = await Promise.all(coloredFramesLegacy.slice(0, frameCount).map(loadImage));
      } else if (coloredSingleLegacy) {
        overlays = [await loadImage(coloredSingleLegacy)];
      }
    }

    function draw(ix){
      const r = cvs.getBoundingClientRect();
      ctx.clearRect(0,0,r.width,r.height);
      if (overlays) {
        const ov = overlays[ix % overlays.length];
        ctx.drawImage(ov, 0, 0, r.width, r.height);
      }
      const base = baseFrames[ix % baseFrames.length];
      ctx.drawImage(base, 0, 0, r.width, r.height);
    }

    // animate
    let f = 0, last = performance.now(), rafId = 0, cancelled = false;
    const frameMs = 1000 / Math.max(1, fps);
    draw(0);
    function tick(ts){
      if (cancelled) return;
      if (ts - last >= frameMs) { last = ts; f = (f+1) % frameCount; draw(f); }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    animLoops.add(() => { cancelled = true; cancelAnimationFrame(rafId); ro.disconnect(); });
  } catch (e) {
    console.warn("[storyboard] Character failed:", id, e);
    ro.disconnect();
  }
}
