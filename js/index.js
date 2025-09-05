
// js/index.js
// Session page controller (browser-safe)
// - Creates/joins a session
// - Persists session to localStorage
// - Navigates to story-select.html via flow.js

import { nextURL } from './flow.js';

const createBtn          = document.getElementById('createSessionBtn');
const joinBtn            = document.getElementById('joinSessionBtn');
const joinInput          = document.getElementById('joinCodeInput');
const joinId             = document.getElementById('joinCodeId');
const sessionCodeDisplay = document.getElementById('sessionCodeDisplay');
const joinError          = document.getElementById('joinError');

// Stable device token for lock ownership later
function getDeviceToken() {
  let token = localStorage.getItem('deviceToken');
  if (!token) {
    token = (crypto.randomUUID?.() || String(Date.now()));
    localStorage.setItem('deviceToken', token);
  }
  return token;
}
const deviceToken = getDeviceToken();

// --- Create a new session ---
createBtn?.addEventListener('click', async () => {
  const sessionCode = () => String(Math.floor(100000 + Math.random() * 900000));
  sessionCodeDisplay.textContent = `Session ID: ${sessionCode}`;
  try {
    const res = await fetch("/api/createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionCode }) // <─ send the code to API
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);

    const data = await res.json();

    const { id: returned_sessionCode, memberIds } = data;

    // Save locally
    localStorage.setItem("sessionCode", returned_sessionCode);
    if (memberIds) {
      localStorage.setItem("memberIds", JSON.stringify(memberIds));
    }

    // Show user
    // sessionCodeDisplay.textContent = `Session ID: ${returned_sessionCode}`;

    // Redirect to session page after short delay
    setTimeout(() => {
      window.location.href = `index.html?session=${returned_sessionCode}`;
    }, 1500);

  } catch (err) {
    console.error("Error creating session:", err);
    alert("Could not create session, please try again.");
  }
});

// --- Join an existing session ---
joinBtn?.addEventListener('click', async () => {
  joinError.textContent = '';

  const code   = (joinInput?.value || '').trim();
  const idCode = (joinId?.value    || '').trim();

  // Accepts 6 digits or ABC-123 style codes
  const sixDigitOk = /^\d{6}$/.test(code);
  const dashedOk   = /^[A-Za-z]{3}-\d{3}$/.test(code) || code.includes('-');

  if (!sixDigitOk && !dashedOk) {
    joinError.textContent = 'Enter a valid 6-digit or ABC-123 session code.';
    return;
  }
  if (!/^[1-6]$/.test(idCode)) {
    joinError.textContent = 'Enter a valid Member ID (1–6).';
    return;
  }

  try {
    // Local acceptance; wire Azure validation here later if needed
    localStorage.setItem('sessionCode', code);
    localStorage.setItem('memberId', idCode);
    localStorage.setItem('deviceToken', deviceToken);

    const url = nextURL('story-select.html', { session: code });
    location.href = url;
  } catch (e) {
    joinError.textContent = 'Session not found or closed.';
  }
});
