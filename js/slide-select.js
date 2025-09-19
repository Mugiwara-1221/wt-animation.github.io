
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

// Map story ids (kebab) -> folder names (snake) if they differ
const STORY_FOLDER_MAP = new Map([
  ["tortoise-hare",      "tortoise_and_the_hare"],
  ["fisherman",          "fisherman"],
  ["prince-pauper",      "prince_pauper"],
  ["boy-who-cried-wolf", "boy_who_cried_wolf"],
  ["lion-mouse",         "lion_and_the_mouse"],
  ["little-ducks",       "little_ducks"],
  ["old-mcdonald",       "old_mcdonald"],
  ["frog-prince",        "frog_prince"],
  ["goldilocks-bears",   "goldilocks_three_bears"]
]);

const storyFolder = STORY_FOLDER_MAP.get(storyId) || storyId.replace(/-/g, "_");

// Render six slides straight from the filesystem
renderSlides(6);

function renderSlides(count) {
  grid.innerHTML = "";
  emptyMsg.hidden = true;

  const items = [];
  for (let i = 1; i <= count; i++) {
    const src = `/stories/${storyFolder}/${i}.png`;
    items.push(makeCard(i, src));
  }

  if (!items.length) {
    emptyMsg.hidden = false;
    return;
  }
  items.forEach(el => grid.appendChild(el));
}

function makeCard(index, src) {
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
  img.src = src;
  img.onerror = () => {
    thumb.innerHTML = `<div style="font-size:2rem; opacity:.35;">${index}</div>`;
  };
  thumb.appendChild(img);

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = `Slide ${index}`;

  card.append(thumb, title);

  const go = () => {
    const nextCtx = writeCtx({ ...ctx, slide: String(index) });
    location.href = nextURL("sprite-select.html", nextCtx);
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
