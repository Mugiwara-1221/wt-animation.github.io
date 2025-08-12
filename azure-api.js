// azure-api.js
import { DefaultAzureCredential } from "https://cdn.skypack.dev/@azure/identity";
import { SecretClient } from "https://cdn.skypack.dev/@azure/keyvault-secrets";

const API_BASE = "https://windtreetechnology.documents.azure.com:443/"; // or leave empty if using anonymous

async function api(path, options = {}) {
  const url = `${API_BASE}${path}${API_KEY ? `?code=${API_KEY}` : ""}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

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
  api(`/submissions/${sessionCode}`, { method: "GET" });
