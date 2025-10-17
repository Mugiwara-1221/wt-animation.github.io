"use strict";

/* ---------- Canvas setup ---------- */
const bgCanvas     = document.getElementById("bgCanvas");
const drawCanvas   = document.getElementById("drawCanvas");
const spriteCanvas = document.getElementById("spriteCanvas");
const bgCtx = bgCanvas.getContext("2d");
const ctx   = drawCanvas.getContext("2d");
const sctx  = spriteCanvas.getContext("2d");

/* === Mini preview + appearances-only nav === */
const previewCanvas = document.getElementById("previewCanvas");
const pctx          = previewCanvas ? previewCanvas.getContext("2d") : null;
const prevAppBtn    = document.getElementById("prevAppBtn");
const nextAppBtn    = document.getElementById("nextAppBtn");

/* Clear any lingering caption chip from older markup */
(() => { document.querySelector(".preview-caption")?.remove(); })();

/* Offscreen buffer for the preview (to avoid flicker) */
const previewBuffer = (() => {
  const c = document.createElement("canvas");
  c.width  = previewCanvas ? previewCanvas.width  : 0;
  c.height = previewCanvas ? previewCanvas.height : 0;
  return c;
})();
const pb = previewBuffer.getContext("2d");

/* Image cache */
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

/* Repo map */
const STORY_FOLDER_MAP = new Map([
  ["tortoise-hare", "tortoise-hare"],
  ["lion-mouse",    "lion-mouse"],
]);
console.log("hello")

/* Full-window canvases; sprite sits in a centered square */
const SPRITE_BOX_SIZE = 600;
let allowedArea = { x: 0, y: 0, width: 0, height: 0 };

/* ---------- Selected character & flow ---------- */
const urlParams     = new URLSearchParams(location.search);
const selectedChar  = (urlParams.get("char")   || "tortoise").toLowerCase();
const sessionCode   =  urlParams.get("session") || localStorage.getItem("sessionCode")   || "";
const selectedStory = (urlParams.get("story")   || localStorage.getItem("selectedStory") || "").replace(/_/g, "-");
const selectedGrade =  urlParams.get("grade")   || localStorage.getItem("selectedGrade") || "";

localStorage.setItem("selectedCharacter", selectedChar);

/* ---------- Helpers ---------- */
function resolveStoryFolder(storyIdDash) {
  const id = (storyIdDash || "").replace(/_/g, "-");
  return STORY_FOLDER_MAP.get(id) || id;
}
async function urlExists(url) {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok; }
  catch { return false; }
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

/* ---------- Per-frame ---------- */
const TOTAL_FRAMES = 4;
let currentFrame = 1;
const outlineImgs = new Array(TOTAL_FRAMES + 1); // 1..4

// per-frame PAINT (what the student draws) and MASK (inside-of-outline)
const paintLayers = new Array(TOTAL_FRAMES + 1).fill(null); // canvases sized to allowedArea
const maskLayers  = new Array(TOTAL_FRAMES + 1).fill(null); // canvases sized to allowedArea

function framePaintKey(story, slide1, char, n) {
  return `paint:${story}:${slide1}:${char}:frame${n}`;
}

/* Build a binary fill mask (inside area) from an outline PNG using flood-fill */
function buildFillMaskFromOutlineImage(img, w, h){
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const t = tmp.getContext('2d', { willReadFrequently:true });
  t.drawImage(img, 0, 0, w, h);
  const { data } = t.getImageData(0,0,w,h);

  const N = w*h;
  const barrier = new Uint8Array(N); // outline pixels
  const outside = new Uint8Array(N); // flood from borders to find exterior
  const A = 32; // alpha threshold for outline

  for (let i=0;i<N;i++) if (data[i*4+3] > A) barrier[i] = 1;

  const q = [];
  const push = (x,y) => {
    if (x<0||y<0||x>=w||y>=h) return;
    const idx = y*w + x;
    if (outside[idx] || barrier[idx]) return;
    outside[idx] = 1; q.push(idx);
  };
  for (let x=0;x<w;x++){ push(x,0); push(x,h-1); }
  for (let y=0;y<h;y++){ push(0,y); push(w-1,y); }
  while (q.length){
    const idx = q.pop();
    const x = idx % w, y = (idx / w) | 0;
    push(x+1,y); push(x-1,y); push(x,y+1); push(x,y-1);
  }

  const mask = document.createElement('canvas');
  mask.width = w; mask.height = h;
  const m = mask.getContext('2d');
  const out = m.createImageData(w,h);
  for (let i=0;i<N;i++){
    const inside = !outside[i] && !barrier[i];
    const k = i*4;
    out.data[k+0] = 255; out.data[k+1] = 255; out.data[k+2] = 255;
    out.data[k+3] = inside ? 255 : 0;
  }
  m.putImageData(out, 0, 0);
  return mask;
}

