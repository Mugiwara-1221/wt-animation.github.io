
// js/slide-select.js — minimal, story-aware slide picker (1–6)

// Assumes flow.js exposes readCtx(), writeCtx(), and nextURL()
import { readCtx, writeCtx, nextURL } from "./flow.js";

const NUM_SLIDES_DEFAULT = 6;

// Map dashed story IDs -> folder names (extend as you add stories)
const STORY_FOLDER_MAP = new Map([
  ["tortoise-hare", "tortoise_and_the_hare"],
  ["lion-mouse",    "lion_and_the_mouse"],
  // add more as needed:
  // ["little-ducks", "little_ducks"],
]);

function resolveStoryFolder(id) {
  const dash = String(id || "").replace(/_/g, "-");
  return STORY_FOLDER_MAP.get(dash) || dash;
}

// ---------- Boot ----------
const grid      = document.getElementById("grid");
const emptyMsg  = document.getElementById("emptyMsg");
const backBtn   = document.getElementById("backBtn");
const storyTag  = document.getElementById("storyTag");

const qs        = new URLSearchParams(location.search);
const ctx       = readCtx();
const storyId   = (qs.get("story") || ctx.story || "").toLowerCase().replace(/_/g, "-");

// Guard: need a story first
if (!storyId) {
  // go pick a story
  location.replace(nextURL("story-select.html", ctx));
  throw new Error("No story selected.");
}

// Show which story we're in
storyTag.textContent = storyId;

// Allow user to go back to story list
backBtn.addEventListener("click", () => {
  location.href = nextURL("story-select.html", ctx);
});

// Try to read slide metadata if present (stories/<folder>/slides.json)
const storyFolder = resolveStoryFolder(storyId);
const slidesJsonURL = `/stories/${storyFolder}/slides.json`;

let slideMeta = null;
tryFetchJSON(slidesJsonURL).then(meta => {
  slideMeta = Array.isArray(meta?.slides) ? meta.slides : null;
  const count = Number.isInteger(meta?.count) ? meta.count : NUM_SLIDES_DEFAULT;
  renderSlides(count, slideMeta);
}).catch(() => {
  renderSlides(NUM_SLIDES_DEFAULT, null);
});

// ---------- Rendering ----------
function renderSlides(count, meta) {
  grid.innerHTML = "";
  emptyMsg.hidden = true;

  const items = [];
  for (let i = 1; i <= count; i++) {
    const title = meta?.[i - 1]?.title || `Slide ${i}`;
    const src   = `/stories/${storyFolder}/slides/${i}.png`;
    items.push(makeSlideCard(i, title, src));
  }

  if (!items.length) {
    emptyMsg.hidden = false;
    return;
  }
  items.forEach(el => grid.appendChild(el));
}

function makeSlideCard(index, title, src) {
  const card = el("div", { class: "card", role: "button", tabIndex: 0, "data-index": index, "aria-label": `Choose ${title}` });

  const thumb = el("div", { class: "thumb" });
  const img   = el("img", { alt: title, loading: "lazy", decoding: "async" });

  // Load with graceful fallback if 404
  img.src = src;
  img.addEventListener("error", () => {
    // fallback: simple number placeholder
    thumb.innerHTML = `<div style="font-size:2.5rem; opacity:.35; user-select:none;">${index}</div>`;
  });

  thumb.appendChild(img);

  const meta = el("div", { class: "meta" });
  meta.appendChild(el("div", { class: "title" }, title));
  meta.appendChild(el("div", { class: "num" }, `#${index}`));

  card.append(thumb, meta);

  // Click/Enter triggers navigation to character select (slide-aware)
  const go = () => selectSlide(index);
  card.addEventListener("click", go);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
  });

  return card;
}

// ---------- Actions ----------
function selectSlide(index) {
  const nextCtx = { ...ctx, story: storyId, slide: index };
  writeCtx(nextCtx);
  location.href = nextURL("sprite-select.html", nextCtx);
}

// ---------- Utils ----------
function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  if (text != null) n.textContent = String(text);
  return n;
}

async function tryFetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}
