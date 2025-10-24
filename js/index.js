
// js/index.js
// Session page controller (browser-safe)

//import { use } from 'react';
import { nextURL } from './flow.js';

const hostname = window.location.hostname;
const port = window.location.port;
let API_BASE;
// Case 1: running locally (frontend served from localhost or 127.0.0.1)
if (hostname === "localhost" || hostname === "127.0.0.1") {
  // If you’re serving FastAPI on 5500, use that
  API_BASE = `http://${hostname}:${port}`;
}
// Case 2: production (your deployed site)
else {
  API_BASE = "https://wt-animation-github-io.onrender.com";
}

const createBtn          = document.getElementById('createSessionBtn');
const joinBtn            = document.getElementById('joinSessionBtn');
const joinInput          = document.getElementById('joinCodeInput');
const joinId             = document.getElementById('joinCodeId');
const sessionCodeDisplay = document.getElementById('sessionCodeDisplay');
const joinError          = document.getElementById('joinError');

function getDeviceToken() {
  let token = localStorage.getItem('deviceToken');
  if (!token) {
    token = (crypto.randomUUID?.() || String(Date.now()));
    localStorage.setItem('deviceToken', token);
  }
  return token;
}
const deviceToken = getDeviceToken();

//const makeCode = () => String(Math.floor(100000 + Math.random() * 900000));

// TODO: update blah blah blah @hidalgoerick

/*createBtn?.addEventListener('click', async () => {
 try{
  //const res = await fetch('/session', {method: 'POST'});
  fetch('https://wt-animation-github-io.onrender.com/session/123/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Guest 1' })
  });
  if(!res.ok) throw new Error(`Server error: ${res.status}`);
  const {session_id} = await res.json();
  //console.log('Created session', session_id);

  localStorage.setItem('sessionCode', session_id);
  sessionCodeDisplay.textContent = `Session ID: ${session_id}`;

  const url = nextURL('story-select.html', { session: session_id });
  location.href = url;
 } catch(e) {
  alert('Failed to create session. ' + (e?.message || e));
 }
});*/

createBtn?.addEventListener('click', async () => {
  try {
    const res = await fetch(`${API_BASE}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 'Guest 1' })
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const { session_id, user_id } = await res.json();

    localStorage.setItem('sessionCode', session_id);
    localStorage.setItem('memberId', user_id);
    sessionCodeDisplay.textContent = `Session ID: ${session_id} User: ${user_id}`;

    const url = nextURL('story-select.html', { session: session_id });
    location.href = url;
  } catch (e) {
    alert('Failed to create session. ' + (e?.message || e));
  }
});

joinBtn?.addEventListener('click', async () => {
  joinError.textContent = '';

  const code   = (joinInput?.value || '').trim();
  const idCode = (joinId?.value    || '').trim();

  const sixDigitOk = /^\d{6}$/.test(code);
  const dashedOk   = /^[A-Za-z]{3}-\d{3}$/.test(code) || code.includes('-');

  if (!sixDigitOk && !dashedOk) {
    joinError.textContent = 'Enter a valid 6-digit or ABC-123 session code.';
    return;
  }
  if (!/^[1-6]$/.test(idCode)) {
    joinError.textContent = 'ID (1–6).';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/session/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: parseInt(idCode,10) })
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    //console.log('Joined session', code, data);
    localStorage.setItem('sessionCode', code);
    localStorage.setItem('memberId', idCode);
    localStorage.setItem('deviceToken', deviceToken);
    const url = nextURL('story-select.html', { session: code });
    location.href = url;
  } catch (e) {
    joinError.textContent = 'Session not found or closed.';
  }
});
