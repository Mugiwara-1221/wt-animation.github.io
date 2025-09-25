
/* =======================================================================
   canvas_demo.js  —  DO NOT DELETE PLEASE
   ======================================================================= *

/* ------------------------------ Context -------------------------------- *

const qs  = new URLSearchParams(location.search);
const ctx = safeParse(localStorage.getItem("ctx")) || {};

const selectedStory  = (qs.get("story") || ctx.story || localStorage.getItem("selectedStory") || "tortoise-hare").replace(/_/g, "-");
const selectedChar   = (qs.get("char")  || localStorage.getItem("selectedCharacter") || "").toLowerCase();
const selectedGrade  = qs.get("grade")   || ctx.grade || "";
const sessionCode    = qs.get("session") || "";

/* Slides: upstream pages often store 1-based; we derive both forms *
const slideNum1 = Number(qs.get("slide")) || Number(ctx.slide) || 1;        // 1-based slide/page
const slideIdx0 = Math.max(0, slideNum1 - 1);                                // 0-based index for storyboard

/* -------------------------- DOM References ----------------------------- *
/* Your page should have these; we also fail-soft if they’re missing *
const drawCanvas   = document.getElementById("drawCanvas")   || makeCanvas(1024, 768);
const drawCtx      = drawCanvas.getContext("2d", { willReadFrequently: true });

const outlineCanvas = document.getElementById("outlineCanvas") || makeCanvas(drawCanvas.width, drawCanvas.height);
const outlineCtx    = outlineCanvas.getContext("2d");

const miniCanvas   = document.getElementById("miniCanvas")   || makeCanvas(256, 192);
const miniCtx      = miniCanvas.getContext("2d");

const colorInput   = document.getElementById("colorPicker");
const sizeInput    = document.getElementById("brushSize");
const clearBtn     = document.getElementById("clearBtn");
const undoBtn      = document.getElementById("undoBtn");
const redoBtn      = document.getElementById("redoBtn");
const toBoardBtn   = document.getElementById("toStoryboardBtn");

const prevAppearanceBtn = document.getElementById("prevAppearance");
const nextAppearanceBtn = document.getElementById("nextAppearance");

/* Allowed paint area: upstream sometimes sets this; fallback to full canvas *
const allowedArea = window.allowedArea || { x: 0, y: 0, width: drawCanvas.width, height: drawCanvas.height };

/* ----------------------- Story folder mapping -------------------------- *

const STORY_FOLDER_MAP = new Map([
  ["tortoise-hare", "tortoise_and_the_hare"],
  ["lion-mouse",    "lion_and_the_mouse"],
  ["little-ducks",  "5_little_ducks"],       // important for your repo
]);

function resolveStoryFolder(storyDash) {
  return STORY_FOLDER_MAP.get(storyDash) || storyDash; // default to dashed id
}

/* ------------------------------ State ---------------------------------- *

/* Appearances navigation:
   If upstream passes an array of slide indices, use it; else default to [slideIdx0].
   You can wire prev/next to cycle positions the character appears in the story. *
const appearances = Array.isArray(window.appearances) && window.appearances.length
  ? window.appearances.slice()
  : [slideIdx0];

let appearCursor = clamp(Number(window.appearCursor) || 0, 0, Math.max(0, appearances.length - 1));

/* Brush state *
let brushColor = (colorInput && colorInput.value) || "#1e90ff";
let brushSize  = (sizeInput  && Number(sizeInput.value)) || 24;
let painting   = false;

/* Undo/redo *
const undoStack = [];
const redoStack = [];
const MAX_STACK = 50;

/* ------------------------------ Utils ---------------------------------- *

function safeParse(str) { try { return JSON.parse(str || "null"); } catch { return null; } }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

async function urlExists(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok;
  } catch { return false; }
}

async function loadImageCached(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

async function loadCSVMatrix(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`CSV ${url}: HTTP ${r.status}`);
  const text = await r.text();
  const rows = text.trim().split(/\r?\n/).map(line => line.split(/[,;\t]/).map(n => Number(n)));
  const H = rows.length;
  const W = rows[0]?.length || 0;
  return { mat: rows, W, H };
}

/* ---------------- Outline / Sprite URL Resolution (outline-first) ------ *

async function resolveOutlineURLForSlide(slide1) {
  const storyFolder = resolveStoryFolder(selectedStory || "tortoise-hare");

  // 1) explicit override via ?outline=
  const outlineParam = qs.get("outline");
  if (outlineParam) return outlineParam;

  // 2) prefer story-scoped underscore first, then dash; then legacy flat
  const candidates = [
    `images/outline/${storyFolder}/${selectedChar}_transparent.png`,
    `images/outline/${storyFolder}/${selectedChar}-transparent.png`,
    `images/outline/${selectedChar}_transparent.png`,
    `images/outline/${selectedChar}-transparent.png`,
  ];
  for (const u of candidates) {
    if (await urlExists(u)) return u;
  }

  // 3) per-frame overlay as a fallback
  const overlay = `images/frames/${storyFolder}/frame${slide1}/${selectedChar}/${selectedChar}1.png`;
  if (await urlExists(overlay)) return overlay;

  // 4) final fallback: sprite path
  return await resolveSpriteURL();
}

async function resolveSpriteURL() {
  // ?sprite= override
  const spriteParam = qs.get("sprite");
  if (spriteParam) return spriteParam;

  // slide-scoped manifest first
  try {
    const m1 = `stories/${selectedStory}/slides/${slideNum1}/characters.json`;
    const r1 = await fetch(m1, { cache: "no-store" });
    if (r1.ok) {
      const manifest = await r1.json();
      const hit = (manifest.characters || []).find(c => (c.id || "").toLowerCase() === selectedChar);
      if (hit?.sprite) return hit.sprite;
    }
  } catch {}

  // legacy story manifest
  try {
    const m0 = `stories/${selectedStory}/characters.json`;
    const r0 = await fetch(m0, { cache: "no-store" });
    if (r0.ok) {
      const manifest = await r0.json();
      const hit = (manifest.characters || []).find(c => (c.id || "").toLowerCase() === selectedChar);
      if (hit?.sprite) return hit.sprite;
    }
  } catch {}

  // last-resort flat outline (dash form)
  return `images/outline/${selectedChar}-transparent.png`;
}

/* ------------------------- Mask discovery (slide-aware) ---------------- *

async function findMaskSets(storyIdDash, charId, slide1) {
  const storyFolder = resolveStoryFolder(storyIdDash);
  const base   = `images/frames/${storyFolder}`;
  const prefix = `${base}/frame${slide1}/${charId}/${charId}_mask_`;
  const sets   = [];
  if (await urlExists(`${prefix}1.csv`)) sets.push({ frame: slide1, prefix });
  return sets;
}

/* ---------------------------- Mini Preview ----------------------------- *

function updateMiniPreview() {
  // Draw the current canvas into the mini preview
  try {
    miniCtx.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
    miniCtx.drawImage(drawCanvas, 0, 0, miniCanvas.width, miniCanvas.height);
  } catch {}
}

/* ----------------------------- Painting -------------------------------- *

function pushUndo() {
  try {
    if (undoStack.length >= MAX_STACK) undoStack.shift();
    undoStack.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
    // clear redo on new action
    redoStack.length = 0;
  } catch {}
}

function undo() {
  if (!undoStack.length) return;
  try {
    const state = undoStack.pop();
    const now   = drawCtx.getImageData(0,0,drawCanvas.width,drawCanvas.height);
    if (redoStack.length >= MAX_STACK) redoStack.shift();
    redoStack.push(now);
    drawCtx.putImageData(state, 0, 0);
    updateMiniPreview();
  } catch {}
}

function redo() {
  if (!redoStack.length) return;
  try {
    const state = redoStack.pop();
    pushUndo(); // push current before overwriting
    drawCtx.putImageData(state, 0, 0);
    updateMiniPreview();
  } catch {}
}

/* pen drawing restricted to allowedArea *
function inAllowedArea(x, y) {
  const { x: ax, y: ay, width: aw, height: ah } = allowedArea;
  return x >= ax && y >= ay && x < ax + aw && y < ay + ah;
}

function startPaint(e) {
  const { x, y } = eventPos(e, drawCanvas);
  if (!inAllowedArea(x, y)) return;
  pushUndo();
  painting = true;
  drawCtx.lineCap   = "round";
  drawCtx.lineJoin  = "round";
  drawCtx.strokeStyle = brushColor;
  drawCtx.lineWidth = brushSize;
  drawCtx.beginPath();
  drawCtx.moveTo(x, y);
}

function movePaint(e) {
  if (!painting) return;
  const { x, y } = eventPos(e, drawCanvas);
  drawCtx.lineTo(x, y);
  drawCtx.stroke();
}

function endPaint() {
  if (!painting) return;
  painting = false;
  updateMiniPreview();
}

function eventPos(e, el) {
  const rect = el.getBoundingClientRect();
  const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
  const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
  return {
    x: (clientX - rect.left) * (el.width / rect.width),
    y: (clientY - rect.top)  * (el.height / rect.height),
  };
}

/* --------------------- Load Outline for Current Slide ------------------ *

async function loadOutlineForCurrentSlide() {
  outlineCtx.clearRect(0, 0, outlineCanvas.width, outlineCanvas.height);
  const slide1 = Math.max(1, appearances[appearCursor] + 1);
  const url = await resolveOutlineURLForSlide(slide1);
  try {
    if (url && (await urlExists(url))) {
      const img = await loadImageCached(url);
      outlineCtx.clearRect(0,0,outlineCanvas.width,outlineCanvas.height);
      outlineCtx.drawImage(img, 0, 0, outlineCanvas.width, outlineCanvas.height);
    }
  } catch {}
}

/* -------------------- Appearances Navigation (optional) ---------------- *

function setAppearanceIndex(idx) {
  appearCursor = clamp(idx, 0, Math.max(0, appearances.length - 1));
  // Update outline to reflect the new slide
  loadOutlineForCurrentSlide();
  // Optionally clear or keep paint; here we keep paint but you can clear:
  // drawCtx.clearRect(0,0,drawCanvas.width,drawCanvas.height);
  updateMiniPreview();
}

if (prevAppearanceBtn) {
  prevAppearanceBtn.addEventListener("click", () => {
    setAppearanceIndex(appearCursor - 1);
  });
}
if (nextAppearanceBtn) {
  nextAppearanceBtn.addEventListener("click", () => {
    setAppearanceIndex(appearCursor + 1);
  });
}

/* ------------------------ Send to Storyboard --------------------------- *

async function sendToStoryboard() {
  try {
    const { x, y, width, height } = allowedArea;

    /* Crop the painted region *
    const crop = document.createElement("canvas");
    crop.width = width; crop.height = height;
    crop.getContext("2d").drawImage(drawCanvas, x, y, width, height, 0, 0, width, height);

    /* Build colored region images keyed by slide number (1-based frames) *
    const bySlide = {};
    const storyFolder = resolveStoryFolder(selectedStory || "tortoise-hare");

    // Active appearance → 0-based slide index; +1 for frame folder
    const globalIdx = appearances.length ? appearances[appearCursor] : slideIdx0;
    const slide1    = globalIdx + 1;

    // Try mask CSV for this slide
    const sets = await findMaskSets(selectedStory, selectedChar, slide1);

    if (sets.length) {
      for (const { frame, prefix } of sets) {
        const list = [];
        const csvURL = `${prefix}1.csv`;
        if (!(await urlExists(csvURL))) continue;

        const { mat, W, H } = await loadCSVMatrix(csvURL);
        const uniqueIds = [...new Set(mat.flat())].filter(id => id !== 0);

        for (const regionId of uniqueIds) {
          // build a white mask for this region
          const maskCanvas = document.createElement("canvas");
          maskCanvas.width = W; maskCanvas.height = H;
          const mc = maskCanvas.getContext("2d");
          const imgData = mc.createImageData(W, H);
          for (let yy = 0; yy < H; yy++) {
            for (let xx = 0; xx < W; xx++) {
              if (mat[yy][xx] === regionId) {
                const i = (yy * W + xx) * 4;
                imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = 255;
                imgData.data[i + 3] = 255;
              }
            }
          }
          mc.putImageData(imgData, 0, 0);

          // scale mask to paint size
          const scaledMask = document.createElement("canvas");
          scaledMask.width = width; scaledMask.height = height;
          scaledMask.getContext("2d").drawImage(maskCanvas, 0, 0, width, height);

          // apply mask to the cropped paint
          const masked = document.createElement("canvas");
          masked.width = width; masked.height = height;
          const mctx = masked.getContext("2d");
          mctx.drawImage(crop, 0, 0);
          mctx.globalCompositeOperation = "destination-in";
          mctx.drawImage(scaledMask, 0, 0);
          mctx.globalCompositeOperation = "source-over";

          const blob = await new Promise(res => masked.toBlob(res, "image/png"));
          const url = URL.createObjectURL(blob);
          list.push({ regionId, img: url, frame, maskIndex: 1 });
        }
        if (list.length) bySlide[frame] = list;
      }
    } else {
      // Fallback outline: overlay THIS slide’s frame overlay if present
      const merged = document.createElement("canvas");
      merged.width = width; merged.height = height;
      const mctx = merged.getContext("2d");
      mctx.drawImage(crop, 0, 0);

      const overlay = `images/frames/${storyFolder}/frame${slide1}/${selectedChar}/${selectedChar}1.png`;
      try {
        if (await urlExists(overlay)) {
          const ol = await loadImageCached(overlay);
          mctx.drawImage(ol, 0, 0, width, height);
        }
      } catch {}
      const blob = await new Promise(res => merged.toBlob(res, "image/png"));
      const url  = URL.createObjectURL(blob);
      bySlide[slide1] = [{ regionId: 1, img: url, frame: slide1, maskIndex: 1 }];
    }

    /* Persist for storyboard consumption *
    const imageOnlyBySlide = {};
    for (const [frame, regions] of Object.entries(bySlide)) {
      imageOnlyBySlide[frame] = regions.map(r => r.img);
    }
    localStorage.setItem(`coloredFrames:${storyFolder}:${selectedChar}`, JSON.stringify(imageOnlyBySlide));

    // Convenience keys used elsewhere
    const firstFrame = Object.values(imageOnlyBySlide)[0];
    if (firstFrame?.length) {
      localStorage.setItem("coloredCharacterFrames", JSON.stringify(firstFrame));
      localStorage.setItem("coloredCharacter", firstFrame[0]);
    }
    localStorage.setItem("selectedCharacter", selectedChar);

    /* Navigate to storyboard WITH correct (0-based) slide index *
    const q = new URLSearchParams({ story: selectedStory, char: selectedChar, slide: String(globalIdx) });
    if (sessionCode)   q.set("session", sessionCode);
    if (selectedGrade) q.set("grade",   selectedGrade);
    location.href = `storyboard.html?${q.toString()}`;

  } catch (err) {
    console.error("[sendToStoryboard] failed:", err);
    alert("Send to Storyboard failed. See console for details.");
  }
}

/* ------------------------------ Wiring --------------------------------- *

/* Brush UI *
if (colorInput) colorInput.addEventListener("input", e => { brushColor = e.target.value || "#1e90ff"; });
if (sizeInput)  sizeInput.addEventListener("input",  e => { brushSize  = Number(e.target.value) || 24; });

/* Undo/Redo/Clear *
if (undoBtn) undoBtn.addEventListener("click", undo);
if (redoBtn) redoBtn.addEventListener("click", redo);
if (clearBtn) clearBtn.addEventListener("click", () => {
  pushUndo();
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  updateMiniPreview();
});

/* Paint events (mouse + touch) *
drawCanvas.addEventListener("mousedown", startPaint);
drawCanvas.addEventListener("mousemove", movePaint);
window.addEventListener("mouseup", endPaint);
drawCanvas.addEventListener("touchstart", e => { e.preventDefault(); startPaint(e); }, { passive:false });
drawCanvas.addEventListener("touchmove",  e => { e.preventDefault(); movePaint(e);  }, { passive:false });
drawCanvas.addEventListener("touchend",   e => { e.preventDefault(); endPaint();    }, { passive:false });

/* Send to storyboard button *
if (toBoardBtn) toBoardBtn.addEventListener("click", sendToStoryboard);

/* Expose helpers for debugging in Console (optional) *
window.updateMiniPreview = window.updateMiniPreview || updateMiniPreview;
window.sendToStoryboard  = window.sendToStoryboard  || sendToStoryboard;

/* ------------------------------- Boot ---------------------------------- *

(async function boot() {
  try {
    // Load the outline for current appearance/slide
    await loadOutlineForCurrentSlide();

    // Initialize mini preview with current canvas content (blank at start)
    updateMiniPreview();
  } catch (e) {
    console.warn("[boot] outline load failed:", e);
  }
})();

/* =============================== EOF =================================== */


