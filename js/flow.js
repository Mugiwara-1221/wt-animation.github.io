
// js/flow.js
export function readCtx() {
  const qs = new URLSearchParams(location.search);
  const ctx = {
    session: qs.get('session') || localStorage.getItem('sessionCode') || '',
    story:   qs.get('story')   || localStorage.getItem('selectedStory') || '',
    grade:   qs.get('grade')   || localStorage.getItem('selectedGrade') || '',
    char:    qs.get('char')    || ''
  };
  if (ctx.session) localStorage.setItem('sessionCode', ctx.session);
  if (ctx.story)   localStorage.setItem('selectedStory', ctx.story);
  if (ctx.grade)   localStorage.setItem('selectedGrade', ctx.grade);
  return ctx;
}

export function nextURL(page, ctx, extra={}) {
  const u = new URL(page, location.href);
  if (ctx.session) u.searchParams.set('session', ctx.session);
  if (ctx.story)   u.searchParams.set('story', ctx.story);
  if (ctx.grade)   u.searchParams.set('grade', ctx.grade);
  if (extra.char)  u.searchParams.set('char', extra.char);
  return u.toString();
}
