// js/azure-api.js

// In Azure Static Web Apps, API routes live under /api by default
const API_BASE = "/api";

/** -------- Sessions -------- **/
export async function createSession(maxSeats = 6) {
  const r = await fetch(`${API_BASE}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxSeats }),
  });
  if (!r.ok) throw new Error("createSession failed");
  return r.json(); // e.g. { code: "123456" }
}

export async function getSession(code) {
  const r = await fetch(`${API_BASE}/session/${code}`);
  if (!r.ok) throw new Error("getSession failed");
  return r.json(); // e.g. { status:"active", locks:{...} }
}

/** -------- Locks -------- **/
export async function lockCharacter(code, character, token) {
  const r = await fetch(`${API_BASE}/session/${code}/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ character, token }),
  });
  if (!r.ok) throw new Error("lockCharacter failed");
  return r.json(); // e.g. { ok:true, locks:{...} } or { ok:false, reason:"taken" }
}

export async function unlockCharacter(code, character) {
  const r = await fetch(`${API_BASE}/session/${code}/lock/${character}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error("unlock failed");
  return r.json();
}

/** -------- Submissions (NEW) -------- **/
export async function submitDrawing(code, character, dataURL, userId) {
  // Choose the route shape that matches your backend. This one aligns
  // with your other session-scoped routes like /session/{code}/lock
  const r = await fetch(`${API_BASE}/session/${code}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ character, dataURL, userId }),
  });
  if (!r.ok) throw new Error("submitDrawing failed");
  return r.json(); // e.g. { ok:true }
}

export async function getSubmissions(code) {
  const r = await fetch(`${API_BASE}/session/${code}/submissions`, {
    method: "GET",
  });
  if (!r.ok) throw new Error("getSubmissions failed");
  return r.json(); // e.g. { items:[...] }
}

async function loadProducts() {
  try {
    const res = await fetch('/data-api/rest/Products');
    const data = await res.json();
    console.log(data);

    const list = document.getElementById('productsList');
    list.innerHTML = '';
    (data.value || data).forEach(item => {
      const li = document.createElement('li');
      li.textContent = `${item.id}: ${item.name} — $${item.price}`;
      list.appendChild(li);
    });
  } catch (err) {
    console.error('Error loading products:', err);
  }
}

window.addEventListener('DOMContentLoaded', loadProducts);

