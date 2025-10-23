// js/storyboard.js — colored PNG frame animation

// Use a fixed version tag instead of Date.now() to stabilize caching between refreshes
const VERSION = "2025-10-22"; // bump only when assets change

const hostname = window.location.hostname;
const port = window.location.port;

let API_BASE;
// Case 1: running locally (frontend served from localhost or 127.0.0.1)
if (hostname === "localhost" || hostname === "127.0.0.1") {
  // If you’re serving FastAPI on 5500, use that
  API_BASE = `http://${hostname}:${port}`;
}
// Case 2: production (your deployed site)
else {
  API_BASE = "https://wt-animation-github-io.onrender.com";
}

// --- Query & context (must be first) ---
const qs  = new URLSearchParams(location.search);
const ctx = JSON.parse(localStorage.getItem("ctx") || "{}");
const sessionId = localStorage.getItem("sessionCode")

// story id (keep fallback logic, normalized with dashes)
const storyId = (qs.get("story") || localStorage.getItem("selectedStory") || "tortoise-hare").replace(/_/g, "-");

// read slide from URL (CANVAS sends 1-based); else from ctx (also 1-based)
const requested1 = Number(qs.get("slide"));
const fromCtx    = Number(ctx.slide);
let initialSlide = 0;
if (!Number.isNaN(requested1)) initialSlide = Math.max(0, requested1 - 1);
else if (!Number.isNaN(fromCtx)) initialSlide = Math.max(0, fromCtx - 1);

// (optional) selected character hint
const selectedChar = (qs.get("char") || localStorage.getItem("selectedCharacter") || "").toLowerCase();

// storyIDs → repo folders (for frames)
const STORY_FOLDER_MAP = new Map([
  ["tortoise-hare", "tortoise-hare"],
  ["lion-mouse",    "lion-mouse"],
  ["little-ducks",  "little-ducks"],
  ["prince-pauper", "prince-pauper"],
  ["frog-prince",   "frog-prince"],
  ["old-mcdonald",  "old-mcdonald"],
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

framesCache.clear();

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
    im.onload  = () => res(im);
    im.onerror = () => rej(new Error("Failed to load " + src));
    im.src     = src;
  });
}

/**
 * Resize canvas only when necessary (resizing clears it),
 * and optionally redraw the current frame immediately after.
 */
