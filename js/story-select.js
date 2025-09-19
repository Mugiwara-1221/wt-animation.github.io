
// js/story-select.js — story chooser with grade filters
import { readCtx, writeCtx, nextURL } from "./flow.js";

const MANIFEST_URL = "/stories/config/manifest.json"; // manifest location

const grid = document.getElementById("storyGrid");
const emptyMsg = document.getElementById("emptyMsg");
const sessionInfo = document.getElementById("sessionInfo");

// -------------------- Session Guard --------------------
const ctx = readCtx();
if (!ctx.session) {
  location.replace("index.html");
  throw 0;
}
sessionInfo.textContent = `Session: ${ctx.session}`;

// -------------------- Grade Filters --------------------
const checkboxes = Array.from(document.querySelectorAll('input[name="grade"]'));
let activeGrades = new Set();

// restore last grade from ctx
if (ctx.grade) {
  const cb = checkboxes.find(c => c.value === ctx.grade);
  if (cb) {
    cb.checked = true;
    activeGrades.add(ctx.grade);
  }
}

// -------------------- Load Stories --------------------
let stories = [];
init();

async function init() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("manifest not found");
    const data = await res.json();

    stories = Array.isArray(data?.stories) ? data.stories.map(s => ({
      id: s.id,
      title: s.title || toTitle(s.id),
      grades: Array.isArray(s.grades) ? s.grades : [],
      thumb: s.thumb || autoThumb(s.id)
    })) : [];
  } catch (e) {
    console.error("Failed to load manifest:", e);
    stories = [];
  }

  bindFilters();
  render();
}

// -------------------- Filters --------------------
function bindFilters() {
  checkboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) activeGrades.add(cb.value);
      else activeGrades.delete(cb.value);

      // persist latest grade into ctx
      const last = cb.checked ? cb.value : Array.from(activeGrades)[0] || null;
      writeCtx({ ...readCtx(), grade: last || undefined });

      render();
    });
  });
}

function matchesGrades(story) {
  if (activeGrades.size === 0) return true; // nothing selected = show all
  return story.grades?.some(g => activeGrades.has(g));
}

// -------------------- Render --------------------
function render() {
  grid.innerHTML = "";
  emptyMsg.hidden = true;

  const visible = stories.filter(matchesGrades);
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
  card.setAttribute("role", "button");
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
  title.className = "title";
  title.textContent = s.title;

  card.append(thumb, title);

  const go = () => {
    const nextCtx = { ...readCtx(), story: s.id };
    writeCtx(nextCtx);
    location.href = nextURL("slide-select.html", nextCtx);
  };
  card.addEventListener("click", go);
  card.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
  });

  return card;
}

// -------------------- Helpers --------------------
function toTitle(id) {
  return String(id).replace(/-/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}
function autoThumb(id) {
  return `/stories/${id.replace(/-/g, "_")}/cover.png`;
}
