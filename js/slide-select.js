
// js/slide-select.js — interactive slide picker (1–6) for the chosen story
import { readCtx, writeCtx, nextURL } from "./flow.js";

const grid     = document.getElementById("grid");
const emptyMsg = document.getElementById("emptyMsg");
const sub      = document.getElementById("sub");
const backBtn  = document.getElementById("backBtn");

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

// Map (kept for future flexibility; not strictly needed now)
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

// Use kebab-case folder names exactly as in your repo
const storyFolder = STORY_FOLDER_MAP.get(storyId) || storyId;

// Render six slides straight from the filesystem
renderSlides(6);

function renderSlides(count) {
  grid.innerHTML = "";
  emptyMsg.hidden = true;

  const items = [];
  for (let i = 1; i <= count; i++) {
    items.push(makeCard(i));
  }

  if (!items.length) {
    emptyMsg.hidden = false;
    return;
  }
  items.forEach(el => grid.appendChild(el));
}

function makeCard(index) {
  const card = document.createElement("div");
  card.className = "card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Choose Slide ${index}`);

  const thumb = document.createElement("div");
  thumb.className = "thumb";

  const img = document.createElement("img");
  img.alt = `Slide ${index}`;
  img.loading = "lazy";
  img.decoding = "async";

  // slide png locations + fallback
  const candidates = [
    `/stories/${storyID}/slide${index}.png`,   // primary (your repo)
    `/stories/${storyFolder}/slide${index}.png`,   // primary (your repo)
    `/stories/${storyFolder}/${index}.png`,        // fallback A (numeric at root)
    `/stories/${storyFolder}/slides/${index}.png`  // fallback B (in /slides/)
  ];

  let ci = 0;
  img.src = candidates[ci];
  img.onerror = () => {
    ci++;
    if (ci < candidates.length) {
      img.src = candidates[ci];
    } else {
      thumb.innerHTML = `<div style="font-size:2rem; opacity:.35;">${index}</div>`;
    }
  };

  thumb.appendChild(img);

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = `Slide ${index}`;

  card.append(thumb, title);

  const go = () => {
    const nextCtx = writeCtx({ ...ctx, slide: String(index) });
    location.href = nextURL("sprite-select.html", nextCtx); // ✅ goes straight to character selection
  };
  card.addEventListener("click", go);
  card.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
  });

  return card;
}

// Helpers
function toTitle(id) {
  return String(id).replace(/-/g," ").replace(/\b\w/g, m => m.toUpperCase());
}
