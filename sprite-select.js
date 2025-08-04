
// sprite-select.js
import { getDatabase, ref, onValue, set, get, child } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// Get session ID from query string
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get("session");

if (!sessionId) {
  alert("No session ID found. Please join or create a session first.");
  window.location.href = "session.html"; // fallback if no session
}

const db = getDatabase();
const charactersRef = ref(db, `sessions/${sessionId}/characters`);

// Load current character lock state
onValue(charactersRef, snapshot => {
  const data = snapshot.val() || {};

  document.querySelectorAll(".character").forEach(char => {
    const charKey = char.getAttribute("data-char");
    if (data[charKey]) {
      char.classList.add("locked");
      char.style.opacity = "0.4";
      char.style.pointerEvents = "none";
    } else {
      char.classList.remove("locked");
      char.style.opacity = "1";
      char.style.pointerEvents = "auto";
    }
  });
});

// Handle selection
document.querySelectorAll(".character").forEach(char => {
  char.addEventListener("click", async () => {
    const selectedChar = char.getAttribute("data-char");
    const charRef = ref(db, `sessions/${sessionId}/characters/${selectedChar}`);

    // Check if character is already taken
    const snapshot = await get(charRef);
    if (snapshot.exists()) {
      alert("Sorry, this character is already taken.");
      return;
    }

    // Lock character in database
    await set(charRef, true);

    // Redirect to canvas with char and session
    window.location.href = `canvas.html?char=${selectedChar}&session=${sessionId}`;
  });
});

/*// Character selection logic
document.querySelectorAll(".character").forEach(char => {
    char.addEventListener("click", () => {
        const selected = char.getAttribute("data-char") || "unknown";
        console.log(`Selected character: ${selected}`);
        window.location.href = `canvas.html?char=${selected}`;
    });
});
// Direct to Canvas.HTML: Source Index.html*/
