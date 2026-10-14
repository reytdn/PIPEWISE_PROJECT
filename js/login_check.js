if (!window.__pipesenseLoginReady) {
  pipesenseBanner('<b>login.js</b> did not load, so the buttons cannot work. It must be at <b>js/login.js</b> (next to login.html), then press Ctrl+F5.');
}
if (!getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()) {
  pipesenseBanner('<b>base.css</b> did not load. It must be at <b>css/base.css</b>, then press Ctrl+F5.');
}
