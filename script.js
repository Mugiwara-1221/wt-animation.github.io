"use strict";

// Navigation toggle
const toggleLeft = document.querySelector(".toggleNavLeft");
const navLeft = document.querySelector("#navLeft");
let toggleStatus = 1;

function toggleMenu() {
    if (toggleStatus === 1) {
        navLeft.style.left = "-251px";
        toggleLeft.style.backgroundImage = "url('images/navigateRight.png')";
        toggleStatus = 0;
    } else {
        navLeft.style.left = "0px";
        toggleLeft.style.backgroundImage = "url('images/navigateLeft.png')";
        toggleStatus = 1; 
    }
}
toggleLeft.addEventListener("click", toggleMenu);

// Canvas setup
const bgCanvas = document.getElementById("bgCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const bgCtx = bgCanvas.getContext("2d");
const ctx = drawCanvas.getContext("2d");

const urlParams = new URLSearchParams(window.location.search); //added 7/28
const selectedChar = urlParams.get("char") || "tortoise";
window.selectedChar = selectedChar.toLowerCase();
console.log("Selected character:", window.selectedChar);

bgCanvas.width = drawCanvas.width = window.innerWidth;
bgCanvas.height = drawCanvas.height = window.innerHeight;

// Load background image
const bgImage = new Image();
bgImage.src = "images/pondimage.jpg";
bgImage.onload = () => {
    bgCtx.drawImage(bgImage, 0, 0, bgCanvas.width, bgCanvas.height);
};

// Define bounding boxes (adjust as needed for your layout)
const spriteBoundingBoxes = {
    duck1: { x: 150, y: 200, width: 120, height: 120 },
    tree1: { x: 300, y: 180, width: 150, height: 200 },
    squirrel: { x: 500, y: 250, width: 100, height: 120 },
    hare: { x: 700, y: 400, width: 130, height: 130 },
    // Add more entries...
};

const allowedArea = spriteBoundingBoxes[selectedChar];

// UI Elements
const colorInput = document.querySelector(".pick-color");
const lineWidthInput = document.querySelector(".line-width-input");
const colorBtn = document.querySelector(".color-btn");
const lineWidthBtn = document.querySelector(".line-width-btn");
const lineJoinBtn = document.querySelector(".line-join-btn");

let drawing = false;
let currentTool = "draw";
let brushSize = parseInt(lineWidthInput.value);
let brushColor = colorInput.value;
let prevX = null;
let prevY = null;

ctx.lineJoin = document.querySelector(".line-join-select").value;
ctx.lineCap = "round";
ctx.lineWidth = brushSize;
ctx.strokeStyle = brushColor;

function setTool(tool) {
    currentTool = tool;
}

function getPos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    return [x, y];
}

function isInBounds(x, y) {
    if (!allowedArea) return false;
    return (
        x >= allowedArea.x &&
        x <= allowedArea.x + allowedArea.width &&
        y >= allowedArea.y &&
        y <= allowedArea.y + allowedArea.height
    );
}

function draw(e) {
    if (!drawing) return;
    const [x, y] = getPos(e);

    if (!isInBounds(x, y)) return;

    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = currentTool === "erase" ? "destination-out" : "source-over";
    ctx.strokeStyle = brushColor;

    ctx.beginPath();
    ctx.moveTo(prevX ?? x, prevY ?? y);
    ctx.lineTo(x, y);
    ctx.stroke();

    prevX = x;
    prevY = y;
}

// Draggable tool panel
const toolsPanel = document.querySelector(".tools");
let isDragging = false;
let offsetX, offsetY;

function startDrag(e) {
    isDragging = true;
    toolsPanel.style.cursor = "grabbing";
    const rect = toolsPanel.getBoundingClientRect();
    offsetX = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    offsetY = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
}
function duringDrag(e) {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.clientX || e.touches?.[0]?.clientX;
    const y = e.clientY || e.touches?.[0]?.clientY;
    toolsPanel.style.left = `${x - offsetX}px`;
    toolsPanel.style.top = `${y - offsetY}px`;
}
function endDrag() {
    isDragging = false;
    toolsPanel.style.cursor = "grab";
}
toolsPanel.addEventListener("mousedown", startDrag);
toolsPanel.addEventListener("touchstart", startDrag);
window.addEventListener("mousemove", duringDrag);
window.addEventListener("touchmove", duringDrag, { passive: false });
window.addEventListener("mouseup", endDrag);
window.addEventListener("touchend", endDrag);

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

document.querySelector(".line-join-info").textContent = ctx.lineJoin;
document.querySelector(".line-width-info").textContent = brushSize;
document.querySelector(".color-info").textContent = brushColor;

// Draw events
drawCanvas.addEventListener("mousedown", (e) => {
    const [x, y] = getPos(e);
    if (isInBounds(x, y)) {
        drawing = true;
        [prevX, prevY] = [x, y];
    }
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
    const [x, y] = getPos(e);
    if (isInBounds(x, y)) {
        drawing = true;
        [prevX, prevY] = [x, y];
    }
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

/* "use strict";

// Navigation toggle
const toggleLeft = document.querySelector(".toggleNavLeft");
const navLeft = document.querySelector("#navLeft");
let toggleStatus = 1;

function toggleMenu() {
    if (toggleStatus === 1) {
        navLeft.style.left = "-251px";
        toggleLeft.style.backgroundImage = "url('images/navigateRight.png')";
        toggleStatus = 0;
    } else {
        navLeft.style.left = "0px";
        toggleLeft.style.backgroundImage = "url('images/navigateLeft.png')";
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
bgImage.src = "images/pondimage.jpg"; // Background Image (Setting)
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

const toolsPanel = document.querySelector(".tools");

let isDragging = false;
let offsetX, offsetY;

function startDrag(e) {
    isDragging = true;
    toolsPanel.style.cursor = "grabbing";

    const rect = toolsPanel.getBoundingClientRect();

    if (e.type.startsWith("touch")) {
        offsetX = e.touches[0].clientX - rect.left;
        offsetY = e.touches[0].clientY - rect.top;
    } else {
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
    }
}

//Draggable Tool Box
function duringDrag(e) {
    if (!isDragging) return;

    e.preventDefault();

    let clientX, clientY;

    if (e.type.startsWith("touch")) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    toolsPanel.style.left = `${clientX - offsetX}px`;
    toolsPanel.style.top = `${clientY - offsetY}px`;
}

function endDrag() {
    isDragging = false;
    toolsPanel.style.cursor = "grab";
}

toolsPanel.addEventListener("mousedown", startDrag);
toolsPanel.addEventListener("touchstart", startDrag);

window.addEventListener("mousemove", duringDrag);
window.addEventListener("touchmove", duringDrag, { passive: false });

window.addEventListener("mouseup", endDrag);
window.addEventListener("touchend", endDrag);

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
}, { passive: false });*/
