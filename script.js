
"use strict";

// Optional Azure submit (safe if not present)
let submitDrawing = async () => {};
try {
  const m = await import("./js/azure-api.js");
  submitDrawing = m.submitDrawing || submitDrawing;
} catch (_) { /* no-op */ }

// ------- Canvas setup -------
const bgCanvas    = document.getElementById("bgCanvas");
const drawCanvas  = document.getElementById("drawCanvas");
const spriteCanvas= document.getElementById("spriteCanvas");
const bgCtx   = bgCanvas.getContext("2d");
const ctx     = drawCanvas.getContext("2d");
const sctx    = spriteCanvas.getContext("2d");

// Transparent-outline sprites live here (single outline image per character)
const OUTLINE_DIR = "images/outline";

// 4-frame outlines + mask CSVs for animation (per character)
const FRAMES_DIR = (ch) => `images/frames/${ch}`;
const MASK_CSV   = (ch) => `${FRAMES_DIR(ch)}/${ch}_mask_1.csv`; // use #1 to trim paint

// canvas is full-window; we draw sprite into a centered box
const SPRITE_BOX_SIZE = 600;
let allowedArea = { x: 0, y: 0, width: 0, height: 0 };

// ------- Selected character -------
const urlParams = new URLSearchParams(window.location.search);
const selectedChar = (urlParams.get("char") || "tortoise").toLowerCase();
localStorage.setItem("selectedCharacter", selectedChar);

// ------- Load single outline for coloring layer -------
const outlineImg = new Image();
outlineImg.src = `${OUTLINE_DIR}/${selectedChar}-transparent.png`;
let outlineLoaded = false;

function getSpriteBox() {
  const size = SPRITE_BOX_SIZE;
  return {
    width: size,
    height: size,
    x: Math.round((bgCanvas.width  - size) / 2),
    y: Math.round((bgCanvas.height - size) / 2),
  };
}

function drawWhiteBG() {
  bgCtx.fillStyle = "white";
  bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
}

function layoutAndRedraw() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  [bgCanvas, drawCanvas, spriteCanvas].forEach((c) => {
    c.width = w;
    c.height = h;
    c.style.width  = w + "px";
    c.style.height = h + "px";
  });

  drawWhiteBG();

  if (outlineLoaded) {
    const box = getSpriteBox();
    allowedArea = { ...box };
    sctx.clearRect(0,0,spriteCanvas.width, spriteCanvas.height);
    sctx.drawImage(outlineImg, box.x, box.y, box.width, box.height);
  }
}
outlineImg.onload  = () => { outlineLoaded = true; layoutAndRedraw(); };
outlineImg.onerror = () => alert(`Could not load outline: ${outlineImg.src}`);
layoutAndRedraw();
window.addEventListener("resize", layoutAndRedraw);

// ------- Drawing (fixed round brush) -------
let drawing   = false;
let currentTool = "draw";
let brushSize = 18;
let brushColor= "#2ad0ff";
let opacity   = 1.0;
let prevX = null, prevY = null;
let zoomLevel = 1;

// UI refs
const brushSlider   = document.querySelector(".brush-size-slider");
const opacitySlider = document.querySelector(".opacity-slider");
const colorInput    = document.querySelector(".pick-color");

function setTool(tool) { currentTool = tool; }
colorInput.addEventListener("change", () => { brushColor = colorInput.value; });
brushSlider.addEventListener("input", () => { brushSize = parseInt(brushSlider.value, 10); });
opacitySlider.addEventListener("input", () => { opacity = parseFloat(opacitySlider.value); });

function getPos(e) {
  const rect = drawCanvas.getBoundingClientRect();
  const clientX = e.clientX ?? e.touches?.[0]?.clientX;
  const clientY = e.clientY ?? e.touches?.[0]?.clientY;
  const x = (clientX - rect.left) / zoomLevel;
  const y = (clientY - rect.top)  / zoomLevel;
  return [x, y];
}
function isInBounds(x,y) {
  return x>=allowedArea.x && x<=allowedArea.x+allowedArea.width &&
         y>=allowedArea.y && y<=allowedArea.y+allowedArea.height;
}

ctx.lineJoin = "round";
ctx.lineCap  = "round";

let history = [], redoStack = [];
function saveHistory() {
  history.push(ctx.getImageData(0,0,drawCanvas.width, drawCanvas.height));
  if (history.length>40) history.shift();
  redoStack = [];
}
function undo(){ if(!history.length) return;
  redoStack.push(ctx.getImageData(0,0,drawCanvas.width, drawCanvas.height));
  ctx.putImageData(history.pop(),0,0);
}
function redo(){ if(!redoStack.length) return;
  saveHistory(); ctx.putImageData(redoStack.pop(),0,0);
}

function drawStroke(e) {
  if (!drawing) return;
  const [x, y] = getPos(e);
  if (!isInBounds(x,y)) return;

  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = (currentTool === "erase") ? "destination-out" : "source-over";
  ctx.strokeStyle = brushColor;
  ctx.lineWidth   = brushSize;

  ctx.beginPath();
  ctx.moveTo(prevX ?? x, prevY ?? y);
  ctx.lineTo(x, y);
  ctx.stroke();

  prevX = x; prevY = y;
}

// Mouse / touch
drawCanvas.addEventListener("mousedown", (e) => {
  const [x,y] = getPos(e);
  if (isInBounds(x,y)) {
    saveHistory(); drawing = true; prevX = x; prevY = y;
  }
});
drawCanvas.addEventListener("mousemove", drawStroke);
drawCanvas.addEventListener("mouseup",   () => { drawing=false; prevX=prevY=null; });
drawCanvas.addEventListener("mouseout",  () => { drawing=false; prevX=prevY=null; });

