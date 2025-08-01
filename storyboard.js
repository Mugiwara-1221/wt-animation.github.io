
const coloredDataURL = localStorage.getItem("coloredCharacter");
const selectedChar = localStorage.getItem("selectedCharacter");

const characterContainer = document.querySelector(".scene-wrapper");

if (coloredDataURL && selectedChar) {
  if (selectedChar === "tortoise") {
    const frames = [
      "images/frames/tortoise/tortoise1.png",
      "images/frames/tortoise/tortoise2.png",
      "images/frames/tortoise/tortoise3.png",
      "images/frames/tortoise/tortoise4.png"
    ];

    let currentFrame = 0;
    const frameDelay = 300; // ms

    // Create layered canvas: color underneath, outline on top
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 600;
    canvas.style.position = "absolute";
    canvas.style.left = "510px";
    canvas.style.top = "466px";
    canvas.style.width = "280px"; // same as original tortoise class
    canvas.style.height = "auto";
    canvas.style.zIndex = 2;

    const ctx = canvas.getContext("2d");

    const colorLayer = new Image();
    colorLayer.onload = () => {
      characterContainer.appendChild(canvas);
      animate();
    };
    colorLayer.src = coloredDataURL;

    function animate() {
      const frameImg = new Image();
      frameImg.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(colorLayer, 0, 0, canvas.width, canvas.height);  // student's coloring
        ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);    // outline animation frame
      };
      frameImg.src = frames[currentFrame];
      currentFrame = (currentFrame + 1) % frames.length;
      setTimeout(animate, frameDelay);
    }

  } else {
    // For non-animated characters, show as static image
    const img = document.getElementById("coloredCharacter");
    img.src = coloredDataURL;
    img.classList.add(selectedChar.toLowerCase());
  }
} else {
  alert("No character image found. Please color your character first.");
}

localStorage.removeItem("coloredCharacter");
localStorage.removeItem("selectedCharacter");
