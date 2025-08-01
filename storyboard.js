
const coloredDataURL = localStorage.getItem("coloredCharacter");
const selectedChar = localStorage.getItem("selectedCharacter");

if (coloredDataURL && selectedChar) {
  const img = document.getElementById("coloredCharacter");
  img.src = coloredDataURL;
  img.classList.add(selectedChar.toLowerCase());  // Apply class like .bear
} else {
  alert("No character image found. Please color your character first.");
}
