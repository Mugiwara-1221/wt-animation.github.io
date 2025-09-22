
// js/index.js
// Session page controller (browser-safe)

import { nextURL } from './flow.js';

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

const makeCode = () => String(Math.floor(100000 + Math.random() * 900000));

createBtn?.addEventListener('click', async () => {
  try {
    const sessionCode = makeCode();
    localStorage.setItem('sessionCode', sessionCode);
    sessionCodeDisplay.textContent = `Session ID: ${sessionCode}`;
    const url = nextURL('story-select.html', { session: sessionCode });
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
    joinError.textContent = 'Enter a valid Member ID (1–6).';
    return;
  }

  try {
    localStorage.setItem('sessionCode', code);
    localStorage.setItem('memberId', idCode);
    localStorage.setItem('deviceToken', deviceToken);
    const url = nextURL('story-select.html', { session: code });
    location.href = url;
  } catch (e) {
    joinError.textContent = 'Session not found or closed.';
  }
});
