
// js/story-select.js — show all stories by default; filter by grade; use manifest if available
import { readCtx, writeCtx, nextURL } from "./flow.js";

const API_BASE = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
  ? 'http://127.0.0.1:8000'
  : 'https://wt-animation-github-io.onrender.com';

const WS_BASE = API_BASE.replace(/^http/, "ws");

const sid = localStorage.getItem("sessionCode");
const userid = localStorage.getItem("memberId");
const ws = new WebSocket(`${WS_BASE}/ws/${sid}`);
ws.onopen = () => {
  console.log("Connected to session", sid);
};
ws.onmessage = (event) => {
  console.log("Message received:", event.data);
  try {
    const data = JSON.parse(event.data);
    if (data.type === "system") {
      showMessage(data.message);
    }
    if (data.type === "user_list") {
      // optional: update a user list UI
    }
  } catch {
    // fallback if it's plain text
    showMessage(event.data);
  }
};
function showMessage(msg) {
  const popup = document.createElement("div");
  console.log("Showing message:", msg);
  popup.textContent = msg;
  popup.className = "popup-message";
  document.body.appendChild(popup);
  // Trigger fade-in
  requestAnimationFrame(() => {
    popup.classList.add("visible");
  });
  // Remove after 3 seconds
  setTimeout(() => {
    popup.classList.remove("visible");
    popup.addEventListener("transitionend", () => popup.remove());
  }, 3000);
}


// Try common locations for the manifest (root & relative)
const MANIFEST_CANDIDATES = [
  //"/stories/config/manifest.json",
  //"./stories/config/manifest.json",
  "stories/config/manifest.json"
];

// ---- DOM ----
const grid       = document.getElementById("storyGrid");
const emptyMsg   = document.getElementById("emptyMsg");
const sessionEl  = document.getElementById("sessionInfo");
const checkboxes = Array.from(document.querySelectorAll('input[name="grade"]'));

// ---- Session guard ----
const ctx = readCtx();
if (!ctx.session) { location.replace("index.html"); throw 0; }
sessionEl.textContent = `Session: ${ctx.session} User: ${userid}`;

/* ---------- RESET grade on page load ----------
   Always show all stories on refresh:
   - Remove ?grade= from the URL if present
   - Clear any persisted selectedGrade
*/
{
  const url = new URL(location.href);
  if (url.searchParams.has("grade")) {
    url.searchParams.delete("grade");
    history.replaceState({}, "", url);
  }
  localStorage.removeItem("selectedGrade");
}

// ---- Default stories (fallback) ----
const FALLBACK_STORIES = [
  { id:"tortoise-hare",      title:"The Tortoise and the Hare",          grades:["TK-2"],                thumb:"images/backgrounds/tortoise-hare/background.png" },
  { id:"fisherman",          title:"The Fisherman",                      grades:["TK-2","G.3-4"],        thumb:"images/backgrounds/tortoise-hare/background.png" },
  { id:"prince-pauper",      title:"Prince Pauper",                      grades:["G.3-4","G.5-8"],       thumb:"images/backgrounds/tortoise-hare/background.png" },
  { id:"boy-who-cried-wolf", title:"The Boy Who Cried Wolf",             grades:["G.3-4"],               thumb:"images/backgrounds/tortoise-hare/background.png" },
  { id:"lion-mouse",         title:"The Lion and the Mouse",             grades:["TK-2","G.3-4"],        thumb:"images/backgrounds/lion-mouse/background.png" },
  { id:"little-ducks",       title:"Five Little Ducks",                  grades:["TK-2"],                thumb:"images/backgrounds/little-ducks/background.png" },
  { id:"old-mcdonald",       title:"Old McDonald",                       grades:["TK-2"],                thumb:"images/backgrounds/tortoise-hare/background.png" },
  { id:"frog-prince",        title:"The Frog Prince",                    grades:["G.3-4","G.5-8"],       thumb:"images/backgrounds/tortoise-hare/background.png" },
  { id:"goldilocks-bears",   title:"Goldilocks and the Three Bears",     grades:["TK-2","G.3-4"],        thumb:"images/backgrounds/tortoise-hare/background.png" }
];

let stories = [...FALLBACK_STORIES];

// ---- Init ----
await tryLoadManifest();     // silently overrides `stories` if found
bindFilters();
render();

// ---------------- functions ----------------
async function tryLoadManifest() {
  for (const url of MANIFEST_CANDIDATES) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data?.stories)) continue;

      stories = data.stories.map(s => ({
        id: s.id,
        title: s.title || toTitle(s.id),
        grades: Array.isArray(s.grades) ? s.grades : [],
        thumb: s.thumb || `/stories/${s.id.replace(/-/g, "_")}/background.png`
      }));
      console.info("[story-select] Using manifest:", url);
      return;
    } catch (e) {
      // try next path
    }
  }
  console.warn("[story-select] Manifest not found; using fallback list.");
}

function bindFilters() {
  // Do NOT auto-restore any grade; start with all stories visible.

  checkboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      const selected = new Set(checkboxes.filter(x => x.checked).map(x => x.value));
      const last = checkboxes.find(x => x.checked)?.value || null;
      writeCtx({ ...readCtx(), grade: last || undefined });
      render(selected);
    });
  });
}

function render(selected = new Set(checkboxes.filter(x => x.checked).map(x => x.value))) {
  grid.innerHTML = "";
  emptyMsg.hidden = true;

  // No grades selected -> show all
  const visible = (selected.size === 0)
    ? stories
    : stories.filter(s => s.grades?.some(g => selected.has(g)));

  if (visible.length === 0) {
    emptyMsg.hidden = false;
    return;
  }

  for (const s of visible) {
    grid.appendChild(makeCard(s));
  }
}

function makeCard(s) {
  const card = document.createElement("div");
  card.className = "card";
  card.setAttribute("role","button");
  card.setAttribute("aria-label", `Choose ${s.title}`);

  const thumb = document.createElement("div");
  thumb.className = "thumb";
  const img = document.createElement("img");
  img.alt = s.title;
  img.loading = "lazy";
  img.decoding = "async";
  img.src = s.thumb;
  img.onerror = () => {
    thumb.innerHTML = `<div style="padding:10px; text-align:center;">${s.title}</div>`;
  };
  thumb.appendChild(img);

  const title = document.createElement("div");
  title.className = `title story-${s.id}`;
  title.textContent = s.title;

  card.append(thumb, title);

  const go = () => {
    const nextCtx = { ...readCtx(), story: s.id };   // keep latest ctx
    writeCtx(nextCtx);
    location.href = nextURL("slide-select.html", nextCtx);
  };
  card.addEventListener("click", go);
  card.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
  });

  return card;
}

function toTitle(id) {
  return String(id).replace(/-/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}
