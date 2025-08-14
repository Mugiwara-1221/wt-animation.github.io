
// session.js — Azure-ready, with local fallback

// import { createSession, getSession } from "./azure-api.js";

const createBtn = document.getElementById("createSessionBtn");
const joinBtn = document.getElementById("joinSessionBtn");
const joinInput = document.getElementById("joinCodeInput");
const joinId = document.getElementById("joinCodeId");
const sessionCodeDisplay = document.getElementById("sessionCodeDisplay");
const joinError = document.getElementById("joinError");

function getDeviceToken() {
  let token = localStorage.getItem("deviceToken");
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem("deviceToken", token);
  }
  return token;
}
const deviceToken = getDeviceToken();

// Local fallback code generator
const makeCode = () => String(Math.floor(100000 + Math.random() * 900000));

// Create a new session
createBtn?.addEventListener("click", async () => {
  try {
    // Azure API version:
    // const session = await createSession(6);
    // const sessionCode = session.sessionCode;

    // Local fallback:
    const sessionCode = makeCode();

    localStorage.setItem("sessionCode", sessionCode);
    sessionCodeDisplay.textContent = `Session ID: ${sessionCode}`;

    setTimeout(() => {
      window.location.href = `index.html?session=${sessionCode}`;
    }, 1500);
  } catch (e) {
    alert("Failed to create session. " + e.message);
  }
});

// Join an existing session
joinBtn?.addEventListener("click", async () => {
  joinError.textContent = "";

  const code = (joinInput?.value || "").trim();
  const idCode = (joinId?.value || "").trim();

  if (!/^\d{6}$/.test(code) && !code.includes("-")) {
    joinError.textContent = "Enter a valid 6-digit or ABC-123 session code.";
    return;
  }
  if (!/^[1-6]$/.test(idCode)) {
    joinError.textContent = "Enter a valid Member ID (1–6).";
    return;
  }

  try {
    // Azure API version:
    // const s = await getSession(code);
    // if (!s || s.status !== "active") throw new Error("Session not active");

    // Local fallback always allows join:
    localStorage.setItem("sessionCode", code);
    localStorage.setItem("memberId", idCode);
    localStorage.setItem("deviceToken", deviceToken);

    window.location.href = `index.html?session=${code}`;
  } catch (e) {
    joinError.textContent = "Session not found or closed.";
  }
});
