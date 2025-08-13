// azure-api.js
/*const API_PROXY_BASE = "https://animationkey.vault.azure.net/"; // or leave empty if using anonymous

async function api(path, options = {}) {
  const res = await fetch(`${API_PROXY_BASE}/proxySession?path=${encodeURIComponent(path)}`, {
    ...options
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

/*async function api(path, options = {}) {
  const url = `${API_BASE}${path}${API_KEY ? `?code=${API_KEY}` : ""}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}*//*

// Sessions
export const createSession = (maxSeats=6) =>
  api(`/session`, { method: "POST", body: JSON.stringify({ maxSeats }) });

export const getSession = (sessionCode) =>
  api(`/session/${sessionCode}`, { method: "GET" });

export const lockCharacter = (sessionCode, character, uid) =>
  api(`/lock`, { method: "POST", body: JSON.stringify({ sessionCode, character, uid }) });

// Submissions (you’ll wire the backend next)
export const submitDrawing = (sessionCode, character, dataURL, uid) =>
  api(`/submit`, { method: "POST", body: JSON.stringify({ sessionCode, character, dataURL, uid }) });

export const getSubmissions = (sessionCode) =>
  api(`/submissions/${sessionCode}`, { method: "GET" });*/


const API_BASE = "/api"; // in Static Web Apps, API is same origin

export async function createSession() {
  const r = await fetch(`${API_BASE}/session`, { method: "POST" });
  if (!r.ok) throw new Error("createSession failed");
  return r.json(); // { code }
}

export async function getSession(code) {
  const r = await fetch(`${API_BASE}/session/${code}`);
  if (!r.ok) throw new Error("getSession failed");
  return r.json(); // { exists, locks }
}

export async function lockCharacter(code, character, token) {
  const r = await fetch(`${API_BASE}/session/${code}/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ character, token })
  });
  if (!r.ok) throw new Error("lockCharacter failed");
  return r.json(); // { ok, locks } or { ok:false, reason:'taken' }
}

export async function unlockCharacter(code, character) {
  const r = await fetch(`${API_BASE}/session/${code}/lock/${character}`, { method: "DELETE" });
  if (!r.ok) throw new Error("unlock failed");
  return r.json();
}