/* ---------- Slider cosmetics (optional) ---------- */
/*function updateSliderFill(slider)
  if(!slider)*/






"use strict";

/* ---------- Optional Azure submit (safe if not present) ---------- */
let submitDrawing = async () => {};
try {
  const m = await import("./azure-api.js");
  submitDrawing = m.submitDrawing || submitDrawing;
} catch {}
/* =======================================================================
   canvas_demo.js — slide-aware, outline-first, mini preview intact,
                    appearances navigation, brush/undo/redo, zoom,
                    correct storyboard handoff (0-based slide).
   ======================================================================= */

/* -------------------------- Query/Context -------------------------- */
const urlParams   = new URLSearchParams(location.search);
const ctx         = safeParse(localStorage.getItem("ctx")) || {};
const selectedStory  = (urlParams.get("story") || localStorage.getItem("selectedStory") || ctx.story || "tortoise-hare").replace(/_/g, "-");
const selectedChar   = (urlParams.get("char")  || localStorage.getItem("selectedCharacter") || "").toLowerCase();
const selectedGrade  = urlParams.get("grade")   || ctx.grade || "";
const sessionCode    = urlParams.get("session") || localStorage.getItem("sessionCode") || "";
const spriteParam    = urlParams.get("sprite")  || "";
const outlineParam   = urlParams.get("outline") || "";

