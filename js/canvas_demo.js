
"use strict";

/* ---------- Optional Azure submit (safe if not present) ---------- */
let submitDrawing = async () => {};
try {
  const m = await import("./azure-api.js");
  submitDrawing = m.submitDrawing || submitDrawing;
} catch {}

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

/* Nuke any lingering chip element from older markup */
(() => {
  const chip = document.querySelector(".preview-caption");
  if (chip) chip.remove();
})();

/* Offscreen buffer to prevent flicker */
const previewBuffer = (() => {
  const c = document.createElement("canvas");
  c.width  = previewCanvas ? previewCanvas.width  : 0;
  c.height = previewCanvas ? previewCanvas.height : 0;
  return c;
})();
const pb = previewBuffer.getContext("2d");

/* Preload/cache */
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
  ["tortoise-hare", "tortoise_and_the_hare"],
  ["lion-mouse",    "lion_and_the_mouse"],
  ["little-ducks", "5_little_ducks"],
]);

/* Full-window canvases; sprite sits in a centered box */
const SPRITE_BOX_SIZE = 600;
let allowedArea = { x: 0, y: 0, width: 0, height: 0 };

/* ---------- Selected character & flow ---------- */
const urlParams     = new URLSearchParams(location.search);
const selectedChar  = (urlParams.get("char")   || "tortoise").toLowerCase();
const spriteParam   =  urlParams.get("sprite")  || "";
const outlineParam  =  urlParams.get("outline") || "";
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
function perSlidePaintKey(story, charId, slide1){
  return `perSlidePaint:${story}:${charId}:${slide1}`;
}

