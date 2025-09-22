
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

  return next;
}

// Build a URL to another page, including known context and any extras.
// NOTE: grade is NOT included unless extra.includeGrade === true
export function nextURL(page, ctx = {}, extra = {}) {
  const u = new URL(page, location.href);
  if (ctx.session) u.searchParams.set("session", ctx.session);
  if (ctx.story)   u.searchParams.set("story", ctx.story);
  if (ctx.slide)   u.searchParams.set("slide", ctx.slide);

  if (extra.includeGrade && ctx.grade) {
    u.searchParams.set("grade", ctx.grade);
  }
  if (extra.char)  u.searchParams.set("char", extra.char);

  return u.toString();
}
