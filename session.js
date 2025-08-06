
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
import { firebaseConfig } from "./firebase-init.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM Elements
const createBtn = document.getElementById("createSession");
const joinBtn = document.getElementById("joinSession");
const joinInput = document.getElementById("joinCode");
const sessionCodeDisplay = document.getElementById("sessionCodeDisplay");

// Utility: Generate 6-digit session code
function generateSessionCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Create a new session
createBtn.addEventListener("click", async () => {
  const sessionCode = generateSessionCode();
  const members = [];
  for ( let i=1; i<7; i++) {
    members.push(i);
  }
  const sessionRef = ref(db, "sessions/" + sessionCode);

  await set(sessionRef, {
    createdAt: Date.now(),
    characters: {},
    id1: members[0],
    id2: members[1],
    id3: members[2],
    id4: members[3],
    id5: members[4],
    id6: members[5],
  });

  localStorage.setItem("sessionCode", sessionCode);
  sessionCodeDisplay.textContent = `Session ID: ${sessionCode}`;

  // Wait 2 seconds so user sees the session code
  setTimeout(() => {
    window.location.href = `index.html?session=${sessionCode}`;
  }, 2000);
});

// Join an existing session
joinBtn.addEventListener("click", async () => {
  const code = joinInput.value.trim();
  if (code.length !== 6) {
    alert("Please enter a valid 6-digit session code.");
    return;
  }

  const snapshot = await get(child(ref(db), "sessions/" + code));
  if (snapshot.exists()) {
    localStorage.setItem("sessionCode", code);
    window.location.href = `index.html?session=${code}`;
  } else {
    alert("Session not found.");
  }
});