drawCanvas.addEventListener("touchstart", (e)=>{
  const [x,y] = getPos(e);
  if (isInBounds(x,y)) {
    saveHistory(); drawing = true; prevX = x; prevY = y;
  }
});
drawCanvas.addEventListener("touchmove", (e)=>{ e.preventDefault(); drawStroke(e.touches[0]); }, {passive:false});
drawCanvas.addEventListener("touchend", ()=>{ drawing=false; prevX=prevY=null; });

// Clear + zoom
function clearCanvas(){ ctx.clearRect(0,0,drawCanvas.width, drawCanvas.height); layoutAndRedraw(); }
function zoomIn(){ zoomLevel *= 1.1; applyZoom(); }
function zoomOut(){ zoomLevel /= 1.1; applyZoom(); }
function applyZoom(){
  for (const c of [bgCanvas, drawCanvas, spriteCanvas]){
    c.style.transformOrigin = "center center";
    c.style.transform = `scale(${zoomLevel})`;
  }
}

// Save dropdown
function toggleSaveOptions(){ document.getElementById("saveOptions").classList.toggle("hidden"); }
function downloadImage(){
  const merged = document.createElement("canvas");
  merged.width = drawCanvas.width; merged.height = drawCanvas.height;
  const m = merged.getContext("2d");
  m.fillStyle = "white"; m.fillRect(0,0,merged.width, merged.height);
  m.drawImage(drawCanvas, 0,0);
  m.drawImage(spriteCanvas,0,0);
  const a = document.createElement("a");
  a.download="my_drawing.png"; a.href=merged.toDataURL(); a.click();
  document.getElementById("saveOptions").classList.add("hidden");
}

// ------- CSV → alpha mask helpers (for trimming paint on send) -------
async function loadCSVMatrix(url) {
  const text = await (await fetch(url)).text();
  return text.trim().split(/\r?\n/).map(row => row.split(",").map(v => +v));
}
function matrixToMaskBitmap(mat, w, h){
  const off = new OffscreenCanvas(w,h), c = off.getContext("2d");
  const imgData = c.createImageData(w,h);
  let k=0;
  for (let y=0; y<h; y++){
    const row = mat[y];
    for (let x=0; x<w; x++){
      const id = row[x]||0;
      imgData.data[k++] = 255; // R
      imgData.data[k++] = 255; // G
      imgData.data[k++] = 255; // B
      imgData.data[k++] = (id>0) ? 255 : 0; // A
    }
  }
  c.putImageData(imgData,0,0);
  return off.transferToImageBitmap();
}

// ------- Send to storyboard (trim using CSV mask, then store) -------
async function sendToStoryboard() {
  const { x, y, width, height } = allowedArea;

  // 1) crop paint layer to sprite box
  const paintCrop = new OffscreenCanvas(width, height);
  paintCrop.getContext("2d").drawImage(drawCanvas, x, y, width, height, 0, 0, width, height);

  // 2) build a mask from tortoise_mask_1.csv (or selectedChar’s mask_1.csv)
  const mat   = await loadCSVMatrix(MASK_CSV(selectedChar));
  const mBmp  = await matrixToMaskBitmap(mat, width, height);

  // 3) apply mask: paint ∧ mask
  const masked = new OffscreenCanvas(width, height);
  const mctx   = masked.getContext("2d");
  mctx.drawImage(paintCrop, 0, 0);
  mctx.globalCompositeOperation = "destination-in";
  mctx.drawImage(mBmp, 0, 0);
  mctx.globalCompositeOperation = "source-over";
  const maskedPNG = masked.convertToBlob ? await masked.convertToBlob({type:"image/png"}) : await new Promise(res=>masked.toBlob(res));
  const maskedURL = URL.createObjectURL(maskedPNG);

  // also store as DataURL (for storyboard image src)
  const img = await createImageBitmap(maskedPNG);
  const dataURL = await bitmapToDataURL(img);

  // 4) persist for storyboard + (optional) submit
  localStorage.setItem("coloredCharacter", dataURL);
  localStorage.setItem("selectedCharacter", selectedChar);

  const sessionCode = urlParams.get("session") || localStorage.getItem("sessionCode");
  const uid = localStorage.getItem("deviceToken") || (crypto.randomUUID?.() || String(Date.now()));
  try { await submitDrawing(sessionCode, selectedChar, dataURL, uid); } catch(_) {}

  // 5) go to storyboard
  window.location.href = `storyboard.html?char=${selectedChar}${sessionCode?`&session=${encodeURIComponent(sessionCode)}`:""}`;
}

function bitmapToDataURL(bitmap){
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  c.getContext("2d").drawImage(bitmap,0,0);
  return c.convertToBlob ? c.convertToBlob({type:"image/png"}).then(b=>new Promise(r=>{const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(b);})):
                           new Promise(r=>c.toBlob(b=>{const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(b);},"image/png"));
}

// ------- expose for buttons -------
Object.assign(window, {
  setTool, undo, redo, clearCanvas, toggleSaveOptions,
  downloadImage, sendToStoryboard, zoomIn, zoomOut,
});

// ------- slider fill cosmetics (unchanged) -------
function updateSliderFill(slider) {
  const value = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.setProperty("--percent", `${value}%`);
}
[document.querySelector(".brush-size-slider"), document.querySelector(".opacity-slider")].forEach((slider) => {
  updateSliderFill(slider);
  slider.addEventListener("input", () => updateSliderFill(slider));
});
