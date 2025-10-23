
// js/flow.js

// Read context from URL first, then fall back to localStorage.
export function readCtx() {
  const qs = new URLSearchParams(location.search);
  const ctx = {
    session: qs.get("session") || localStorage.getItem("sessionCode") || "",
    story:   qs.get("story")   || localStorage.getItem("selectedStory") || "",
    grade:   qs.get("grade")   || localStorage.getItem("selectedGrade") || "",
    slide:   qs.get("slide")   || localStorage.getItem("selectedSlide") || "",
    char:    qs.get("char")    || ""
  };

  // Persist any URL-provided values so they survive navigation.
  if (qs.get("session")) localStorage.setItem("sessionCode", ctx.session);
  if (qs.get("story"))   localStorage.setItem("selectedStory", ctx.story);
  if (qs.get("grade"))   localStorage.setItem("selectedGrade", ctx.grade);
  if (qs.get("slide"))   localStorage.setItem("selectedSlide", ctx.slide);

  // if selected slide is presented, keep ctx array, nonpersisting globally
  const slidesParam = qs.get("slides");
  if (slidesParam) ctx.slides = parseSlides(slidesParam);

  return ctx;
}

// Write/merge context, persist to localStorage, and return the merged ctx.
export function writeCtx(partial) {
  const current = readCtx();
  const next = { ...current, ...partial };

  if (next.session != null) localStorage.setItem("sessionCode", next.session);
  if (next.story   != null) localStorage.setItem("selectedStory", next.story);
  if (next.grade   != null) localStorage.setItem("selectedGrade", next.grade);
  if (next.slide   != null) localStorage.setItem("selectedSlide", next.slide);

  // Do NOT persist next.slides here; slide sets are scoped per session/story
  // and are saved by slide-select into its own namespaced key.

  return next;
}

export function nextURL(page, ctx = {}, extra = {}) {
  const u = new URL(page, location.href);
  if (ctx.session) u.searchParams.set("session", ctx.session);
  if (ctx.story)   u.searchParams.set("story", ctx.story);
  if (ctx.slide)   u.searchParams.set("slide", ctx.slide);

  if (extra.includeGrade && ctx.grade) {
    u.searchParams.set("grade", ctx.grade);
  }
  if (extra.char)  u.searchParams.set("char", extra.char);

  // NEW: optionally carry the slides list forward
  if (extra.includeSlides) {
    const slides = Array.isArray(ctx.slides) ? ctx.slides : getSelectedSlides(ctx);
    if (slides?.length) u.searchParams.set("slides", slides.join(","));
  }

  return u.toString();
}

// ---------- NEW: slide selection utilities ----------
export function parseSlides(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(n => +n).filter(Boolean).sort((a,b)=>a-b);
  return String(value)
    .split(",")
    .map(s => +s.trim())
    .filter(Boolean)
    .sort((a,b)=>a-b);
}

export function getSelectedSlides(ctx) {
  // priority: ctx.slides (already parsed) → ?slides= → namespaced localStorage
  if (Array.isArray(ctx?.slides) && ctx.slides.length) return parseSlides(ctx.slides);

  const qs = new URLSearchParams(location.search);
  const fromQ = parseSlides(qs.get("slides"));
  if (fromQ.length) return fromQ;

  try {
    const key = `slideSelect:${ctx.session}:${ctx.story}`;
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    return parseSlides(saved);
  } catch {
    return [];
  }
}

export function nextInSelection(current, slides) {
  const list = parseSlides(slides);
  if (!list.length) return +current || 1;
  const i = list.indexOf(+current);
  return i < 0 ? list[0] : list[(i + 1) % list.length];
}

export function prevInSelection(current, slides) {
  const list = parseSlides(slides);
  if (!list.length) return +current || 1;
  const i = list.indexOf(+current);
  return i < 0 ? list[0] : list[(i - 1 + list.length) % list.length];
}

// ---------- NEW: completion tracking per session/story ----------
function completedKey(ctx) {
  return `completed:${ctx.session}:${ctx.story}`;
}

export function markCompleted(ctx, slideNo) {
  const key = completedKey(ctx);
  const set = new Set(JSON.parse(localStorage.getItem(key) || "[]"));
  set.add(+slideNo);
  localStorage.setItem(key, JSON.stringify([...set].sort((a,b)=>a-b)));
}

export function getCompleted(ctx) {
  try { return new Set(JSON.parse(localStorage.getItem(completedKey(ctx)) || "[]")); }
  catch { return new Set(); }
}

export function nextUnfinished(ctx, slides) {
  const list = parseSlides(slides);
  const done = getCompleted(ctx);
  for (const s of list) if (!done.has(+s)) return s;
  return null; // all done
}