function pipesenseBanner(html) {
  var b = document.createElement('div');
  b.className = 'boot-error';
  b.setAttribute('role', 'alert');
  b.innerHTML = html;
  document.body.insertBefore(b, document.body.firstChild);
}

window.addEventListener('error', function (e) {
  var file = (e.filename || '').split('/').pop();
  pipesenseBanner('Script error: ' + (e.message || 'unknown') + (file ? ' (' + file + ':' + e.lineno + ')' : ''));
}, true);
