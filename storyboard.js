
// Load the colored drawing from localStorage
const coloredDataURL = localStorage.getItem("coloredCharacter");

// If found, display it in the scene
if (coloredDataURL) {
  const img = document.getElementById("coloredCharacter");
  img.src = coloredDataURL;
} else {
  alert("No character image found. Please color your character first.");
}
