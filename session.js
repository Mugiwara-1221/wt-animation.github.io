
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
import { firebaseConfig } from "./firebase-init.js"; // if you exported it there

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Elements
const createBtn = document.getElementById("createSession");
const joinBtn = document.getElementById("joinSession");
const joinInput = document.getElementById("joinCode");

// Create a 6-digit session code
function generateSessionCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Create session
createBtn.addEventListener("click", async () => {
  const sessionCode = generateSessionCode();
  const sessionRef = ref(db, "sessions/" + sessionCode);

  await set(sessionRef, {
    createdAt: Date.now(),
    characters: {}, // Tracks locked characters
  });

  localStorage.setItem("sessionCode", sessionCode);
  window.location.href = "index.html";
});

// Join session
joinBtn.addEventListener("click", async () => {
  const code = joinInput.value.trim();
  if (code.length !== 6) {
    alert("Please enter a valid 6-digit session code.");
    return;
  }

  const snapshot = await get(child(ref(db), "sessions/" + code));
  if (snapshot.exists()) {
    localStorage.setItem("sessionCode", code);
    window.location.href = "index.html";
  } else {
    alert("Session not found.");
  }
});
