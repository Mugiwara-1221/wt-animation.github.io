// js/slide-select.js — MULTI-SELECT slide picker (1–6) for the chosen story
import { readCtx, writeCtx, nextURL } from "./flow.js";

const grid       = document.getElementById("grid");
const emptyMsg   = document.getElementById("emptyMsg");
const sub        = document.getElementById("sub");
const backBtn    = document.getElementById("backBtn");

// New toolbar buttons (added in slide-select.html)
const btnSelectAll = document.getElementById("btnSelectAll");
const btnClearAll  = document.getElementById("btnClearAll");
const btnContinue  = document.getElementById("btnContinue");

const ctx = readCtx();
const storyId = (ctx.story || "").toLowerCase();

if (!ctx.session) { location.replace("index.html"); throw 0; }
if (!storyId)     { location.replace("story-select.html"); throw 0; }

// Show context: session + story
sub.textContent = `Session: ${ctx.session}  •  Story: ${toTitle(storyId)}`;

// Back to stories
backBtn.addEventListener("click", () => {
  location.href = nextURL("story-select.html", ctx);
});

// Map (kept for future flexibility)
const STORY_FOLDER_MAP = new Map([
  ["tortoise-hare",      "tortoise-hare"],
  ["fisherman",          "fisherman"],
  ["prince-pauper",      "prince-pauper"],
  ["boy-who-cried-wolf", "boy-who-cried-wolf"],
  ["lion-mouse",         "lion-mouse"],
  ["little-ducks",       "little-ducks"],
  ["old-mcdonald",       "old-mcdonald"],
  ["frog-prince",        "frog-prince"],
  ["goldilocks-bears",   "goldilocks-bears"]
]);

const storyFolder = STORY_FOLDER_MAP.get(storyId) || storyId;

// --- Selection state (persist per session+story) ---
const SEL_KEY = `slideSelect:${ctx.session}:${storyId}`;
const initial = safeParse(localStorage.getItem(SEL_KEY)) || [];
const selected = new Set(
  Array.isArray(ctx.slides) && ctx.slides.length ? ctx.slides :
  Array.isArray(initial) ? initial : []
);

// render 6 slides
renderSlides(6);
updateContinueButton();

// Toolbar actions
btnSelectAll?.addEventListener("click", () => {
  for (let i = 1; i <= 6; i++) selected.add(i);
  syncUIFromSelection();
  updateContinueButton();
  persistSelection();
});

btnClearAll?.addEventListener("click", () => {
  selected.clear();
  syncUIFromSelection();
  updateContinueButton();
  persistSelection();
});

btnContinue?.addEventListener("click", () => {
  const slides = Array.from(selected).sort((a,b)=>a-b);
  if (!slides.length) return;

  // keep first selected as ctx.slide for backward-compat
  const nextCtx = writeCtx({ 
    ...ctx, 
    slides, 
    slide: slides[0] 
  });

  // persist locally too
  localStorage.setItem(SEL_KEY, JSON.stringify(slides));
  localStorage.setItem("selectedSlides", JSON.stringify(slides));
  localStorage.setItem("selectedIndex", String(slides[0]));

  // pass slides list in query (optional, handy for direct linking)
  const url = new URL(nextURL("sprite-select.html", nextCtx), location.href);
  url.searchParams.set("slides", slides.join(","));
  location.href = url.toString();
});

// ---------------- helpers ----------------
function renderSlides(count) {
  grid.innerHTML = "";
  emptyMsg.hidden = true;

  const items = [];
  for (let i = 1; i <= count; i++) items.push(makeCard(i));
  if (!items.length) { emptyMsg.hidden = false; return; }
  items.forEach(el => grid.appendChild(el));

  // reflect persisted selection
  syncUIFromSelection();
}

function makeCard(index) {
  const card = document.createElement("div");
  card.className = "card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-pressed", "false");
  card.setAttribute("aria-label", `Select Page ${index}`);

  // tick overlay (styled in CSS with .tick)
  const tick = document.createElement("div");
  tick.className = "tick";
  card.appendChild(tick);

  const thumb = document.createElement("div");
  thumb.className = "thumb";

  const img = document.createElement("img");
  img.alt = `Page ${index}`;
  img.loading = "lazy";
  img.decoding = "async";

  // relative paths so GH Pages subpaths work
  const candidates = [
    `stories/${storyFolder}/slide${index}_with_characters.png`,
    `./stories/${storyFolder}/slide${index}_with_characters.png`,
    `stories/${storyFolder}/${index}_with_characters.png`,
    `stories/${storyFolder}/slides/${index}_with_characters.png`
  ];
  let ci = 0;
  img.src = candidates[ci];
  img.onerror = () => {
    ci++;
    if (ci < candidates.length) img.src = candidates[ci];
    else thumb.innerHTML = `<div style="font-size:8rem; opacity:.35;">${index}</div>`;
  };
  thumb.appendChild(img);

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = `Page ${index}`;

  card.append(thumb, title);

  const toggle = () => {
    if (selected.has(index)) selected.delete(index);
    else selected.add(index);
    // reflect in UI + a11y
    card.classList.toggle("selected", selected.has(index));
    card.setAttribute("aria-pressed", String(selected.has(index)));
    updateContinueButton();
    persistSelection();
  };

  card.addEventListener("click", toggle);
  card.addEventListener("keydown", e => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
  });

  // stash index for sync pass
  card.dataset.index = String(index);
  return card;
}

function syncUIFromSelection(){
  document.querySelectorAll(".card").forEach(el => {
    const i = Number(el.dataset.index);
    const on = selected.has(i);
    el.classList.toggle("selected", on);
    el.setAttribute("aria-pressed", String(on));
  });
}

function updateContinueButton(){
  const enabled = selected.size > 0;
  btnContinue.disabled = !enabled;
}

function persistSelection(){
  localStorage.setItem(SEL_KEY, JSON.stringify(Array.from(selected).sort((a,b)=>a-b)));
}

function toTitle(id) {
  return String(id).replace(/-/g," ").replace(/\b\w/g, m => m.toUpperCase());
}
function safeParse(s){
  try{ return JSON.parse(s); }catch{ return null; }
}
