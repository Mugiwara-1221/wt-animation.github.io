
import { getDatabase, ref, onValue, set, get, child } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// Firebase Realtime Database
const db = getDatabase();
const sessionId = localStorage.getItem("sessionId"); // Ensure session ID is saved earlier
if (!sessionId) {
    alert("No session ID found. Please join or create a session first.");
    window.location.href = "session.html"; // adjust if needed
}

const characters = document.querySelectorAll(".character");

// Step 1: Check lock status
function updateCharacterStatus() {
    const sessionRef = ref(db, `sessions/${sessionId}/characters`);
    onValue(sessionRef, (snapshot) => {
        const data = snapshot.val() || {};
        characters.forEach(char => {
            const charKey = char.dataset.char;
            const lockedBy = data[charKey];
            if (lockedBy) {
                char.style.opacity = 0.4;
                char.style.pointerEvents = "none";
            } else {
                char.style.opacity = 1;
                char.style.pointerEvents = "auto";
            }
        });
    });
}

// Step 2: Handle character selection and locking
characters.forEach(char => {
    char.addEventListener("click", () => {
        const selectedChar = char.dataset.char;
        const charRef = ref(db, `sessions/${sessionId}/characters/${selectedChar}`);

        // Lock the character only if not already locked
        get(charRef).then(snapshot => {
            if (snapshot.exists()) {
                alert("This character has already been selected.");
                return;
            }

            const userId = localStorage.getItem("userId") || crypto.randomUUID();
            localStorage.setItem("userId", userId);
            localStorage.setItem("selectedCharacter", selectedChar);

            set(charRef, userId).then(() => {
                console.log(`Locked ${selectedChar} for ${userId}`);
                window.location.href = `canvas.html?char=${selectedChar}`;
            });
        });
    });
});

// Initial fetch
updateCharacterStatus();

/*// Character selection logic
document.querySelectorAll(".character").forEach(char => {
    char.addEventListener("click", () => {
        const selected = char.getAttribute("data-char") || "unknown";
        console.log(`Selected character: ${selected}`);
        window.location.href = `canvas.html?char=${selected}`;
    });
});
// Direct to Canvas.HTML: Source Index.html*/
