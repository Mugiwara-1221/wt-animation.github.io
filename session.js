
// session.js (Azure version)
import { createSession, getSession } from "./azure-api.js";

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

// Create a new session
createBtn?.addEventListener("click", async () => {
  try {
    const session = await createSession(6);
    const sessionCode = session.sessionCode;
    localStorage.setItem("sessionCode", sessionCode);
    sessionCodeDisplay && (sessionCodeDisplay.textContent = `Session ID: ${sessionCode}`);

    // show code briefly, then go select
    setTimeout(() => {
      window.location.href = `index.html?session=${sessionCode}`;
    }, 2000);
  } catch (e) {
    alert("Failed to create session. " + e.message);
  }
});

// Join existing session
joinBtn?.addEventListener("click", async () => {
  const code = (joinInput?.value || "").trim();
  const idCode = (joinId?.value || "").trim();

  // support both 6-digit or ABC-123 formats
  if ((code.length !== 6 && !code.includes("-"))) {
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
    localStorage.setItem("memberId", idCode);
    localStorage.setItem("deviceToken", deviceToken);

    window.location.href = `index.html?session=${code}`;
  } catch (e) {
    alert("Session not found or closed.");
  }
});
