
// session.js (Azure version)
import { createSession } from "./azure-api.js";

const createBtn = document.getElementById("createSession");
const joinBtn = document.getElementById("joinSession");
const joinInput = document.getElementById("joinCode");
const joinId = document.getElementById("joinCodeId");
const sessionCodeDisplay = document.getElementById("sessionCodeDisplay");

function getDeviceToken() {
  let token = localStorage.getItem('deviceToken');
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem('deviceToken', token);
  }
  return token;
}
const deviceToken = getDeviceToken();

// Create a new session (replaces Firebase set)
createBtn.addEventListener("click", async () => {
  try {
    const session = await createSession(6);
    const sessionCode = session.sessionCode;
    localStorage.setItem("sessionCode", sessionCode);
    sessionCodeDisplay.textContent = `Session ID: ${sessionCode}`;

    // keep your “member slot” UX as-is (optional in Cosmos design)
    setTimeout(() => {
      window.location.href = `index.html?session=${sessionCode}`;
    }, 2000);
  } catch (e) {
    alert("Failed to create session. " + e.message);
  }
});

// Join existing session (front-end validation only; back-end authorize as needed)
joinBtn.addEventListener("click", async () => {
  const code = joinInput.value.trim();
  const idCode = joinId.value.trim();
  if (code.length !== 6 && !code.includes("-")) {  // supports both 6-digit and ABC-123
    alert("Enter a valid session code.");
    return;
  }
  if (!idCode || Number(idCode) < 1 || Number(idCode) > 6) {
    alert("Enter Valid Member ID (1-6)");
    return;
  }
  try {
    const s = await getSession(code);
    if (!s || s.status !== "active") throw new Error("Session not active");
    localStorage.setItem("sessionCode", code);
    // store the device/member mapping locally (optional)
    localStorage.setItem("memberId", idCode);
    localStorage.setItem("deviceToken", deviceToken);
    window.location.href = `index.html?session=${code}`;
  } catch (e) {
    alert("Session not found or closed.");
  }
});