/* Ensure per-frame offscreen canvases exist & are sized to allowedArea */
function ensurePaintCtx(n){
  const { width, height } = allowedArea;
  const needsNew = !paintLayers[n] ||
    paintLayers[n].width !== width || paintLayers[n].height !== height;

  if (needsNew){
    const old = paintLayers[n];
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    if (old) c.getContext('2d').drawImage(old, 0, 0, c.width, c.height);
    paintLayers[n] = c;
  }
  return paintLayers[n].getContext('2d', { willReadFrequently:true });
}
function ensureMaskForFrame(n){
  const { width, height } = allowedArea;
  if (maskLayers[n] &&
      maskLayers[n].width === width &&
      maskLayers[n].height === height) return maskLayers[n];
  const img = outlineImgs[n];
  if (!img) return null;
  maskLayers[n] = buildFillMaskFromOutlineImage(img, width, height);
  return maskLayers[n];
}

/* Draw the visible (masked) paint layer to #drawCanvas */
function redrawVisible(){
  ctx.clearRect(0,0,drawCanvas.width,drawCanvas.height);
  const p = paintLayers[currentFrame];
  if (p){
    ctx.drawImage(
      p, 0,0,p.width,p.height,
      allowedArea.x, allowedArea.y, allowedArea.width, allowedArea.height
    );
  }
}

async function preloadOutlinesForSlide(slide1) {
  const storyFolder = resolveStoryFolder(selectedStory || "tortoise-hare");

  // 1) wipe all old references so nothing stale can be drawn
  for (let n = 1; n <= TOTAL_FRAMES; n++) outlineImgs[n] = null;

  // 2) helpers that generate the *per-slide* path for frame n
  const perSlide    = (n) => `images/frames/${storyFolder}/frame${slide1}/${selectedChar}/${selectedChar}${n}.png`;
  const perSlideAlt = (n) => `images/frames/${storyFolder}/frame${slide1}/${selectedChar}${n}.png`;

  for (let n = 1; n <= TOTAL_FRAMES; n++) {
    const candidates = [perSlide(n), perSlideAlt(n)];
    for (const raw of candidates) {
      // cache-buster to defeat <img> HTTP cache
      const url = `${raw}?v=${Date.now()}`;
      try {
        if (await urlExists(raw)) {
          outlineImgs[n] = await loadImageCached(url);
          console.log(`[preload] slide ${slide1} frame ${n} ->`, raw);
          break;
        }
      } catch {}
    }
    if (!outlineImgs[n]) {
      console.warn("[preload] Missing outline", { slide1, frame: n, tried: candidates });
    }
  }
}


function drawOutlineForFrame(n) {
  sctx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
  const img = outlineImgs[n];
  if (!img) return;
  const box = getSpriteBox();
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(img, box.x, box.y, box.width, box.height);
  // ensure mask/paint sized & show current paint
  ensurePaintCtx(n);
  ensureMaskForFrame(n);
  redrawVisible();
  schedulePreview();
}

/* ---------- Layout ---------- */
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
function layoutAndRedraw() {
  const w = innerWidth, h = innerHeight;
  for (const c of [bgCanvas, drawCanvas, spriteCanvas]) {
    c.width = w; c.height = h;
    c.style.width = w + "px";
    c.style.height = h + "px";
  }
  drawWhiteBG();
  const box = getSpriteBox();
  allowedArea = { ...box };
  drawOutlineForFrame(currentFrame);
  schedulePreview();
}
addEventListener("resize", layoutAndRedraw);

/* ---------- Drawing ---------- */
let drawing = false;
let currentTool = "draw";
let brushSize   = 18;
let brushColor  = "#2ad0ff";
let opacity     = 1.0;
let prevLX = null, prevLY = null; // previous local coords (inside allowedArea)
let zoomLevel = 1;

/* UI refs */
const brushSlider   = document.querySelector(".brush-size-slider");
const opacitySlider = document.querySelector(".opacity-slider");
const colorInput    = document.querySelector(".pick-color");

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

/* Preview throttle */
let previewScheduled=false;
function schedulePreview(){
  if(previewScheduled) return;
  previewScheduled=true;
  requestAnimationFrame(()=>{ previewScheduled=false; drawPreview(); });
}

