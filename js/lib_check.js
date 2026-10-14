(function () {
  var LIBS = {
    leaflet: { label: 'Leaflet', ok: function () { return !!window.L; } },
    cluster: { label: 'marker clustering', ok: function () { return !!(window.L && L.markerClusterGroup); } },
    jquery: { label: 'jQuery', ok: function () { return !!window.jQuery; } },
    swal: { label: 'SweetAlert2', ok: function () { return !!window.Swal; } }
  };

  var need = document.currentScript.getAttribute('data-need').split(',');
  var allLoaded = need.every(function (key) { return LIBS[key].ok(); });
  if (allLoaded) return;

  var names = need.map(function (key) { return LIBS[key].label; });
  var list = names.length > 1
    ? names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1]
    : names[0];

  var b = document.getElementById('bootError');
  if (!b) return;
  b.textContent = 'A required library (' + list + ') did not load. Check your internet connection and reload.';
  b.hidden = false;
})();
