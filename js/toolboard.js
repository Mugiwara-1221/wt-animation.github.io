
// js/toolboard.js shut up just testing
(function () {
  const q = (s, r=document) => r.querySelector(s);
  const qa = (s, r=document) => Array.from(r.querySelectorAll(s));

  const colorInput = q('.pick-color');
  const swatch = q('.color-tool .swatch');
  const btnBrush = q('#btnBrush');
  const btnEraser = q('#btnEraser');
  const btnSmudge = q('#btnSmudge');
  const brushMenu = q('#brushMenu');
  const saveBtn = q('#saveBtn');
  const saveOptions = q('#saveOptions');

  // keep swatch in sync with input
  const syncSwatch = () => { if (swatch && colorInput) swatch.style.background = colorInput.value; };
  colorInput?.addEventListener('input', syncSwatch);
  colorInput?.addEventListener('change', syncSwatch);
  syncSwatch();

  // tool activation style
  function activate(btn){
    qa('#toolboard .tool.icon').forEach(b => b.classList.remove('active'));
    btn?.classList.add('active');
  }

  // Brush icon -> select draw tool + open brush menu (also shows sliders by design)
  btnBrush?.addEventListener('click', (e) => {
    window.setTool?.('draw');      // use your existing setter
    activate(btnBrush);
    toggleMenu(true, e.currentTarget);
  });

  // Eraser
  btnEraser?.addEventListener('click', () => {
    window.setTool?.('erase');
    activate(btnEraser);
    toggleMenu(false);
  });

  // Smudge behaves like a “soft” brush style; still uses draw tool
  btnSmudge?.addEventListener('click', (e) => {
    window.setTool?.('draw');
    activate(btnSmudge);
    // mark brush style for your app if you want to differentiate
    document.documentElement.dataset.brushStyle = 'soft';
    toggleMenu(false);
  });

  // Brush type choices (UI only; record selection so you can read it if needed)
  qa('.brush-choice').forEach(b => {
    b.addEventListener('click', () => {
      document.documentElement.dataset.brushStyle = b.dataset.brush; // 'basic' | 'pencil' | 'marker'
      toggleMenu(false);
    });
  });

  // Save dropdown
  saveBtn?.addEventListener('click', () => {
    const open = saveOptions.classList.toggle('hidden') === false;
    saveBtn.setAttribute('aria-expanded', String(open));
  });

  // close popovers when clicking outside
  document.addEventListener('click', (e) => {
    if (!brushMenu.contains(e.target) && e.target !== btnBrush) toggleMenu(false);
    if (!saveOptions.contains(e.target) && e.target !== saveBtn) {
      saveOptions.classList.add('hidden');
      saveBtn.setAttribute('aria-expanded', 'false');
    }
  });

  function toggleMenu(show, anchor){
    if (!brushMenu) return;
    if (show) {
      // place menu next to the brush button
      const r = anchor.getBoundingClientRect();
      brushMenu.style.top = Math.round(r.top + window.scrollY) + 'px';
      brushMenu.style.left = Math.round(r.right + 12 + window.scrollX) + 'px';
      brushMenu.classList.remove('hidden');
      btnBrush?.setAttribute('aria-expanded', 'true');
    } else {
      brushMenu.classList.add('hidden');
      btnBrush?.setAttribute('aria-expanded', 'false');
    }
  }
})();