// earlier pages often store 1-based slide; we derive both
const slideNum1 = Number(urlParams.get("slide")) || Number(ctx.slide) || 1; // 1-based
const slideIdx0 = Math.max(0, slideNum1 - 1);                                 // 0-based for storyboard

/* ------------------------------ DOM ------------------------------- */
const bgCanvas     = document.getElementById("bgCanvas")     || makeCanvas(1024, 768);
const drawCanvas   = document.getElementById("drawCanvas")   || makeCanvas(1024, 768);
const spriteCanvas = document.getElementById("spriteCanvas") || makeCanvas(1024, 768);

const bgCtx = bgCanvas.getContext("2d");
const ctx2  = drawCanvas.getContext("2d");  // avoid name clash with other ctx usage
const sctx  = spriteCanvas.getContext("2d");

// Mini preview + appearances-only nav
const previewCanvas = document.getElementById("previewCanvas");
const pctx          = previewCanvas ? previewCanvas.getContext("2d") : null;
const prevAppBtn    = document.getElementById("prevAppBtn");
const nextAppBtn    = document.getElementById("nextAppBtn");

// Inputs / controls (optional, fail-soft)
const brushSlider   = document.querySelector(".brush-size-slider");
const opacitySlider = document.querySelector(".opacity-slider");
const colorInput    = document.querySelector(".pick-color");
const toBoardBtn    = document.getElementById("toStoryboardBtn");