function fitCanvasToCSS(cvs, redraw /* fn */){
  const r   = cvs.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;

  const W = Math.max(1, Math.round(r.width  * dpr));
  const H = Math.max(1, Math.round(r.height * dpr));

  if (cvs.width !== W || cvs.height !== H) {
    cvs.width  = W;
    cvs.height = H;
    if (typeof redraw === "function") {
      try { redraw(); } catch(e){ console.warn("[storyboard] redraw after resize failed", e); }
    }
  }
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

/* ---------- Normalize framesPath story folder defensively ---------- */
function normalizeFramesPrefix(p){
  if (!p) return p;
  // Map any incoming story folder to the canonical (dash-based) folder
  return p.replace(/images\/frames\/([^/]+)/, (_, s) => `images/frames/${resolveStoryFolder(s)}`);
}

/* ---------------- Frame loading with stable cache-buster ------------- */
async function getFrames(prefix, count){
  const key = `${prefix}|${count}`;
  if (framesCache.has(key)) return framesCache.get(key);

  // Build stable URLs using VERSION
  const urls = Array.from({ length: count }, (_, i) =>
    `${prefix}${i + 1}.png?v=${VERSION}`
  );

  // Load with logging; do not swallow silently
  const images = await Promise.all(
    urls.map(u =>
      loadImage(u).catch(err => {
        console.error("[storyboard] frame load fail:", u, err);
        return null;
      })
    )
  );

  // Enforce all-or-nothing for this character set
  if (images.some(img => !img)) {
    console.error("[storyboard] missing one or more frames for set:", urls);
    framesCache.set(key, []); // cache failure to avoid loops
    return [];
  }

  console.log("[storyboard] frames OK:", urls);
  framesCache.set(key, images);
  return images;
}

/* ----------------- Character placement ----------------- */
async function placeCharacter(cfg, slideNo){
  const { id, x, y, w, h, z = 1 } = cfg;
  const frameCount = cfg.frameCount || 4;
  const fps        = cfg.fps ?? 6;

  const host = (() => {
    let h = document.getElementById("charHost");
    if (!h){
      h = document.createElement("div");
      h.id = "charHost";
      Object.assign(h.style, {
        position:"absolute", left:0, top:0, width:"100%", height:"100%", pointerEvents:"none"
      });
      scene.parentElement.appendChild(h);
    }
    return h;
  })();

  const framesPrefix = normalizeFramesPrefix((cfg.framesPath && cfg.framesPath.trim())) ||
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
  const ctx = cvs.getContext("2d");

  // local draw helper (defined before observer so we can pass it in)
  let baseFrames = null;
  let curIx = 0;
  function draw(ix = curIx) {
    curIx = Math.min(ix, (baseFrames?.length || 1) - 1);
    const r   = cvs.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    // re-apply transform every draw (resizes reset transform)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, r.width, r.height);
    const frame = baseFrames?.[curIx];
    if (frame) ctx.drawImage(frame, 0, 0, r.width, r.height);
  }

  // initial fit + observe (redraw after any size change)
  const ro = new ResizeObserver(() => fitCanvasToCSS(cvs, () => draw(curIx)));
  fitCanvasToCSS(cvs, () => draw(curIx));
  ro.observe(cvs);
  try {
    // 1) Prefer painted frames for the selected character on this slide
    const paintedURLs = getPaintedFrames(storyId, slideNo, id);
    if (paintedURLs) {
      const imgs = await Promise.all(
        paintedURLs.map(u =>
          u ? loadImage(u).catch(err => {
                console.error("[storyboard] painted frame load fail:", u, err);
                return null;
              })
            : Promise.resolve(null)
        )
      );
      if (imgs.some(im => !im)) {
        console.error("[storyboard] painted set incomplete for", id, "slide", slideNo, paintedURLs);
        baseFrames = [];
      } else if (imgs.length) {
        baseFrames = imgs;
        if ((cfg.frameCount || 0) <= 1 && baseFrames.length > 1) {
          baseFrames = [baseFrames[0]];
        }
      }
    }

    // 2) If no painted frames, use framesPath / auto stem
    if (!baseFrames) {
      if ((frameCount || 0) <= 1) {
        // SINGLE-FRAME
        const singleURL = /\.png$/i.test(framesPrefix)
          ? `${framesPrefix}?v=${VERSION}`
          : `${framesPrefix}1.png?v=${VERSION}`;

        const img = await loadImage(singleURL).catch(err => {
          console.error("[storyboard] single-frame load fail:", singleURL, err);
          return null;
        });
        baseFrames = img ? [img] : [];
      } else {
        // MULTI-FRAME
        const stem = /\.png$/i.test(framesPrefix)
          ? framesPrefix.replace(/\.png$/i, "")
          : framesPrefix;
        baseFrames = await getFrames(stem, frameCount);
      }
    }

    // 3) Guard: if still nothing, skip this character cleanly
    if (!baseFrames || !baseFrames.length) {
      console.warn("[storyboard] no frames to draw for", id, "slide", slideNo, "prefix:", framesPrefix);
      ro.disconnect();
      return;
    }

    // first paint
    draw(0);

    // --- decide whether to animate ---
    const shouldAnimate = (frameCount > 1) && (baseFrames.length > 1) && (fps > 0);

    if (shouldAnimate) {
      let i = 0, last = performance.now(), raf = 0, stop = false;
      const frameMs = 1000 / Math.max(1, fps);
      function tick(ts) {
        if (stop) return;
        if (ts - last >= frameMs) {
          i = (i + 1) % baseFrames.length;
          curIx = i;          // keep current index synced for redraws after resize
          draw(i);
          last = ts;
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
let manifest = null;
let cur = 0;

async function discoverManifest(){
  const url = `stories/${storyId}/slides.json`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
  const txt = await r.text();
  try { return JSON.parse(txt); }
  catch { throw new Error("slides.json is invalid JSON"); }
}

// Socket
const socket = new WebSocket(`${API_BASE.replace(/^http/, "ws")}/ws/${sessionId}`);
socket.addEventListener("open", () => {
  console.log("Connected to session", sessionId);
});
socket.addEventListener("close", () => {
  console.log("Socket closed");
});
socket.addEventListener("error", (err) => {
  console.error("Socket error", err);
});

socket.addEventListener("message", async (event) => {
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch (err) {
    console.warn("Non‑JSON WS message:", event.data);
    return;
  }
  if (msg.type === "character_frames") {
    const id   = msg.character;
    const fps  = msg.fps;
    const newFrames = msg.frames;
    const currentSlideNo = msg.slide;
    console.log(typeof currentSlideNo);
    // Look up placement info for this character (from your manifest/config)
    const { x, y, w, h } = lookupPlacement(id, currentSlideNo);
    // Remove any existing placeholder canvas for this character
    const oldLayer = document.querySelector(`.char-layer.${id}`);
    if (oldLayer) oldLayer.remove();
    // Place the new character with server frames
    await placeCharacter(
      {
        id,
        x, y, w, h,
        z: 1,
        frameCount: newFrames.length,
        fps,
        serverFrames: newFrames
      },
      currentSlideNo
    );
    console.log("loaded");
  }
});

function lookupPlacement(id, slideNo) {
  const slide = manifest.slides[slideNo];
  if (!slide || !Array.isArray(slide.characters)) return {};
  //console.log(slide.characters);
  return slide.characters.find(c => c.id === id) || {};
}

async function preloadSessionState(sessionId, slideNo) {
  slideNo = slideNo +1;
  const res = await fetch(`${API_BASE}/session/${sessionId}/state`);
  const state = await res.json();
  const slideFrames = state.frames[slideNo] || {};
  Object.entries(slideFrames).forEach(([id, c]) => {
    const oldLayer = document.querySelector(`.char-layer.${id}`);
    if (oldLayer) oldLayer.remove();
    const placement = lookupPlacement(id, slideNo);
    //console.log(placement);
    placeCharacter(
      {
        id: c.id,
        x: placement.x,
        y: placement.y,
        w: placement.w,
        h: placement.h,
        z: 1,
        frameCount: c.frames.length,
        fps: c.fps,
        serverFrames: c.frames
      },
      slideNo
    );
  });
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
  //console.log(chars);
  await Promise.allSettled(
    chars.map(async c => {
      // Try to fetch server frames for this character
      let serverFrames = null;
      try {
        const res = await fetch(`${API_BASE}/session/${sessionId}/frames`);
        if (res.ok) {
          const data = await res.json(); // { frames: [...], fps, start_time, user_id }
          console.log(data);
          if (data.frames && data.frames.length) {
            serverFrames = data;
          }
        }
      } catch (err) {
        console.warn("[storyboard] server fetch failed for", c.id, err);
      }
      // Call placeCharacter with either server frames or manifest config
      return placeCharacter(
        {
          frameCount: serverFrames ? serverFrames.frames.length : (c.frameCount || 4),
          fps:        serverFrames ? serverFrames.fps : (c.fps ?? 6),
          z:          1,
          ...c,
          serverFrames: serverFrames ? serverFrames.frames : null
        },
        slideNo
      );
    })
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
  const cur = Math.min(initialSlide, manifest.slides.length - 1);
  await showSlide(cur);
  //console.log(cur);
  await preloadSessionState(sessionId, cur);

  addEventListener("keydown", e=>{
    if (e.key === "ArrowRight") nextSlide();
    if (e.key === "ArrowLeft")  prevSlide();
  });
})();
