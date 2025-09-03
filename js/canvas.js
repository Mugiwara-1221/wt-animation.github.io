
"use strict";

/* ---------- Optional Azure submit (safe if not present) ---------- */
let submitDrawing = async () => {};
try {
  const m = await import("./js/azure-api.js"); // keep path under /js
  submitDrawing = m.submitDrawing || submitDrawing;
} catch { /* ok if not present */ }

/* ---------- Canvases ---------- */
const bgCanvas     = document.getElementById("bgCanvas");
const drawCanvas   = document.getElementById("drawCanvas");
const spriteCanvas = document.getElementById("spriteCanvas");
const bgCtx = bgCanvas.getContext("2d");
const ctx   = drawCanvas.getContext("2d");
const sctx  = spriteCanvas.getContext("2d");

/* ---------- Paths ---------- */
const FRAMES_DIR = (ch) => `images/frames/${ch}`;
const MASK_CSV   = (ch, i=1) => `${FRAMES_DIR(ch)}/${ch}_mask_${i}.csv`;

/* ---------- Sprite Box ---------- */
const SPRITE_BOX_SIZE = 600;
let allowedArea = { x: 0, y: 0, width: 0, height: 0 };

/* ---------- Flow & selection ---------- */
const qp            = new URLSearchParams(location.search);
const selectedChar  = (qp.get("char") || "tortoise").toLowerCase();
const sessionCode   = qp.get("session") || localStorage.getItem("sessionCode") || "";
const selectedStory = qp.get("story")   || localStorage.getItem("selectedStory") || "";
const selectedGrade = qp.get("grade")   || localStorage.getItem("selectedGrade") || "";
localStorage.setItem("selectedCharacter", selectedChar);

/* ---------- Robust outline loader ---------- */
const outlineImg = new Image();
let outlineLoaded = false;

// Try multiple likely locations; use first that loads
async function loadFirst(paths){
  for (const src of paths){
    try {
      await new Promise((res, rej)=>{
        const t = new Image();
        t.onload = res;
        t.onerror = rej;
        t.src = src;
      });
      return src;
    } catch {}
  }
  return null;
}

(async ()=>{
  const src = await loadFirst([
    `images/outline/${selectedChar}-transparent.png`,
    `images/outline/${selectedChar}.png`,
    `${FRAMES_DIR(selectedChar)}/${selectedChar}1.png`,
    `images/${selectedChar}.png`
  ]);
  if (!src) {
    alert(`Could not find an outline image for "${selectedChar}".`);
    return;
  }
  outlineImg.src = src;
})();

/* ---------- Layout ---------- */
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
  bgCtx.fillStyle = "#ffffff";
  bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
}

