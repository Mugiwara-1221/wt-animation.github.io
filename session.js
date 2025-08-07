
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getDatabase, ref, set, get, child, runTransaction } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
import { firebaseConfig } from "./firebase-init.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM Elements
const createBtn = document.getElementById("createSession");
const joinBtn = document.getElementById("joinSession");
const joinInput = document.getElementById("joinCode");
const joinId = document.getElementById("joinCodeId");
const sessionCodeDisplay = document.getElementById("sessionCodeDisplay");

// Utility: Generate 6-digit session code
function generateSessionCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Create a new session
createBtn.addEventListener("click", async () => {
  const sessionCode = generateSessionCode();
  const sessionRef = ref(db, "sessions/" + sessionCode);

  await set(sessionRef, {
    createdAt: Date.now(),
    characters: {},
    id1: 1,
    id2: 2,
    id3: 3,
    id4: 4,
    id5: 5,
    id6: 6
  });

  localStorage.setItem("sessionCode", sessionCode);
  sessionCodeDisplay.textContent = `Session ID: ${sessionCode}`;

  // Wait 2 seconds so user sees the session code
  setTimeout(() => {
    window.location.href = `index.html?session=${sessionCode}`;
  }, 2000);
});

async function useMemberId(sessionId, idKey) {
  const idRef = ref(db, `sessions/${sessionId}/id${idKey}`);

  const result = await runTransaction(idRef, (current) => {
    if (current === null || current === 0) {
      return; // ID doesn’t exist or already used
    }
    return 0; // Mark as used by setting to 0 (or any sentinel)
  });

  if (!result.committed) {
    console.log("Member ID doesn’t exist or is already used.");
    return false;
  }

  console.log("Member ID successfully marked as used!");
  return true;
}

// Join an existing session
joinBtn.addEventListener("click", async () => {
  const code = joinInput.value.trim();
  const idCode = joinId.value.trim();
  if (code.length !== 6 )  {
    alert("Please enter a valid 6-digit session code.");
    return;
  }
  if (!idCode) {
    alert("Enter Member ID");
    return;
  }

  const snapshot = await get(child(ref(db), "sessions/" + code));
  const idCheck = await get(child(ref(db), `sessions/${code}/id${idCode}`));
  const userCheck = useMemberId(code, idCode)
  console.log(userCheck);
  if (snapshot.exists() && idCheck.exists() && userCheck != true) {
    localStorage.setItem("sessionCode", code);
    window.location.href = `index.html?session=${code}`;
  } else if (!idCheck.exists()) {
    alert("All Members have Joined this Session.");
  } else {
    alert("Session or Member ID not found.");
  }
});