/* Avoid painting over preview HUD */
function isOverPreview(e) {
  const el = document.getElementById("previewHUD") || previewCanvas;
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const x = e.clientX ?? e.touches?.[0]?.clientX;
  const y = e.clientY ?? e.touches?.[0]?.clientY;
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/* Paint into the offscreen per-frame layer, then clip to mask */
function drawStroke(e){
  if(!drawing) return;
  if (isOverPreview(e)) return;

  const [x,y] = getPos(e);
  if(!isInBounds(x,y)) return;

  const lx = x - allowedArea.x;
  const ly = y - allowedArea.y;

  const p = ensurePaintCtx(currentFrame);

  function dotAtLocal(ax, ay){
    p.beginPath();
    p.arc(ax, ay, brushSize/2, 0, Math.PI*2);
    p.fillStyle = (currentTool === "erase") ? "#000" : brushColor;
    p.globalAlpha = opacity;
    p.globalCompositeOperation = (currentTool === "erase") ? "destination-out" : "source-over";
    p.fill();
  }
  function stampSegmentLocal(x0,y0,x1,y1){
    const dx=x1-x0, dy=y1-y0, dist=Math.hypot(dx,dy);
    if (dist===0){ dotAtLocal(x0,y0); return; }
    const step = Math.max(1,(brushSize/2)*0.6);
    const count = Math.ceil(dist/step);
    for (let i=0;i<=count;i++){ const t=i/count; dotAtLocal(x0+dx*t,y0+dy*t); }
  }

  if(prevLX==null || prevLY==null){ dotAtLocal(lx,ly); }
  else { stampSegmentLocal(prevLX,prevLY,lx,ly); }

  // clip paint to inside of outline
  const mask = ensureMaskForFrame(currentFrame);
  if (mask){
    p.save();
    p.globalCompositeOperation = "destination-in";
    p.drawImage(mask, 0, 0);
    p.restore();
  }

  prevLX=lx; prevLY=ly;

  redrawVisible();
  schedulePreview();
}

/* Mouse / touch */
drawCanvas.addEventListener("mousedown", e => {
  if (isOverPreview(e)) return;
  const [x,y]=getPos(e);
  if(isInBounds(x,y)){ saveHistory(); drawing=true; prevLX=prevLY=null; drawStroke(e); }
});
drawCanvas.addEventListener("mousemove", drawStroke);
addEventListener("mouseup",   () => { drawing=false; prevLX=prevLY=null; saveCurrentFramePaint(); schedulePreview(); });
drawCanvas.addEventListener("mouseout",  () => { drawing=false; prevLX=prevLY=null; });

drawCanvas.addEventListener("touchstart", e => {
  if (isOverPreview(e)) return;
  const [x,y]=getPos(e);
  if(isInBounds(x,y)){ saveHistory(); drawing=true; prevLX=prevLY=null; drawStroke(e.touches[0]); }
},{ passive:true });
drawCanvas.addEventListener("touchmove", e => { if (isOverPreview(e)) return; e.preventDefault(); drawStroke(e.touches[0]); }, { passive:false });
drawCanvas.addEventListener("touchend",  () => { drawing=false; prevLX=prevLY=null; saveCurrentFramePaint(); schedulePreview(); });

/* ---------- History (per-frame offscreen layer) ---------- */
let history = [], redoStack = [];
function snapshotPaint(){
  const p = ensurePaintCtx(currentFrame);
  return p.getImageData(0,0,paintLayers[currentFrame].width, paintLayers[currentFrame].height);
}
function saveHistory(){ history.push(snapshotPaint()); if (history.length>40) history.shift(); redoStack=[]; }
function undo(){
  if(!history.length) return;
  const p = ensurePaintCtx(currentFrame);
  redoStack.push(snapshotPaint());
  p.putImageData(history.pop(), 0, 0);
  redrawVisible(); saveCurrentFramePaint(); schedulePreview();
}
function redo(){
  if(!redoStack.length) return;
  const p = ensurePaintCtx(currentFrame);
  saveHistory();
  p.putImageData(redoStack.pop(), 0, 0);
  redrawVisible(); saveCurrentFramePaint(); schedulePreview();
}

/* Clear + zoom */
function clearCanvas(){
  const p = ensurePaintCtx(currentFrame);
  p.clearRect(0,0,paintLayers[currentFrame].width, paintLayers[currentFrame].height);
  redrawVisible();
  saveCurrentFramePaint();
}
function zoomIn(){ zoomLevel*=1.1; applyZoom(); }
function zoomOut(){ zoomLevel/=1.1; applyZoom(); }
function applyZoom(){
  for (const c of [bgCanvas, drawCanvas, spriteCanvas]){
    c.style.transformOrigin="center center";
    c.style.transform=`scale(${zoomLevel})`;
  }
  schedulePreview();
}

/* Save dropdown */
function toggleSaveOptions(){ 
  document.getElementById("saveOptions").classList.toggle("hidden");
}
document.getElementById('saveBtn')?.addEventListener('click', toggleSaveOptions);

function downloadImage(){
  const merged=document.createElement("canvas");
  merged.width=drawCanvas.width; merged.height=drawCanvas.height;
  const m=merged.getContext("2d");
  m.fillStyle="white"; m.fillRect(0,0,merged.width,merged.height);

  // paint (masked) from offscreen
  const p = paintLayers[currentFrame];
  if (p){
    m.drawImage(p, 0,0,p.width,p.height, allowedArea.x, allowedArea.y, allowedArea.width, allowedArea.height);
  }
  // multiply outline (frame image)
  const ol = outlineImgs[currentFrame];
  if (ol){
    m.save();
    m.globalCompositeOperation = "multiply";
    m.drawImage(ol, allowedArea.x, allowedArea.y, allowedArea.width, allowedArea.height);
    m.restore();
  }

  const a=document.createElement("a"); 
  a.download="my_drawing.png"; 
  a.href=merged.toDataURL(); 
  a.click();
  document.getElementById("saveOptions").classList.add("hidden");
}

/* ---------- Per-frame save/restore ---------- */
function saveCurrentFramePaint() {
  const slide1 = appearances.length ? appearances[appearCursor] + 1 : 1;
  const key = framePaintKey(selectedStory || "tortoise-hare", slide1, selectedChar, currentFrame);
  const p = paintLayers[currentFrame];
  if (p) localStorage.setItem(key, p.toDataURL("image/png"));
}

function restoreFramePaint(n) {
  ensurePaintCtx(n);
  const slide1 = appearances.length ? appearances[appearCursor] + 1 : 1;
  const key = framePaintKey(selectedStory || "tortoise-hare", slide1, selectedChar, n);
  const url = localStorage.getItem(key);
  const p = ensurePaintCtx(n);
  p.clearRect(0,0,paintLayers[n].width, paintLayers[n].height);
  if (!url){ redrawVisible(); return; }
  const img = new Image();
  img.onload = () => {
    p.drawImage(img, 0, 0, paintLayers[n].width, paintLayers[n].height);
    // defensive: re-apply mask
    const mask = ensureMaskForFrame(n);
    if (mask){
      p.save(); p.globalCompositeOperation = "destination-in"; p.drawImage(mask,0,0); p.restore();
    }
    redrawVisible(); schedulePreview();
  };
  img.src = url;
}

/* ---------- Frame switcher (UI) ---------- */
(function injectFrameBar(){
  const bar = document.createElement('div');
  bar.id = 'frameBar';
  bar.className = 'nav-floating';
  bar.style.right = '24px';
  bar.style.bottom = '84px';
  bar.style.zIndex = '150';
  bar.innerHTML = `
    <button data-frame="1">1</button>
    <button data-frame="2">2</button>
    <button data-frame="3">3</button>
    <button data-frame="4">4</button>
  `;
  document.body.appendChild(bar);
  bar.addEventListener('click', (e) => {
    const n = +e.target?.dataset?.frame;
    if (n) switchFrame(n);
  });
  document.querySelectorAll('#frameBar [data-frame]').forEach(b => {
    b.classList.toggle('active', +b.dataset.frame === currentFrame);
  });
})();

function switchFrame(n) {
  if (n === currentFrame) return;
  saveCurrentFramePaint();
  currentFrame = n;
  drawOutlineForFrame(n);
  restoreFramePaint(n);
  document.querySelectorAll('#frameBar [data-frame]').forEach(b => {
    b.classList.toggle('active', +b.dataset.frame === n);
  });
}

/* keyboard: [ and ] */
addEventListener('keydown', e => {
  if (e.key === '[') switchFrame(Math.max(1, currentFrame - 1));
  if (e.key === ']') switchFrame(Math.min(TOTAL_FRAMES, currentFrame + 1));
});

/* ---------- Slider fill cosmetics ---------- */
function updateSliderFill(slider){
  if(!slider) return;
  const value=((slider.value-slider.min)/(slider.max-slider.min))*100;
  slider.style.setProperty("--percent", `${value}%`);
}
[document.querySelector(".brush-size-slider"), document.querySelector(".opacity-slider")].forEach(sl=>{
  if(!sl) return; updateSliderFill(sl); sl.addEventListener("input", ()=>updateSliderFill(sl));
});

/* === Appearances-only model + preview === */
let slidesManifest=null;
let appearances=[];
let appearCursor=0;

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

/* atomic updates to avoid flicker */
let previewToken=0;
async function drawPreview(){
  if(!pctx || !slidesManifest || !appearances.length){
    if(pctx) pctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
    return;
  }
  const myToken=++previewToken;
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
      const dh=(charCfg.h != null ? (charCfg.h/100)*vh : dw);

      // student's masked paint (offscreen layer)
      const p = paintLayers[currentFrame];
      if (p) pb.drawImage(p, dx,dy,dw,dh);

      // outline (multiply)
      const ol = outlineImgs[currentFrame];
      if (ol) {
        pb.save();
        pb.globalCompositeOperation = "multiply";
        pb.drawImage(ol, dx,dy,dw,dh);
        pb.restore();
      }
    }

    if(myToken===previewToken){
      pctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
      pctx.drawImage(previewBuffer,0,0);
    }
  }catch{
    pctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
  }
}