function layoutAndRedraw() {
  const w = innerWidth;
  const h = innerHeight;
  for (const c of [bgCanvas, drawCanvas, spriteCanvas]) {
    c.width = w; c.height = h;
    c.style.width = w + "px";
    c.style.height = h + "px";
  }

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
addEventListener("resize", layoutAndRedraw);

/* ---------- Drawing (rounded brush) ---------- */
let drawing = false;
let currentTool = "draw";
let brushSize   = 18;
let brushColor  = "#2ad0ff";
let opacity     = 1.0;
let prevX = null, prevY = null;
let zoomLevel = 1;

// UI refs
const brushSlider   = document.querySelector(".brush-size-slider");
const opacitySlider = document.querySelector(".opacity-slider");
const colorInput    = document.querySelector(".pick-color");

// round brush edges
ctx.lineJoin = "round";
ctx.lineCap  = "round";

function setTool(tool) { currentTool = tool; }
colorInput?.addEventListener("change", () => { brushColor = colorInput.value; });
brushSlider?.addEventListener("input", () => { brushSize = parseInt(brushSlider.value, 10); updateSliderFill(brushSlider); });
opacitySlider?.addEventListener("input", () => { opacity = parseFloat(opacitySlider.value); updateSliderFill(opacitySlider); });

function getPos(e) {
  const r = drawCanvas.getBoundingClientRect();
  const cx = e.clientX ?? e.touches?.[0]?.clientX;
  const cy = e.clientY ?? e.touches?.[0]?.clientY;
  const x = (cx - r.left) / zoomLevel;
  const y = (cy - r.top)  / zoomLevel;
  return [x, y];
}
function isInBounds(x, y) {
  return x >= allowedArea.x && x <= allowedArea.x + allowedArea.width &&
         y >= allowedArea.y && y <= allowedArea.y + allowedArea.height;
}

let history = [], redoStack = [];
function saveHistory() {
  history.push(ctx.getImageData(0,0,drawCanvas.width,drawCanvas.height));
  if (history.length > 40) history.shift();
  redoStack = [];
}
function undo() {
  if (!history.length) return;
  redoStack.push(ctx.getImageData(0,0,drawCanvas.width,drawCanvas.height));
  ctx.putImageData(history.pop(),0,0);
}
function redo() {
  if (!redoStack.length) return;
  saveHistory();
  ctx.putImageData(redoStack.pop(),0,0);
}

// paint a round dot for taps/clicks (no short line artifacts)
function dotAt(x, y) {
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = (currentTool === "erase") ? "destination-out" : "source-over";
  ctx.beginPath();
  ctx.arc(x, y, brushSize/2, 0, Math.PI*2);
  ctx.fillStyle = brushColor;
  ctx.fill();
}

function drawStroke(e) {
  if (!drawing) return;
  const [x, y] = getPos(e);
  if (!isInBounds(x, y)) return;

  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = (currentTool === "erase") ? "destination-out" : "source-over";
  ctx.strokeStyle = brushColor;
  ctx.lineWidth   = brushSize;

  if (prevX == null || prevY == null) {
    dotAt(x,y);
  } else {
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  prevX = x; prevY = y;
}

// mouse/touch
drawCanvas.addEventListener("mousedown", (e)=>{
  const [x,y]=getPos(e);
  if (isInBounds(x,y)) { saveHistory(); drawing=true; prevX=prevY=null; drawStroke(e); }
});
drawCanvas.addEventListener("mousemove", drawStroke);
drawCanvas.addEventListener("mouseup",   ()=>{ drawing=false; prevX=prevY=null; });
drawCanvas.addEventListener("mouseout",  ()=>{ drawing=false; prevX=prevY=null; });

drawCanvas.addEventListener("touchstart", (e)=>{
  const [x,y]=getPos(e);
  if (isInBounds(x,y)) { saveHistory(); drawing=true; prevX=prevY=null; drawStroke(e.touches[0]); }
},{ passive:true });
drawCanvas.addEventListener("touchmove", (e)=>{
  e.preventDefault();
  drawStroke(e.touches[0]);
},{ passive:false });
drawCanvas.addEventListener("touchend", ()=>{ drawing=false; prevX=prevY=null; });

/* ---------- Clear + zoom ---------- */
function clearCanvas() {
  ctx.clearRect(0,0,drawCanvas.width,drawCanvas.height);
  layoutAndRedraw();
}
function zoomIn()  { zoomLevel *= 1.1; applyZoom(); }
function zoomOut() { zoomLevel /= 1.1; applyZoom(); }
function applyZoom() {
  for (const c of [bgCanvas, drawCanvas, spriteCanvas]) {
    c.style.transformOrigin = "center center";
    c.style.transform = `scale(${zoomLevel})`;
  }
}

/* ---------- Save dropdown ---------- */
function toggleSaveOptions() {
  document.getElementById("saveOptions").classList.toggle("hidden");
}
async function downloadImage() {
  const merged = document.createElement("canvas");
  merged.width = drawCanvas.width;
  merged.height = drawCanvas.height;
  const m = merged.getContext("2d");
  m.fillStyle = "#ffffff";
  m.fillRect(0,0,merged.width,merged.height);
  m.drawImage(drawCanvas,0,0);
  m.drawImage(spriteCanvas,0,0);
  const a = document.createElement("a");
  a.download = "my_drawing.png";
  a.href = merged.toDataURL("image/png");
  a.click();
  document.getElementById("saveOptions").classList.add("hidden");
}

/* ---------- CSV → alpha mask helpers ---------- */
async function loadCSVMatrix(url) {
  const resp = await fetch(url, { cache: "no-cache" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const text = await resp.text();
  const rows = text.trim().split(/\r?\n/);
  const mat  = rows.map(r => r.split(",").map(v => +v));
  const H = mat.length, W = mat[0]?.length || 0;
  if (!W || !H) throw new Error(`Empty/invalid CSV: ${url}`);
  return { mat, W, H };
}
async function matrixToMaskCanvas(mat, srcW, srcH, targetW, targetH) {
  const src = document.createElement("canvas");
  src.width = srcW; src.height = srcH;
  const cSrc = src.getContext("2d");
  const imgData = cSrc.createImageData(srcW, srcH);
  let k = 0;
  for (let y=0; y<srcH; y++){
    const row = mat[y];
    for (let x=0; x<srcW; x++){
      const id = row?.[x] || 0;
      imgData.data[k++] = 255;
      imgData.data[k++] = 255;
      imgData.data[k++] = 255;
      imgData.data[k++] = id>0 ? 255 : 0; // alpha
    }
  }
  cSrc.putImageData(imgData,0,0);

  const scaled = document.createElement("canvas");
  scaled.width = targetW; scaled.height = targetH;
  const cTgt = scaled.getContext("2d");
  cTgt.imageSmoothingEnabled = false;
  cTgt.drawImage(src, 0, 0, targetW, targetH);
  return scaled;
}

/* ---------- Send to storyboard (build 4 masked frames) ---------- */
async function sendToStoryboard() {
  try {
    const { x, y, width, height } = allowedArea;

    // crop paint to sprite box
    const crop = document.createElement("canvas");
    crop.width = width; crop.height = height;
    crop.getContext("2d").drawImage(drawCanvas, x, y, width, height, 0, 0, width, height);

    // build 4 masked frames
    const frames = [];
    for (let i=1; i<=4; i++){
      const { mat, W, H } = await loadCSVMatrix(MASK_CSV(selectedChar, i));
      const mask = await matrixToMaskCanvas(mat, W, H, width, height);

      const out = document.createElement("canvas");
      out.width = width; out.height = height;
      const oc = out.getContext("2d");
      oc.drawImage(crop, 0, 0);
      oc.globalCompositeOperation = "destination-in";
      oc.drawImage(mask, 0, 0);
      oc.globalCompositeOperation = "source-over";
      frames.push(out.toDataURL("image/png"));
    }

    localStorage.setItem("coloredCharacterFrames", JSON.stringify(frames));
    localStorage.setItem("coloredCharacter", frames[0]);
    localStorage.setItem("selectedCharacter", selectedChar);

    const uid = localStorage.getItem("deviceToken") || (crypto.randomUUID?.() || String(Date.now()));
    try { await submitDrawing(sessionCode, selectedChar, frames[0], uid); } catch(e){ console.warn("submitDrawing:", e); }

    const q = new URLSearchParams({ char: selectedChar });
    if (sessionCode)   q.set("session", sessionCode);
    if (selectedStory) q.set("story", selectedStory);
    if (selectedGrade) q.set("grade", selectedGrade);
    location.href = `storyboard.html?${q.toString()}`;
  } catch (e) {
    console.error("Send to Storyboard failed:", e);
    alert("Send to Storyboard failed. See console for details.");
  }
}

/* ---------- Slider fill cosmetics (makes bars visible) ---------- */
function updateSliderFill(slider) {
  if (!slider) return;
  const p = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.setProperty("--percent", `${p}%`);
}
updateSliderFill(brushSlider);
updateSliderFill(opacitySlider);

/* ---------- Expose for buttons ---------- */
Object.assign(window, {
  setTool, undo, redo, clearCanvas, toggleSaveOptions,
  downloadImage, sendToStoryboard, zoomIn, zoomOut
});