// full-window sprite box
const SPRITE_BOX_SIZE = 600;
let allowedArea = { x: 0, y: 0, width: 0, height: 0 };

// store selected char for other pages
localStorage.setItem("selectedCharacter", selectedChar);

/* ----------------------- Repo mapping ---------------------------- */
const STORY_FOLDER_MAP = new Map([
  ["tortoise-hare", "tortoise_and_the_hare"],
  ["lion-mouse",    "lion_and_the_mouse"],
  ["little-ducks",  "5_little_ducks"],
]);
function resolveStoryFolder(storyIdDash) {
  const id = (storyIdDash || "").replace(/_/g, "-");
  return STORY_FOLDER_MAP.get(id) || id;
}

/* -------------------------- Utilities ---------------------------- */
function safeParse(str) { try { return JSON.parse(str || "null"); } catch { return null; } }
function makeCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
async function urlExists(url) { try { const r = await fetch(url, { cache: "no-store" }); return r.ok; } catch { return false; } }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

const imgCache = new Map();
function loadImageCached(src){
  if (!src) return Promise.reject(new Error("no src"));
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
  imgCache.set(src, p);
  return p;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // important if loading from another domain
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

async function loadSlidesManifest(storyIdDash){
  const url = `stories/${storyIdDash}/slides.json`;
  try { const r = await fetch(url, { cache:"no-store" }); if (!r.ok) throw 0; return await r.json(); }
  catch { return { slides: [] }; }
}
function buildAppearances(manifest, charId){
  const out = [];
  (manifest.slides || []).forEach((sl, idx) => {
    const has = Array.isArray(sl.characters) && sl.characters.some(c => (c.id||"").toLowerCase() === charId);
    if (has) out.push(idx);
  });
  return out;
}
function perSlidePaintKey(story, charId, slide1){
  return `perSlidePaint:${story}:${charId}:${slide1}`;
}

/* ---------------- Outline / Sprite Resolution ------------------- */
async function resolveSpriteURL() {
  if (spriteParam) return spriteParam;

  // slide-scoped manifest (optional pattern)
  try {
    const m1 = `stories/${selectedStory}/slides/${slideNum1}/characters.json`;
    const r1 = await fetch(m1, { cache: "no-store" });
    if (r1.ok) {
      const manifest = await r1.json();
      const hit = (manifest.characters || []).find(c => (c.id || "").toLowerCase() === selectedChar);
      if (hit?.sprite) return hit.sprite;
    }
  } catch {}

  // legacy story-wide manifest
  try {
    const m0 = `stories/${selectedStory}/characters.json`;
    const r0 = await fetch(m0, { cache: "no-store" });
    if (r0.ok) {
      const manifest = await r0.json();
      const hit = (manifest.characters || []).find(c => (c.id || "").toLowerCase() === selectedChar);
      if (hit?.sprite) return hit.sprite;
    }
  } catch {}

  // story-scoped outlines, then legacy flat
  const storyFolder = resolveStoryFolder(selectedStory || "tortoise-hare");
  const candidates = [
    `images/outline/${storyFolder}/${selectedChar}_transparent.png`,
    `images/outline/${storyFolder}/${selectedChar}-transparent.png`,
    `images/outline/${selectedChar}_transparent.png`,
    `images/outline/${selectedChar}-transparent.png`,
  ];
  for (const u of candidates) {
    if (await urlExists(u)) return u;
  }
  return `images/outline/${selectedChar}-transparent.png`;
}

async function resolveOutlineURLForSlide(slide1) {
  const storyFolder = resolveStoryFolder(selectedStory || "tortoise-hare");

  // 1) ?outline= override
  if (outlineParam) return outlineParam;

  // 2) story-scoped underscore, then dash; then flat
  const tries = [
    `images/outline/${storyFolder}/${selectedChar}_transparent.png`,
    `images/outline/${storyFolder}/${selectedChar}-transparent.png`,
    `images/outline/${selectedChar}_transparent.png`,
    `images/outline/${selectedChar}-transparent.png`,
  ];
  for (const url of tries) {
    if (await urlExists(url)) return url;
  }
  // 3) frame overlay fallback
  const frame1 = `images/frames/${storyFolder}/frame${slide1}/${selectedChar}/${selectedChar}1.png`;
  if (await urlExists(frame1)) return frame1;
  // 4) fallback
  return await resolveSpriteURL();
}

/* -------------------- Layout & Preview -------------------------- */
function getSpriteBox() {
  const size = SPRITE_BOX_SIZE;
  return {
    width:  size,
    height: size,
    x: Math.round((bgCanvas.width  - size) / 2),
    y: Math.round((bgCanvas.height - size) / 2),
  };
}
function drawWhiteBG() {
  bgCtx.fillStyle = "#ffffff";
  bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
}

let outlineLoaded = false;
const outlineImg = new Image();
outlineImg.onload  = () => { outlineLoaded = true; layoutAndRedraw(); };
outlineImg.onerror = () => alert(`Could not load character image: ${outlineImg.src}`);

function layoutAndRedraw() {
  const w = innerWidth, h = innerHeight;
  for (const c of [bgCanvas, drawCanvas, spriteCanvas]) {
    c.width = w; c.height = h;
    c.style.width = w + "px";
    c.style.height = h + "px";
  }
  drawWhiteBG();

  if (outlineLoaded) {
    const box = getSpriteBox();
    allowedArea = { ...box };
    sctx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(outlineImg, box.x, box.y, box.width, box.height);
  }
  schedulePreview();
}
addEventListener("resize", layoutAndRedraw);

/* ----------------------- Brush & Drawing ------------------------- */
let drawing = false;
let currentTool = "draw";
let brushSize   = 18;
let brushColor  = "#2ad0ff";
let opacity     = 1.0;
let prevX = null, prevY = null;
let zoomLevel = 1;

function setTool(tool){ currentTool = tool; }
colorInput?.addEventListener("change", () => { brushColor = colorInput.value; });
brushSlider?.addEventListener("input", () => { brushSize = parseInt(brushSlider.value, 10); });
opacitySlider?.addEventListener("input", () => { opacity = parseFloat(opacitySlider.value); });

function getPos(e){
  const r = drawCanvas.getBoundingClientRect();
  const clientX = e.clientX ?? e.touches?.[0]?.clientX;
  const clientY = e.clientY ?? e.touches?.[0]?.clientY;
  return [(clientX - r.left) / zoomLevel, (clientY - r.top) / zoomLevel];
}
function isInBounds(x, y){
  return x >= allowedArea.x && x <= allowedArea.x + allowedArea.width &&
         y >= allowedArea.y && y <= allowedArea.y + allowedArea.height;
}

ctx2.lineJoin = "round";
ctx2.lineCap  = "round";
ctx2.imageSmoothingEnabled = true;

/* History */
let history = [], redoStack = [];
function saveHistory(){ history.push(ctx2.getImageData(0,0,drawCanvas.width,drawCanvas.height)); if (history.length>40) history.shift(); redoStack=[]; }
function undo(){ if(!history.length) return; redoStack.push(ctx2.getImageData(0,0,drawCanvas.width,drawCanvas.height)); ctx2.putImageData(history.pop(),0,0); persistCurrentAppearance(); schedulePreview(); }
function redo(){ if(!redoStack.length) return; saveHistory(); ctx2.putImageData(redoStack.pop(),0,0); persistCurrentAppearance(); schedulePreview(); }

/* Circle brush */
function dotAt(x,y){
  ctx2.beginPath();
  ctx2.arc(x, y, brushSize/2, 0, Math.PI*2);
  ctx2.fillStyle = (currentTool === "erase") ? "#000" : brushColor;
  ctx2.globalAlpha = opacity;
  ctx2.globalCompositeOperation = (currentTool === "erase") ? "destination-out" : "source-over";
  ctx2.fill();
}
function stampSegment(x0,y0,x1,y1){
  const dx=x1-x0, dy=y1-y0, dist=Math.hypot(dx,dy);
  if (dist===0){ dotAt(x0,y0); return; }
  const step = Math.max(1,(brushSize/2)*0.6);
  const count = Math.ceil(dist/step);
  for (let i=0;i<=count;i++){ const t=i/count; dotAt(x0+dx*t,y0+dy*t); }
}

function drawStroke(e){
  if(!drawing) return;
  const [x,y] = getPos(e);
  if(!isInBounds(x,y)) return;

  if(prevX==null || prevY==null){ dotAt(x,y); }
  else{
    ctx2.globalAlpha = opacity;
    ctx2.globalCompositeOperation = (currentTool === "erase") ? "destination-out" : "source-over";
    ctx2.strokeStyle = brushColor; ctx2.lineWidth = brushSize;
    ctx2.beginPath(); ctx2.moveTo(prevX,prevY); ctx2.lineTo(x,y); ctx2.stroke();
    stampSegment(prevX,prevY,x,y);
  }
  prevX=x; prevY=y;
  schedulePreview();
}

/* Mouse / touch */
drawCanvas.addEventListener("mousedown", e => {
  const [x,y]=getPos(e);
  if(isInBounds(x,y)){ saveHistory(); drawing=true; prevX=prevY=null; drawStroke(e); }
});
drawCanvas.addEventListener("mousemove", drawStroke);
addEventListener("mouseup",   () => { drawing=false; prevX=prevY=null; persistCurrentAppearance(); schedulePreview(); });
drawCanvas.addEventListener("mouseout",  () => { drawing=false; prevX=prevY=null; });

drawCanvas.addEventListener("touchstart", e => {
  const [x,y]=getPos(e);
  if(isInBounds(x,y)){ saveHistory(); drawing=true; prevX=prevY=null; drawStroke(e.touches[0]); }
},{ passive:true });
drawCanvas.addEventListener("touchmove", e => { e.preventDefault(); drawStroke(e.touches[0]); }, { passive:false });
drawCanvas.addEventListener("touchend",  () => { drawing=false; prevX=prevY=null; persistCurrentAppearance(); schedulePreview(); });

/* Clear + zoom */
function clearCanvas(){ ctx2.clearRect(0,0,drawCanvas.width,drawCanvas.height); layoutAndRedraw(); persistCurrentAppearance(); }
function zoomIn(){  zoomLevel*=1.1; applyZoom(); }
function zoomOut(){ zoomLevel/=1.1; applyZoom(); }
function applyZoom(){
  for (const c of [bgCanvas, drawCanvas, spriteCanvas]){
    c.style.transformOrigin="center center";
    c.style.transform=`scale(${zoomLevel})`;
  }
  schedulePreview();
}

/* Save dropdown (optional) */
function toggleSaveOptions(){ document.getElementById("saveOptions")?.classList.toggle("hidden"); }
function downloadImage(){
  const merged=document.createElement("canvas");
  merged.width=drawCanvas.width; merged.height=drawCanvas.height;
  const m=merged.getContext("2d");
  m.fillStyle="white"; m.fillRect(0,0,merged.width,merged.height);
  m.drawImage(drawCanvas,0,0); m.drawImage(spriteCanvas,0,0);
  const a=document.createElement("a"); a.download="my_drawing.png"; a.href=merged.toDataURL(); a.click();
  document.getElementById("saveOptions")?.classList.add("hidden");
}

/* ---------- CSV → alpha mask helpers ---------- */
async function loadCSVMatrix(url){
  const resp=await fetch(url,{cache:"no-store"}); if(!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const text=await resp.text(); const rows=text.trim().split(/\r?\n/);
  const mat=rows.map(r=>r.split(",").map(v=>+v)); const H=mat.length, W=mat[0]?.length||0;
  if(!W||!H) throw new Error(`Empty/invalid CSV: ${url}`);
  return { mat, W, H };
}
async function matrixToMaskCanvas(mat, srcW, srcH, targetW, targetH){
  const src=document.createElement("canvas"); src.width=srcW; src.height=srcH;
  const cSrc=src.getContext("2d"); const imgData=cSrc.createImageData(srcW,srcH); let k=0;
  for(let y=0;y<srcH;y++){ const row=mat[y]; for(let x=0;x<srcW;x++){ const a=row?.[x]?255:0;
    imgData.data[k++]=255; imgData.data[k++]=255; imgData.data[k++]=255; imgData.data[k++]=a; } }
  cSrc.putImageData(imgData,0,0);
  const scaled=document.createElement("canvas"); scaled.width=targetW; scaled.height=targetH;
  const cTgt=scaled.getContext("2d"); cTgt.imageSmoothingEnabled=false; cTgt.drawImage(src,0,0,targetW,targetH);
  return scaled;
}

/* ----------------- Appearances & Preview ------------------------ */
const previewBuffer = (() => {
  const c = document.createElement("canvas");
  c.width  = previewCanvas ? previewCanvas.width  : 0;
  c.height = previewCanvas ? previewCanvas.height : 0;
  return c;
})();
const pb = previewBuffer.getContext("2d");

function ensurePreviewDimsFor(bgIm){
  const sceneW = bgIm.naturalWidth  || bgIm.width  || 1600;
  const sceneH = bgIm.naturalHeight || bgIm.height || 900;
  const MAX_W = 320, MAX_H = 200;
  const scale = Math.min(MAX_W/sceneW, MAX_H/sceneH);
  const cw = Math.max(1, Math.round(sceneW*scale));
  const ch = Math.max(1, Math.round(sceneH*scale));
  if (previewCanvas && (previewCanvas.width!==cw || previewCanvas.height!==ch)){
    previewCanvas.width=cw; previewCanvas.height=ch;
    previewCanvas.style.width=`${cw}px`; previewCanvas.style.height=`${ch}px`;
  }
  if (previewBuffer.width!==cw || previewBuffer.height!==ch){
    previewBuffer.width=cw; previewBuffer.height=ch;
  }
  return { sceneW, sceneH };
}

let previewScheduled=false;
function schedulePreview(){
  if(previewScheduled) return;
  previewScheduled=true;
  requestAnimationFrame(()=>{ previewScheduled=false; drawPreview(); });
}

let slidesManifest=null;
let appearances=[];
let appearCursor=0;

async function drawPreview(){
  if(!pctx || !slidesManifest || !appearances.length){
    if(pctx) pctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
    return;
  }
  const globalIdx=appearances[appearCursor];
  const slide=slidesManifest.slides[globalIdx]; if(!slide) return;

  try{
    const bgIm=await loadImageCached(slide.background);
    const { sceneW, sceneH } = ensurePreviewDimsFor(bgIm);
    const scale = Math.min(previewBuffer.width/sceneW, previewBuffer.height/sceneH);
    const vw=sceneW*scale, vh=sceneH*scale;
    const ox=(previewBuffer.width-vw)/2, oy=(previewBuffer.height-vh)/2;

    pb.clearRect(0,0,previewBuffer.width,previewBuffer.height);
    pb.drawImage(bgIm, ox, oy, vw, vh);

    const charCfg=(slide.characters||[]).find(c => (c.id||"").toLowerCase()===selectedChar);
    if(charCfg){
      const dx=ox + (charCfg.x/100)*vw;
      const dy=oy + (charCfg.y/100)*vh;
      const dw=(charCfg.w/100)*vw;
      const dh=dw;

      const sprite=document.createElement("canvas");
      sprite.width=Math.max(1,Math.round(dw));
      sprite.height=Math.max(1,Math.round(dh));
      const scx=sprite.getContext("2d"); scx.imageSmoothingEnabled=false;
      scx.drawImage(drawCanvas, allowedArea.x,allowedArea.y,allowedArea.width,allowedArea.height, 0,0,sprite.width,sprite.height);

      try{
        const storyFolder=resolveStoryFolder(selectedStory || "tortoise-hare");
        const csvURL=`images/frames/${storyFolder}/frame${globalIdx+1}/${selectedChar}/${selectedChar}_mask_1.csv`;
        if(await urlExists(csvURL)){
          const { mat,W,H }=await loadCSVMatrix(csvURL);
          const mask=await matrixToMaskCanvas(mat,W,H,sprite.width,sprite.height);
          scx.globalCompositeOperation="destination-in"; scx.drawImage(mask,0,0); scx.globalCompositeOperation="source-over";
        }
      }catch{}

      pb.drawImage(sprite, dx,dy,dw,dh);

      try{
        const storyFolder=resolveStoryFolder(selectedStory || "tortoise-hare");
        const frame1=`images/frames/${storyFolder}/frame${globalIdx+1}/${selectedChar}/${selectedChar}1.png`;
        if(await urlExists(frame1)){ const ol=await loadImageCached(frame1); pb.drawImage(ol, dx,dy,dw,dh); }
      }catch{}
    }

    pctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
    pctx.drawImage(previewBuffer,0,0);
  }catch{
    pctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
  }
}

async function gotoAppearance(n){
  if(!appearances.length) return;
  if(n<0 || n>=appearances.length) return;
  appearCursor=n;
  const outlineURL=await resolveOutlineURLForSlide(appearances[appearCursor]+1);
  outlineImg.src=outlineURL;
  restoreCurrentAppearance();
  schedulePreview();
}
function nextAppearance(){ gotoAppearance(appearCursor+1); }
function prevAppearance(){ gotoAppearance(appearCursor-1); }
prevAppBtn?.addEventListener("click", prevAppearance);
nextAppBtn?.addEventListener("click", nextAppearance);

/* per-slide autosave/restore */
function persistCurrentAppearance(){
  if(!appearances.length) return;
  const slide1=appearances[appearCursor]+1;
  const crop=document.createElement("canvas"); crop.width=allowedArea.width; crop.height=allowedArea.height;
  crop.getContext("2d").drawImage(drawCanvas, allowedArea.x,allowedArea.y,allowedArea.width,allowedArea.height, 0,0,allowedArea.width,allowedArea.height);
  localStorage.setItem(perSlidePaintKey(selectedStory || "tortoise-hare",selectedChar,slide1), crop.toDataURL("image/png"));
}
function restoreCurrentAppearance(){
  ctx2.clearRect(0,0,drawCanvas.width,drawCanvas.height);
  if(!appearances.length) return;
  const slide1=appearances[appearCursor]+1;
  const dataURL=localStorage.getItem(perSlidePaintKey(selectedStory || "tortoise-hare",selectedChar,slide1));
  if(!dataURL) return;
  const img=new Image();
  img.onload=()=>{ ctx2.drawImage(img,0,0,img.width,img.height, allowedArea.x,allowedArea.y,allowedArea.width,allowedArea.height); schedulePreview(); };
  img.src=dataURL;
}

/* ---------------------- Mask discovery (slide-aware) ------------------- */
async function findMaskSets(storyIdDash, charId, slide1){
  const storyFolder=resolveStoryFolder(storyIdDash);
  const base=`images/frames/${storyFolder}`;
  const prefix=`${base}/frame${slide1}/${charId}/${charId}_mask_`;
  const out=[];
  if (await urlExists(`${prefix}1.csv`)) out.push({ frame: slide1, prefix });
  return out;
}

/* -------------------------- Send to Storyboard ------------------------- */
async function sendToStoryboard() {
  try {
    const { x, y, width, height } = allowedArea;

    // Crop the painted region
    const crop = document.createElement("canvas");
    crop.width = width; crop.height = height;
    crop.getContext("2d").drawImage(drawCanvas, x, y, width, height, 0, 0, width, height);

    // --- compute the correct slide indices ---
    const q = new URLSearchParams(location.search);
    const slideParam1 = Number(q.get("slide")); // 1-based on the canvas page
    const fromAppear0 = (Array.isArray(appearances) && appearances.length) ? appearances[appearCursor] : NaN;
    const ctxSlide1   = Number((JSON.parse(localStorage.getItem("ctx") || "{}")).slide);

    let slide1    = 1; // 1-based for frame paths
    let globalIdx = 0; // 0-based for storyboard

    if (!Number.isNaN(slideParam1)) {
      slide1    = Math.max(1, slideParam1);
      globalIdx = slide1 - 1;
    } else if (!Number.isNaN(fromAppear0)) {
      globalIdx = Math.max(0, fromAppear0);
      slide1    = globalIdx + 1;
    } else if (!Number.isNaN(ctxSlide1)) {
      slide1    = Math.max(1, ctxSlide1);
      globalIdx = slide1 - 1;
    }

    const storyFolder = resolveStoryFolder(selectedStory || "tortoise-hare");
    const bySlide = {};

    // ✅ PASS slide1 to findMaskSets (was missing before)
    const sets = await findMaskSets(selectedStory || "tortoise-hare", selectedChar, slide1);
    const staticChars = ["tortoise", "mouse", "mama_duck"];

    if (!staticChars.includes(selectedChar.toLowerCase())) {
      for (const { frame, prefix } of sets) {
        const list = [];
        const csvURL = `${prefix}1.csv`;
        if (!(await urlExists(csvURL))) continue;

        const { mat, W, H } = await loadCSVMatrix(csvURL);
        const uniqueIds = [...new Set(mat.flat())].filter(id => id !== 0);

        for (const regionId of uniqueIds) {
          // build a white mask for this region
          const maskCanvas = document.createElement("canvas");
          maskCanvas.width = W; maskCanvas.height = H;
          const mc = maskCanvas.getContext("2d");
          const imgData = mc.createImageData(W, H);
          for (let yy = 0; yy < H; yy++) {
            for (let xx = 0; xx < W; xx++) {
              if (mat[yy][xx] === regionId) {
                const i = (yy * W + xx) * 4;
                imgData.data[i]     = 255;
                imgData.data[i + 1] = 255;
                imgData.data[i + 2] = 255;
                imgData.data[i + 3] = 255;
              }
            }
          }
          mc.putImageData(imgData, 0, 0);

          // scale mask to the paint size
          const scaledMask = document.createElement("canvas");
          scaledMask.width = width; scaledMask.height = height;
          scaledMask.getContext("2d").drawImage(maskCanvas, 0, 0, width, height);

          // apply mask to the cropped paint
          const masked = document.createElement("canvas");
          masked.width = width; masked.height = height;
          const mctx = masked.getContext("2d");
          mctx.drawImage(crop, 0, 0);
          mctx.globalCompositeOperation = "destination-in";
          mctx.drawImage(scaledMask, 0, 0);
          mctx.globalCompositeOperation = "source-over";

          const blob = await new Promise(res => masked.toBlob(res, "image/png"));
          const url  = URL.createObjectURL(blob);
          list.push({ regionId, img: url, frame, maskIndex: 1 });
        }
        if (list.length) bySlide[frame] = list;
      }
    } else {
      // Fallback: merge THIS slide’s overlay (not frame1) with paint
      const merged = document.createElement("canvas");
      merged.width = width; merged.height = height;
      const mctx = merged.getContext("2d");
      mctx.drawImage(crop, 0, 0);
      const overlay = `images/frames/${storyFolder}/frame${slide1}/${selectedChar}/${selectedChar}1.png`;
       
      try {
        if (await urlExists(overlay)) {
          const ol = await loadImageCached(overlay);
          mctx.drawImage(ol, 0, 0, width, height);
        }
      } catch {}
      const blob = await new Promise(res => merged.toBlob(res, "image/png"));
      const url  = URL.createObjectURL(blob);
      bySlide[slide1] = [{ regionId: 1, img: url, frame: slide1, maskIndex: 1 }]; // ✅ key by slide1
    }

    // Persist for storyboard
    const imageOnlyBySlide = {};
    for (const [frame, regions] of Object.entries(bySlide)) {
      imageOnlyBySlide[frame] = regions.map(r => r.img);
    }
    localStorage.setItem(`coloredFrames:${storyFolder}:${selectedChar}`, JSON.stringify(imageOnlyBySlide));

    const firstFrame = Object.values(imageOnlyBySlide)[0];
    if (firstFrame?.length) {
      localStorage.setItem("coloredCharacterFrames", JSON.stringify(firstFrame));
      localStorage.setItem("coloredCharacter", firstFrame[0]);
    }
    localStorage.setItem("selectedCharacter", selectedChar);

    // (optional) submit to backend
    try {
      const firstImg = firstFrame?.[0] || "";
      const uid = localStorage.getItem("deviceToken") || (crypto.randomUUID?.() || String(Date.now()));
      if (firstImg && typeof submitDrawing === "function") {
        await submitDrawing(sessionCode, selectedChar, firstImg, uid);
      }
    } catch {}

    // ✅ Redirect with correct 0-based slide index in the URL
    const url2 = new URL("storyboard.html", location.href);
    url2.searchParams.set("story", selectedStory);
    url2.searchParams.set("char",  selectedChar);
    url2.searchParams.set("slide", String(globalIdx)); // <-- crucial
    if (sessionCode)   url2.searchParams.set("session", sessionCode);
    if (selectedGrade) url2.searchParams.set("grade",   selectedGrade);
    location.href = url2.toString();

  } catch (err) {
    console.error("[sendToStoryboard] failed:", err);
    alert("Send to Storyboard failed. See console for details.");
  }
}

/* ----------------------- Wiring & Boot --------------------------- */
toBoardBtn?.addEventListener("click", sendToStoryboard);

function updateSliderFill(slider){
  if(!slider) return;
  const value=((slider.value-slider.min)/(slider.max-slider.min))*100;
  slider.style.setProperty("--percent", `${value}%`);
}
[brushSlider, opacitySlider].forEach(sl=>{
  if(!sl) return; updateSliderFill(sl); sl.addEventListener("input", ()=>updateSliderFill(sl));
});

function updateMiniPreview(){
  if(!pctx || !previewCanvas) return;
  // draw current canvas into mini preview (optional extra preview of background/outline is in drawPreview)
  pctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
  // we rely on drawPreview() for the full scene preview with masks and overlay
}

Object.assign(window,{
  setTool, undo, redo, clearCanvas, toggleSaveOptions, downloadImage, sendToStoryboard, zoomIn, zoomOut
});

// mouse/touch listeners (placed after functions are defined)
drawCanvas.addEventListener("mousedown", e => {
  const [x,y]=getPos(e);
  if(isInBounds(x,y)){ saveHistory(); drawing=true; prevX=prevY=null; drawStroke(e); }
});
drawCanvas.addEventListener("mousemove", drawStroke);
addEventListener("mouseup",   () => { drawing=false; prevX=prevY=null; persistCurrentAppearance(); schedulePreview(); });
drawCanvas.addEventListener("mouseout",  () => { drawing=false; prevX=prevY=null; });

drawCanvas.addEventListener("touchstart", e => {
  const [x,y]=getPos(e);
  if(isInBounds(x,y)){ saveHistory(); drawing=true; prevX=prevY=null; drawStroke(e.touches[0]); }
},{ passive:true });
drawCanvas.addEventListener("touchmove", e => { e.preventDefault(); drawStroke(e.touches[0]); }, { passive:false });
drawCanvas.addEventListener("touchend",  () => { drawing=false; prevX=prevY=null; persistCurrentAppearance(); schedulePreview(); });

// keyboard nav for appearances preview pane
addEventListener("keydown", e => { if(e.key==="ArrowRight") nextAppearance(); if(e.key==="ArrowLeft") prevAppearance(); });

/* ---------------------------- Boot ------------------------------ */
(async function boot(){
  const outlineURL = await resolveOutlineURLForSlide(1); // quick placeholder while manifest loads
  outlineImg.src = outlineURL;
  layoutAndRedraw();

  const storyId = selectedStory || "tortoise-hare";
  const manifest = await loadSlidesManifest(storyId);
  slidesManifest = manifest;
  appearances = buildAppearances(manifest, selectedChar);

  if(appearances.length){
    await gotoAppearance(appearCursor); // usually 0
  } else {
    schedulePreview();
  }
})();

