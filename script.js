"use strict";

const toggleLeft = document.querySelector(".toggleNavLeft");
const navLeft = document.querySelector("#navLeft");
let toggleStatus = 1;

function toggleMenu(){
    if(toggleStatus === 1){
        navLeft.style.left = "-251px";
        toggleLeft.style.backgroundImage = "url('navigateRight.png')";
        toggleStatus = 0;
    } else if(toggleStatus === 0){
        navLeft.style.left = "0px";
        toggleLeft.style.backgroundImage = "url('navigateLeft.png')";
        toggleStatus = 1;
    }
}

toggleLeft.addEventListener("click", toggleMenu);

const colorInput = document.querySelector(".pick-color");

function updateColor(){
    document.documentElement.style.setProperty(`--${this.name}`, this.value + "");
}

function saveImage() {
    const mergedCanvas = document.createElement("canvas");
    mergedCanvas.width = drawCanvas.width;
    mergedCanvas.height = drawCanvas.height;
    const mergedCtx = mergedCanvas.getContext("2d");

    // Merge layers
    mergedCtx.drawImage(bgCanvas, 0, 0);
    mergedCtx.drawImage(drawCanvas, 0, 0);

    const link = document.createElement('a');
    link.download = 'my_drawing.png';
    link.href = mergedCanvas.toDataURL();
    link.click();
}

colorInput.addEventListener("change", updateColor);

// Nav bar buttons //
const lineJoinBtn = document.querySelector(".line-join-btn");
// const lineCapBtn = document.querySelector(".line-cap-btn");
const lineWidthBtn = document.querySelector(".line-width-btn");
const colorBtn = document.querySelector(".color-btn");

//const canvas = document.querySelector("#canvas");
//const ctx = canvas.getContext('2d');
const bgCanvas = document.getElementById("bgCanvas");
const drawCanvas = document.getElementById("drawCanvas");

const bgCtx = bgCanvas.getContext("2d");
const ctx = drawCanvas.getContext("2d"); // this is where drawing happens

bgCanvas.width = drawCanvas.width = window.innerWidth;
bgCanvas.height = drawCanvas.height = window.innerHeight;

// Load background image
const bgImage = new Image();
bgImage.src = "your-background.jpg"; // <- replace with your image path
bgImage.onload = () => {
    bgCtx.drawImage(bgImage, 0, 0, bgCanvas.width, bgCanvas.height);
};

canvas.width = window.innerWidth; //may need to make a change here
canvas.height = window.innerHeight; //may need to make a change here
ctx.lineJoin = 'round';
ctx.lineCap = 'round';
ctx.lineWidth = "1";
ctx.strokeStyle = "#000000";

lineJoinBtn.addEventListener("click", () => {
    ctx.lineJoin = document.querySelector(".line-join-select").value;
    document.querySelector(".line-join-info").innerHTML = ctx.lineJoin;
})

//lineCapBtn.addEventListener("click", () => {
    //ctx.lineCap = document.querySelector(".line-cap-select").value;
    //document.querySelector(".line-cap-info").innerHTML = ctx.lineCap;
//})

lineWidthBtn.addEventListener("click", () => {
    ctx.lineWidth = document.querySelector(".line-width-input").value;
    document.querySelector(".line-width-info").innerHTML = ctx.lineWidth;
})

colorBtn.addEventListener("click", () => {
    ctx.strokeStyle = colorInput.value;
    document.querySelector(".color-info").innerHTML = ctx.strokeStyle;
});

document.querySelector(".line-join-info").innerHTML = ctx.lineJoin;
//document.querySelector(".line-cap-info").innerHTML = ctx.lineCap;
document.querySelector(".line-width-info").innerHTML = ctx.lineWidth;
document.querySelector(".color-info").innerHTML = ctx.strokeStyle;

let isDrawing = false;
let lastX = 0;
let lastY = 0;

function draw(event){
    if(!isDrawing) return;

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(event.offsetX, event.offsetY);
    ctx.stroke();
    [lastX, lastY] = [event.offsetX, event.offsetY];
}

drawCanvas.addEventListener("mousemove", draw);
drawCanvas.addEventListener("mousedown", () => {
    isDrawing = true;
    [lastX, lastY] = [event.offsetX, event.offsetY];
});
drawCanvas.addEventListener("mouseup", () => isDrawing = false);
drawCanvas.addEventListener("mouseout", () => isDrawing = false);
