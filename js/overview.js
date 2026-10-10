(() => {
  'use strict';

  const ENDPOINT = 'forms/public_reports.php';
  const SESSION_KEY = 'pipesense.user';
  const CENTER = [10.6713, 122.9511];
  const REFRESH_MS = 60000;

  const TYPES = {
    interruption: { label: 'Water interruption', color: '#c9443b' },
    maintenance:  { label: 'Maintenance',        color: '#d98e04' },
    pressure:     { label: 'Low pressure',       color: '#2f78a8' },
    quality:      { label: 'Water quality',      color: '#7a5ba6' }
  };
  const STATUSES = { reported: 'Reported', scheduled: 'Scheduled', ongoing: 'Ongoing', resolved: 'Resolved' };

  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  try {
    const u = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (u && u.role) {
      const href = u.role === 'admin' ? 'admin_dashboard.html' : 'user_dashboard.html';
      $('#publicActions').innerHTML = `<a class="btn btn-accent" href="${href}">Open my dashboard</a>`;
    }
  } catch (e) { }

  const map = L.map('map', { zoomControl: true }).setView(CENTER, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  window.addEventListener('resize', () => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 300);

  const markerLayer = L.layerGroup().addTo(map);
  const markers = new Map();

  $('#legend').innerHTML = '<div class="legend-title">Report types</div>' +
    Object.values(TYPES).map((t) =>
      `<div class="legend-item"><span class="legend-swatch" style="--c:${t.color}"></span>${t.label}</div>`
    ).join('');

  const fmt = (ms) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  function timeAgo(ms) {
    const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hr ago`;
    const d = Math.round(h / 24);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }

  function schedule(r) {
    if (r.startsAt && r.endsAt) return `${fmt(r.startsAt)} to ${fmt(r.endsAt)}`;
    if (r.startsAt) return `From ${fmt(r.startsAt)}`;
    if (r.endsAt) return `Until ${fmt(r.endsAt)}`;
    return '';
  }

  function pinIcon(r) {
    const t = TYPES[r.type] || { color: '#587079' };
    return L.divIcon({
      className: 'pin-wrap',
      html: `<div class="pin is-verified st-${esc(r.status)}" style="--c:${t.color}"><span>${CHECK_SVG}</span></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });
  }

  function popupHTML(r) {
    const t = TYPES[r.type] || { label: r.type };
    const when = r.source === 'official' ? schedule(r) : '';
    return `<div class="popup-title">${esc(r.title)}</div>` +
      `<div class="popup-sub">${esc(t.label)} &middot; ${esc(r.area)} &middot; ${esc(STATUSES[r.status] || r.status)}</div>` +
      (when ? `<div class="popup-sub">${esc(when)}</div>` : '') +
      (r.desc ? `<p style="margin:8px 0 0;max-width:240px">${esc(r.desc)}</p>` : '');
  }

  function card(r) {
    const t = TYPES[r.type] || { label: r.type, color: '#587079' };
    const official = r.source === 'official';
    const when = official ? schedule(r) : '';
    return `
      <li>
        <button type="button" class="report-card" data-id="${esc(r.id)}" style="--c:${t.color}">
          <h3>${esc(r.title)}</h3>
          <div class="where">${esc(r.area)}${when ? ` &middot; ${esc(when)}` : ''}</div>
          <div class="pills">
            <span class="pill pill-status-${esc(r.status)}">${esc(STATUSES[r.status] || r.status)}</span>
            <span class="pill" style="color:${t.color}">${esc(t.label)}</span>
            ${official ? '<span class="pill pill-official">Official</span>' : '<span class="pill pill-verified">Verified</span>'}
            <span class="time-ago">${esc(timeAgo(r.createdAt))}</span>
          </div>
        </button>
      </li>`;
  }

  const emptyItem = (title, text) =>
    `<li class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p></li>`;

  let first = true;

  function render(reports) {
    const advisories = reports.filter((r) => r.source === 'official');
    const community = reports.filter((r) => r.source !== 'official');
    const ongoing = reports.filter((r) => r.status === 'ongoing').length;
    const areas = new Set(reports.map((r) => r.area)).size;

    $('#ovStats').innerHTML = [
      [advisories.length, 'Advisories'],
      [community.length, 'Reports'],
      [ongoing, 'Ongoing'],
      [areas, 'Areas']
    ].map(([n, label]) => `<div class="stat"><b>${n}</b><span>${label}</span></div>`).join('');

    $('#advCount').textContent = advisories.length ? `(${advisories.length})` : '';
    $('#repCount').textContent = community.length ? `(${community.length})` : '';

    $('#advList').innerHTML = advisories.length
      ? advisories.map(card).join('')
      : emptyItem('No advisories', 'There are no official announcements right now.');
    $('#repList').innerHTML = community.length
      ? community.map(card).join('')
      : emptyItem('No reports', 'No verified community reports right now.');

    markerLayer.clearLayers();
    markers.clear();
    reports.forEach((r) => {
      const m = L.marker([r.lat, r.lng], { icon: pinIcon(r), title: r.title, riseOnHover: true });
      m.bindPopup(popupHTML(r), { closeButton: false });
      m.addTo(markerLayer);
      markers.set(r.id, m);
    });

    if (first && reports.length) {
      map.fitBounds(L.featureGroup([...markers.values()]).getBounds().pad(0.25), { maxZoom: 15 });
    }
    first = false;
  }

  function showProblem(message) {
    const item = emptyItem('Could not load the overview', message);
    $('#ovStats').innerHTML = '';
    $('#advList').innerHTML = item;
    $('#repList').innerHTML = '';
    $('#advCount').textContent = '';
    $('#repCount').textContent = '';
  }

  let lastSignature = '';

  async function load() {
    try {
      const res = await fetch(ENDPOINT, { credentials: 'same-origin' });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch (e) { throw new Error('Unexpected reply from ' + ENDPOINT + ': ' + text.replace(/<[^>]*>/g, ' ').trim().slice(0, 140)); }
      if (data.status !== 'success') throw new Error((data.message || 'The server returned an error.') + (data.detail ? ` (${data.detail})` : ''));

      const signature = JSON.stringify(data.reports);
      if (signature !== lastSignature || first) {
        lastSignature = signature;
        render(data.reports);
      }
    } catch (err) {
      if (first) {
        showProblem(err instanceof TypeError
          ? 'Cannot reach the server. Open this page from http://localhost/... with Apache and MySQL running in Laragon.'
          : err.message);
        first = false;
      }
    }
  }

  $('#panel').addEventListener('click', (e) => {
    const btn = e.target.closest('.report-card');
    if (!btn) return;
    const m = markers.get(btn.dataset.id);
    if (!m) return;
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 16), { duration: 0.7 });
    map.once('moveend', () => m.openPopup());
  });

  load();
  setInterval(load, REFRESH_MS);
})();
