
// Load the colored drawing from localStorage
const coloredDataURL = localStorage.getItem("coloredCharacter");
const selectedChar = localStorage.getItem("selectedCharacter"); // Get selected character

if (coloredDataURL && selectedChar) {
  const img = document.getElementById("coloredCharacter");
  img.src = coloredDataURL;
  img.classList.add(selectedChar.toLowerCase()); // ✅ Apply class for position/size
} else {
  alert("No character image found. Please color your character first.");
}
