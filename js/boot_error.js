window.addEventListener('error', function (e) {
  var b = document.getElementById('bootError');
  if (!b) return;
  var file = (e.filename || '').split('/').pop();
  b.textContent = 'PipeSense could not start: ' + (e.message || 'script failed to load') +
    (file ? ' (' + file + ':' + e.lineno + ')' : '');
  b.hidden = false;
}, true);
