
import { getDatabase, ref, onValue, set, get } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// Get session ID from query string
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get("session");

if (!sessionId) {
  alert("No session ID found. Please join or create a session first.");
  window.location.href = "session.html";
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
    } else {
      char.classList.remove("locked");
    }
  });
});

// Handle character selection
document.querySelectorAll(".character").forEach(char => {
  char.addEventListener("click", async () => {
    const selectedChar = char.getAttribute("data-char");
    const charRef = ref(db, `sessions/${sessionId}/characters/${selectedChar}`);

    const snapshot = await get(charRef);
    if (snapshot.exists()) {
      alert("Sorry, this character is already taken.");
      return;
    }

    await set(charRef, true); // Lock character

    // Redirect to canvas with char and session
    window.location.href = `canvas.html?char=${selectedChar}&session=${sessionId}`;
  });
});