/* Sprite URL fallback */
async function resolveSpriteURL() {
  if (spriteParam) return spriteParam;
  const storyId = selectedStory || "tortoise-hare";
  const manifestURL = `stories/${storyId}/characters.json`;
  try {
    const r = await fetch(manifestURL, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const manifest = await r.json();
    const hit = (manifest.characters || []).find(c => (c.id || "").toLowerCase() === selectedChar);
    if (hit?.sprite) return hit.sprite;
  } catch (e) { console.warn("[resolveSpriteURL] manifest load failed:", e); }

  // NEW: try story-scoped outlines first, then legacy flat
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

  // Last resort (should rarely hit)
  return `images/outline/${selectedChar}-transparent.png`;
}

/* Outline choice for a slide */
async function resolveOutlineURLForSlide(slide1) {
  const storyDash   = selectedStory || "tortoise-hare";
  const storyFolder = resolveStoryFolder(storyDash); // uses STORY_FOLDER_MAP

  // 1) Frame-specific overlay (if you have per-frame PNGs)
  const frame1 = `images/frames/${storyFolder}/frame${slide1}/${selectedChar}/${selectedChar}1.png`;
  if (await urlExists(frame1)) return frame1;

  // 2) Explicit outline URL passed in (query string)
  if (outlineParam) return outlineParam;

  // 3) STORY-SCOPED OUTLINES — try your underscore pattern first
  const tries = [
    // your repo’s pattern:
    `images/outline/${storyFolder}/${selectedChar}_transparent.png`,
    // also accept dash pattern just in case:
    `images/outline/${storyFolder}/${selectedChar}-transparent.png`,
    // legacy flat location:
    `images/outline/${selectedChar}_transparent.png`,
    `images/outline/${selectedChar}-transparent.png`,
  ];
  for (const url of tries) {
    if (await urlExists(url)) return url;
  }

  // 4) Final fallback: sprite URL (colored sprite if nothing else found)
  return await resolveSpriteURL();
}

/* ---------- Sprite (outline) rendering ---------- */
let outlineLoaded = false;
const outlineImg = new Image();
outlineImg.onload  = () => { outlineLoaded = true; layoutAndRedraw(); };
outlineImg.onerror = () => alert(`Could not load character image: ${outlineImg.src}`);

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

/* ---------- Drawing ---------- */
let drawing = false;
let currentTool = "draw";
let brushSize   = 18;
let brushColor  = "#2ad0ff";
let opacity     = 1.0;
let prevX = null, prevY = null;
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

ctx.lineJoin = "round";
ctx.lineCap  = "round";
ctx.imageSmoothingEnabled = true;

/* History */
let history = [], redoStack = [];
function saveHistory(){ history.push(ctx.getImageData(0,0,drawCanvas.width,drawCanvas.height)); if (history.length>40) history.shift(); redoStack=[]; }
function undo(){ if(!history.length) return; redoStack.push(ctx.getImageData(0,0,drawCanvas.width,drawCanvas.height)); ctx.putImageData(history.pop(),0,0); persistCurrentAppearance(); schedulePreview(); }
function redo(){ if(!redoStack.length) return; saveHistory(); ctx.putImageData(redoStack.pop(),0,0); persistCurrentAppearance(); schedulePreview(); }

/* Circle stamp brush */
function dotAt(x,y){
  ctx.beginPath();
  ctx.arc(x, y, brushSize/2, 0, Math.PI*2);
  ctx.fillStyle = (currentTool === "erase") ? "#000" : brushColor;
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = (currentTool === "erase") ? "destination-out" : "source-over";
  ctx.fill();
}
function stampSegment(x0,y0,x1,y1){
  const dx=x1-x0, dy=y1-y0, dist=Math.hypot(dx,dy);
  if (dist===0){ dotAt(x0,y0); return; }
  const step = Math.max(1,(brushSize/2)*0.6);
  const count = Math.ceil(dist/step);
  for (let i=0;i<=count;i++){ const t=i/count; dotAt(x0+dx*t,y0+dy*t); }
}

/* Preview throttle */
let previewScheduled=false;
function schedulePreview(){
  if(previewScheduled) return;
  previewScheduled=true;
  requestAnimationFrame(()=>{ previewScheduled=false; drawPreview(); });
}

function drawStroke(e){
  if(!drawing) return;
  const [x,y] = getPos(e);
  if(!isInBounds(x,y)) return;

  if(prevX==null || prevY==null){ dotAt(x,y); }
  else{
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = (currentTool === "erase") ? "destination-out" : "source-over";
    ctx.strokeStyle = brushColor; ctx.lineWidth = brushSize;
    ctx.beginPath(); ctx.moveTo(prevX,prevY); ctx.lineTo(x,y); ctx.stroke();
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
function clearCanvas(){ ctx.clearRect(0,0,drawCanvas.width,drawCanvas.height); layoutAndRedraw(); persistCurrentAppearance(); }
function zoomIn(){  zoomLevel*=1.1; applyZoom(); }
function zoomOut(){ zoomLevel/=1.1; applyZoom(); }
function applyZoom(){
  for (const c of [bgCanvas, drawCanvas, spriteCanvas]){
    c.style.transformOrigin="center center";
    c.style.transform=`scale(${zoomLevel})`;
  }
  schedulePreview();
}

/* Save dropdown */
function toggleSaveOptions(){ document.getElementById("saveOptions").classList.toggle("hidden"); }
function downloadImage(){
  const merged=document.createElement("canvas");
  merged.width=drawCanvas.width; merged.height=drawCanvas.height;
  const m=merged.getContext("2d");
  m.fillStyle="white"; m.fillRect(0,0,merged.width,merged.height);
  m.drawImage(drawCanvas,0,0); m.drawImage(spriteCanvas,0,0);
  const a=document.createElement("a"); a.download="my_drawing.png"; a.href=merged.toDataURL(); a.click();
  document.getElementById("saveOptions").classList.add("hidden");
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

/*images/frames/tortoise_and_the_hare/frame1/tortoise/tortoise_mask_1.csv*/
/*Fix this code as the it needs to call upon all forlders! before it was circulating between frames 1 to 5 folders*/
async function findMaskSets(storyIdDash, charId){
  const storyFolder=resolveStoryFolder(storyIdDash);
  const base=`images/frames/${storyFolder}`; const out=[];
  let misses=0;
  for(let n=1;n<2;n++){  //CHANGED
    const prefix=`${base}/frame1/${charId}/${charId}_mask_`;
    if(await urlExists(`${prefix}${n}.csv`)){ out.push({frame:n,prefix}); misses=0; console.log(`${prefix}${n}.csv`) }
    else { misses++; if(misses>=2 && out.length) break; }
  }
  return out;
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ------- Send to storyboard ------- */
async function sendToStoryboard() {
  try {
    const { x, y, width, height } = allowedArea;

    // Crop the paint layer to the sprite box
    const crop = document.createElement("canvas");
    crop.width = width;
    crop.height = height;
    crop.getContext("2d").drawImage(drawCanvas, x, y, width, height, 0, 0, width, height);

    // Find mask sets for the selected character
    const sets = await findMaskSets(selectedStory || "tortoise-hare", selectedChar);
    if (!sets.length) throw new Error(`No masks found for "${selectedChar}" in story "${selectedStory}".`);

    const bySlide = {};
    for (const { frame, prefix } of sets) {
      const list = [];

      const csvURL = `${prefix}1.csv`;
      if (!(await urlExists(csvURL))) continue;

      const { mat, W, H } = await loadCSVMatrix(csvURL);
      const uniqueIds = [...new Set(mat.flat())].filter(id => id !== 0);

      for (const regionId of uniqueIds) {
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = W;
        maskCanvas.height = H;
        const ctx = maskCanvas.getContext("2d");
        const imgData = ctx.createImageData(W, H);

        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (mat[y][x] === regionId) {
              const idx = (y * W + x) * 4;
              imgData.data[idx + 0] = 255;
              imgData.data[idx + 1] = 255;
              imgData.data[idx + 2] = 255;
              imgData.data[idx + 3] = 255;
            }
          }
        }
        ctx.putImageData(imgData, 0, 0);

        const scaledMask = document.createElement("canvas");
        scaledMask.width = width;
        scaledMask.height = height;
        scaledMask.getContext("2d").drawImage(maskCanvas, 0, 0, width, height);

        const masked = document.createElement("canvas");
        masked.width = width;
        masked.height = height;
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

    const imageOnlyBySlide = {};
    const storyFolder = resolveStoryFolder(selectedStory || "tortoise-hare");
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

    const firstImg = firstFrame?.[0] || "";
    const uid = localStorage.getItem("deviceToken") || (crypto.randomUUID?.() || String(Date.now()));

    if (firstImg) {
      try {
        await submitDrawing(sessionCode, selectedChar, firstImg, uid);
      } catch (e) {
        console.warn("[submitDrawing]", e);
      }
    }

    const q = new URLSearchParams({ char: selectedChar, story: selectedStory });
    if (sessionCode) q.set("session", sessionCode);
    if (selectedGrade) q.set("grade", selectedGrade);

    location.href = `storyboard.html?${q.toString()}`;
  } catch (err) {
    console.error("[sendToStoryboard] failed:", err);
    alert("Send to Storyboard failed. See console for details.");
  }
}

/* ---------- Expose for buttons ---------- */
Object.assign(window,{ setTool, undo, redo, clearCanvas, toggleSaveOptions, downloadImage, sendToStoryboard, zoomIn, zoomOut });

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
  const outlineURL=await resolveOutlineURLForSlide(appearances[appearCursor]+1);
  outlineImg.src=outlineURL;
  restoreCurrentAppearance();
  schedulePreview();
}
function nextAppearance(){ gotoAppearance(appearCursor+1); }
function prevAppearance(){ gotoAppearance(appearCursor-1); }
prevAppBtn?.addEventListener("click", prevAppearance);
nextAppBtn?.addEventListener("click", nextAppearance);

/* keyboard nav */
addEventListener("keydown", e => { if(e.key==="ArrowRight") nextAppearance(); if(e.key==="ArrowLeft") prevAppearance(); });

/* per-slide autosave/restore */
function persistCurrentAppearance(){
  if(!appearances.length) return;
  const slide1=appearances[appearCursor]+1;
  const crop=document.createElement("canvas"); crop.width=allowedArea.width; crop.height=allowedArea.height;
  crop.getContext("2d").drawImage(drawCanvas, allowedArea.x,allowedArea.y,allowedArea.width,allowedArea.height, 0,0,allowedArea.width,allowedArea.height);
  localStorage.setItem(perSlidePaintKey(selectedStory || "tortoise-hare",selectedChar,slide1), crop.toDataURL("image/png"));
}
function restoreCurrentAppearance(){
  ctx.clearRect(0,0,drawCanvas.width,drawCanvas.height);
  if(!appearances.length) return;
  const slide1=appearances[appearCursor]+1;
  const dataURL=localStorage.getItem(perSlidePaintKey(selectedStory || "tortoise-hare",selectedChar,slide1));
  if(!dataURL) return;
  const img=new Image();
  img.onload=()=>{ ctx.drawImage(img,0,0,img.width,img.height, allowedArea.x,allowedArea.y,allowedArea.width,allowedArea.height); schedulePreview(); };
  img.src=dataURL;
}

/* ---------- Boot ---------- */
(async function boot(){
  const fallbackOutline = await resolveOutlineURLForSlide(1);
  outlineImg.src=fallbackOutline;
  layoutAndRedraw();

  const storyId = selectedStory || "tortoise-hare";
  const manifest = await loadSlidesManifest(storyId);
  slidesManifest = manifest;
  appearances = buildAppearances(manifest, selectedChar);

  if(appearances.length){ await gotoAppearance(0); }
  else { schedulePreview(); }
})();