async function gotoAppearance(n){
  if(!appearances.length) return;
  if(n<0 || n>=appearances.length) return;
  appearCursor=n;

  const slide1 = appearances[appearCursor] + 1;
  await preloadOutlinesForSlide(slide1);

  // throw away masks from the previous slide
  maskLayers.fill(null);

  layoutAndRedraw();
  restoreFramePaint(currentFrame);
  schedulePreview();
}

function nextAppearance(){ gotoAppearance(appearCursor+1); }
function prevAppearance(){ gotoAppearance(appearCursor-1); }
prevAppBtn?.addEventListener("click", prevAppearance);
nextAppBtn?.addEventListener("click", nextAppearance);

/* ------- Send to storyboard (bake 4 PNGs) ------- */
async function sendToStoryboard() {
  try {
    saveCurrentFramePaint(); // persist current frame before exporting
    const slide1 = appearances.length ? appearances[appearCursor] + 1 : 1;

    const frames = [];
    const box = getSpriteBox();

    for (let n = 1; n <= TOTAL_FRAMES; n++) {
      const comp = document.createElement('canvas');
      comp.width = drawCanvas.width; comp.height = drawCanvas.height;
      const cx = comp.getContext('2d');

      // paint for this frame
      const p = paintLayers[n];
      if (p){
        cx.drawImage(p, 0,0,p.width,p.height, box.x, box.y, box.width, box.height);
      } else {
        // fallback to saved PNG (if any)
        const key = framePaintKey(selectedStory || "tortoise-hare", slide1, selectedChar, n);
        const paintURL = localStorage.getItem(key);
        if (paintURL) {
          const paintImg = await loadImageCached(paintURL);
          cx.drawImage(paintImg, 0, 0, paintImg.width, paintImg.height, box.x, box.y, box.width, box.height);
        }
      }

      // outline
      const ol = outlineImgs[n];
      if (ol) {
        cx.save();
        cx.globalCompositeOperation = "multiply";
        cx.drawImage(ol, box.x, box.y, box.width, box.height);
        cx.restore();
      }

      frames.push(comp.toDataURL('image/png'));
    }

    // stash for storyboard (1..4 loop)
    const sbKey = `sbFrames:${selectedStory || "tortoise-hare"}:${slide1}:${selectedChar}`;
    localStorage.setItem(sbKey, JSON.stringify({ frames, fps: 4 }));

    // Navigate
    const q = new URLSearchParams({ story: selectedStory, slide: String(slide1), char: selectedChar });
    if (sessionCode)   q.set("session", sessionCode);
    if (selectedGrade) q.set("grade",  selectedGrade);
    location.href = `storyboard.html?${q.toString()}`;
  } catch (err) {
    console.error('[sendToStoryboard] failed:', err);
    alert('Send to Storyboard failed. See console for details.');
  }
}

/* ---------- Expose for buttons ---------- */
Object.assign(window,{ setTool, undo, redo, clearCanvas, toggleSaveOptions, downloadImage, sendToStoryboard, zoomIn, zoomOut });

(async function boot(){
  layoutAndRedraw();

  const storyId = selectedStory || "tortoise-hare";
  const manifest = await loadSlidesManifest(storyId);
  slidesManifest = manifest;
  appearances = buildAppearances(manifest, selectedChar);

  if (appearances.length) {
    await gotoAppearance(0);
    drawOutlineForFrame(1);
    restoreFramePaint(1);
  } else {
    await preloadOutlinesForSlide(1);
    layoutAndRedraw();
    drawOutlineForFrame(1);
    restoreFramePaint(1);
    schedulePreview();
  }
})();
