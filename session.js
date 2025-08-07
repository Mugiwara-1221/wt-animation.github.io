
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

function getDeviceToken() {
  let token = localStorage.getItem('deviceToken');
  if (!token) {
    token = crypto.randomUUID(); 
    localStorage.setItem('deviceToken', token);
  }
  return token;
}

const deviceToken = getDeviceToken();

// Create a new session
createBtn.addEventListener("click", async () => {
  const sessionCode = generateSessionCode();
  const sessionRef = ref(db, "sessions/" + sessionCode);

  await set(sessionRef, {
    createdAt: Date.now(),
    characters: {},
    members: {id1: null, id2: null, id3: null, id4: null, id5: null, id6: null}
  });

  localStorage.setItem("sessionCode", sessionCode);
  sessionCodeDisplay.textContent = `Session ID: ${sessionCode}`;

  // Wait 2 seconds so user sees the session code
  setTimeout(() => {
    window.location.href = `index.html?session=${sessionCode}`;
  }, 2000);
});

async function claimSlot(sessionCode, slotKey, deviceToken) {
  const db = getDatabase();
  const slotRef = ref(db, `sessions/${sessionCode}/members/${slotKey}`);

  const result = await runTransaction(slotRef, (current) => {
    if (current != null) return; // already taken
    return deviceToken; // mark with unique device token
  });

  return result.committed; // true if slot claimed successfully
}

// Join an existing session
joinBtn.addEventListener("click", async () => {
  const code = joinInput.value.trim();
  const idCode = joinId.value.trim();
  if (code.length !== 6 )  {
    alert("Please enter a valid 6-digit session code.");
    return;
  }
  if (!idCode || idCode > 6) {
    alert("Enter Member ID");
    return;
  }

  const snapshot = await get(child(ref(db), "sessions/" + code));
  const idCheck = await get(child(ref(db), `sessions/${code}/members/${idCode}`));
  claimSlot(code, idCode, deviceToken);
  const tokenCheck = await get(child(ref(db), `sessions/${code}/members/${idCode}`));
  console.log(tokenCheck.val());
  if (snapshot.exists() && tokenCheck.exists()) {
    localStorage.setItem("sessionCode", code);
    window.location.href = `index.html?session=${code}`;
    console.log(tokenCheck.val());
  } else if (!idCheck.exists()) {
    alert("All Members have Joined this Session.");
  } else {
    alert("Session or Member ID not found.");
  }
});

