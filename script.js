"use strict";

// Navigation toggle
const toggleLeft = document.querySelector(".toggleNavLeft");
const navLeft = document.querySelector("#navLeft");
let toggleStatus = 1;

function toggleMenu() {
    if (toggleStatus === 1) {
        navLeft.style.left = "-251px";
        toggleLeft.style.backgroundImage = "url('navigateRight.png')";
        toggleStatus = 0;
    } else {
        navLeft.style.left = "0px";
        toggleLeft.style.backgroundImage = "url('navigateLeft.png')";
        toggleStatus = 1;
    }
}
toggleLeft.addEventListener("click", toggleMenu);

// Canvas setup
const bgCanvas = document.getElementById("bgCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const bgCtx = bgCanvas.getContext("2d");
const ctx = drawCanvas.getContext("2d");

bgCanvas.width = drawCanvas.width = window.innerWidth;
bgCanvas.height = drawCanvas.height = window.innerHeight;

// Load background image
const bgImage = new Image();
bgImage.src = "backgroundtest.jpg"; // Replace with your actual image path
bgImage.onload = () => {
    bgCtx.drawImage(bgImage, 0, 0, bgCanvas.width, bgCanvas.height);
};

// UI Elements
const colorInput = document.querySelector(".pick-color");
const lineWidthInput = document.querySelector(".line-width-input");
const colorBtn = document.querySelector(".color-btn");
const lineWidthBtn = document.querySelector(".line-width-btn");
const lineJoinBtn = document.querySelector(".line-join-btn");

// Brush state
let drawing = false;
let currentTool = "draw";
let brushSize = parseInt(lineWidthInput.value);
let brushColor = colorInput.value;
let prevX = null;
let prevY = null;

// Initial canvas defaults
ctx.lineJoin = document.querySelector(".line-join-select").value;
ctx.lineCap = "round";
ctx.lineWidth = brushSize;
ctx.strokeStyle = brushColor;

// Tool switching
function setTool(tool) {
    currentTool = tool;
}

// Drawing helpers
function getPos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
}

function draw(e) {
    if (!drawing) return;
    const [x, y] = getPos(e);

    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";

    if (currentTool === "erase") {
        ctx.globalCompositeOperation = "destination-out";
    } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = brushColor;
    }

    ctx.beginPath();
    ctx.moveTo(prevX ?? x, prevY ?? y);
    ctx.lineTo(x, y);
    ctx.stroke();

    prevX = x;
    prevY = y;
}

// Clear & Save
function clearCanvas() {
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
}

function saveImage() {
    const mergedCanvas = document.createElement("canvas");
    mergedCanvas.width = drawCanvas.width;
    mergedCanvas.height = drawCanvas.height;
    const mergedCtx = mergedCanvas.getContext("2d");

    mergedCtx.drawImage(bgCanvas, 0, 0);
    mergedCtx.drawImage(drawCanvas, 0, 0);

    const link = document.createElement("a");
    link.download = "my_drawing.png";
    link.href = mergedCanvas.toDataURL();
    link.click();
}

// Apply buttons
colorBtn.addEventListener("click", () => {
    brushColor = colorInput.value;
    document.querySelector(".color-info").textContent = brushColor;
});

lineWidthBtn.addEventListener("click", () => {
    brushSize = parseInt(lineWidthInput.value);
    document.querySelector(".line-width-info").textContent = brushSize;
});

lineJoinBtn.addEventListener("click", () => {
    ctx.lineJoin = document.querySelector(".line-join-select").value;
    document.querySelector(".line-join-info").textContent = ctx.lineJoin;
});

// Sync defaults to info table
document.querySelector(".line-join-info").textContent = ctx.lineJoin;
document.querySelector(".line-width-info").textContent = brushSize;
document.querySelector(".color-info").textContent = brushColor;

// Drawing events
drawCanvas.addEventListener("mousedown", (e) => {
    drawing = true;
    [prevX, prevY] = getPos(e);
});
drawCanvas.addEventListener("mouseup", () => {
    drawing = false;
    prevX = prevY = null;
});
drawCanvas.addEventListener("mouseout", () => {
    drawing = false;
    prevX = prevY = null;
});
drawCanvas.addEventListener("mousemove", draw);

// Touch support
drawCanvas.addEventListener("touchstart", (e) => {
    drawing = true;
    [prevX, prevY] = getPos(e.touches[0]);
});
drawCanvas.addEventListener("touchend", () => {
    drawing = false;
    prevX = prevY = null;
});
drawCanvas.addEventListener("touchcancel", () => {
    drawing = false;
    prevX = prevY = null;
});
drawCanvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    draw(e.touches[0]);
}, { passive: false });

