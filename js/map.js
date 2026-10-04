/* ==========================================================
   PipeSense: map.js
   Leaflet map, report tagging, auth, CRUD, filters, insights.
   Data is kept in localStorage (simulation only, no backend).
   ========================================================== */
(() => {
  'use strict';

  /* ---------------- Config ---------------- */

  const CONFIG = {
    storageKey: 'pipesense.v3',      // new key = starts with no reports
    sessionKey: 'pipesense.user',    // JSON of the logged-in account, set by login.js
    center: [10.6713, 122.9511], // Bacolod City
    zoom: 13,
    geofenceRadius: 1000,        // meters around the resident's home
    homeKey: 'pipesense.home.',  // + user id: the home each resident chose
    // Home marker picture. anchor = the point of the image that sits on the home spot:
    // [22, 44] = bottom middle (pin shaped image). Use [22, 22] for a round image.
    homeIcon: { url: 'assets/images/HOMEMARKER.png', size: [44, 44], anchor: [22, 44] },
    geoKey: 'pipesense.geo.v3',  // cached GeoSearch results (one lookup per barangay)
    welcomeKey: 'pipesense.welcomed', // user id that already saw the welcome popup (cleared at login/logout)
    // GeoSearch is limited to Bacolod City: west,north,east,south
    cityViewbox: '122.84,10.80,123.04,10.55',
    recurringThreshold: 3        // reports in one barangay before it is flagged
  };

  const TYPES = {
    interruption: { label: 'Water interruption', color: '#c9443b' },
    maintenance:  { label: 'Maintenance',        color: '#d98e04' },
    pressure:     { label: 'Low pressure',       color: '#2f78a8' },
    quality:      { label: 'Water quality',      color: '#7a5ba6' }
  };

  const STATUSES = {
    reported:  'Reported',
    scheduled: 'Scheduled',
    ongoing:   'Ongoing',
    resolved:  'Resolved'
  };

  // All 61 barangays of Bacolod City. Coordinates are APPROXIMATE centers
  // (simulation only). Barangays 1 to 41 are the downtown core, so they are
  // spread on a small grid around the city center.
  const NAMED_AREAS = [
    { name: 'Alangilan',        lat: 10.6650, lng: 122.9610 },
    { name: 'Alijis',           lat: 10.6420, lng: 122.9600 },
    { name: 'Banago',           lat: 10.6920, lng: 122.9390 },
    { name: 'Bata',             lat: 10.6860, lng: 122.9490 },
    { name: 'Cabug',            lat: 10.7170, lng: 122.9700 },
    { name: 'Estefania',        lat: 10.6610, lng: 122.9560 },
    { name: 'Felisa',           lat: 10.6870, lng: 122.9610 },
    { name: 'Granada',          lat: 10.6780, lng: 122.9660 },
    { name: 'Handumanan',       lat: 10.6330, lng: 122.9540 },
    { name: 'Mandalagan',       lat: 10.6960, lng: 122.9570 },
    { name: 'Mansilingan',      lat: 10.6330, lng: 122.9380 },
    { name: 'Montevista',       lat: 10.7350, lng: 122.9680 },
    { name: 'Pahanocoy',        lat: 10.6500, lng: 122.9220 },
    { name: 'Punta Taytay',     lat: 10.6960, lng: 122.9270 },
    { name: 'Singcang-Airport', lat: 10.6830, lng: 122.9600 },
    { name: 'Sum-ag',           lat: 10.6260, lng: 122.9210 },
    { name: 'Taculing',         lat: 10.6560, lng: 122.9530 },
    { name: 'Tangub',           lat: 10.6540, lng: 122.9340 },
    { name: 'Villamonte',       lat: 10.6810, lng: 122.9560 },
    { name: 'Vista Alegre',     lat: 10.6760, lng: 122.9370 }
  ];

  const NUMBERED_AREAS = Array.from({ length: 41 }, (_, i) => ({
    name: `Barangay ${i + 1}`,
    lat: +(10.6713 + (Math.floor(i / 7) - 3) * 0.0025).toFixed(5),
    lng: +(122.9511 + ((i % 7) - 3) * 0.0025).toFixed(5)
  }));

  // Same order as the sign-up list
  const AREAS = [
    ...NAMED_AREAS.slice(0, 3),
    ...NUMBERED_AREAS,
    ...NAMED_AREAS.slice(3)
  ];

  /* ---------------- Helpers ---------------- */

  const $ = (sel, root = document) => root.querySelector(sel);

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const fmtDate = new Intl.DateTimeFormat('en-PH', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });

  function ago(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'just now';
    const m = s / 60;
    if (m < 60) return `${Math.floor(m)} min ago`;
    const h = m / 60;
    if (h < 24) return `${Math.floor(h)} h ago`;
    const d = h / 24;
    return d < 30 ? `${Math.floor(d)} d ago` : fmtDate.format(ts);
  }

  function toLocalInput(ts) {
    if (!ts) return '';
    const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }

  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function nearestArea(lat, lng) {
    return AREAS.reduce((best, a) => {
      const d = haversine(lat, lng, a.lat, a.lng);
      return d < best.d ? { name: a.name, d } : best;
    }, { name: AREAS[0].name, d: Infinity }).name;
  }

  /* ---------------- SweetAlert2 helpers (no alert/confirm anywhere) ---------------- */

  const Toast = Swal.mixin({
    toast: true,
    position: 'bottom',
    showConfirmButton: false,
    timer: 3200,
    timerProgressBar: true
  });

  function toast(msg, icon = 'success') {
    Toast.fire({ icon, title: msg });
  }

  async function confirmAction({ title, text, confirmText = 'Delete', danger = true }) {
    const res = await Swal.fire({
      icon: 'warning',
      title,
      text,
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: 'Cancel',
      confirmButtonColor: danger ? '#c9443b' : '#1b6f8f',
      cancelButtonColor: '#587079',
      reverseButtons: true,
      focusCancel: true
    });
    return res.isConfirmed;
  }

  /* ---------------- Data store ---------------- */

  // The system starts with no reports. Residents and the administrator add them.
  function seed() {
    return { seq: 100, session: null, reports: [] };
  }

  function loadDB() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (raw) {
        const stored = JSON.parse(raw);
        const base = seed();
        return {
          ...base,
          ...stored,
          reports: stored.reports || base.reports
        };
      }
    } catch (e) { /* storage blocked or corrupted: fall back to seed */ }
    return seed();
  }

  let db = loadDB();

  function saveDB() {
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(db)); }
    catch (e) { /* ignore: data stays in memory for this session */ }
  }

  const getReport = (id) => db.reports.find((r) => r.id === id);
  const currentUser = () => {
    try {
      const raw = sessionStorage.getItem(CONFIG.sessionKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };
  const isAdmin = () => currentUser()?.role === 'admin';
  const canModify = (r) => {
    const u = currentUser();
    return !!u && (u.role === 'admin' || (r.authorId && r.authorId === u.id));
  };

  /* ---------------- State ---------------- */

  const state = {
    view: 'reports',         // reports | detail | insights | dashboard
    from: 'reports',         // where "Back" returns from the detail view
    selectedId: null,
    filters: { q: '', type: '', status: '', verify: '' },
    placing: false,
    onPlace: null,           // callback when a pin is chosen
    editingId: null,
    draft: null              // { lat, lng }
  };

  /* ---------------- Map ---------------- */

  const map = L.map('map', { zoomControl: false }).setView(CONFIG.center, CONFIG.zoom);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const markerLayer = L.layerGroup().addTo(map);
  const hotspotLayer = L.layerGroup();
  const markers = new Map();
  let draftMarker = null;
  let meMarker = null;

  const CHECK_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.500 6.300l2.400 2.400L9.500 3.600" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function pinIcon(r) {
    const t = TYPES[r.type] || { color: '#587079' };
    const sel = r.id === state.selectedId ? ' is-selected' : '';
    const ver = r.verified ? 'is-verified' : 'is-unverified';
    const inner = r.verified ? CHECK_SVG : '<span class="pin-q">?</span>';
    return L.divIcon({
      className: 'pin-wrap',
      html: `<div class="pin ${ver} st-${r.status}${sel}" style="--c:${t.color}"><span>${inner}</span></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    markers.clear();
    filteredReports().forEach((r) => {
      const m = L.marker([r.lat, r.lng], {
        icon: pinIcon(r),
        title: r.title,
        keyboard: true
      });
      m.bindPopup(
        `<div class="popup-title">${esc(r.title)}</div>` +
        `<div class="popup-sub">${esc(TYPES[r.type]?.label)} in ${esc(r.area)}, ${esc(STATUSES[r.status])}</div>`,
        { closeButton: false }
      );
      m.on('click', () => selectReport(r.id, { fly: false }));
      m.addTo(markerLayer);
      markers.set(r.id, m);
    });
  }

  function renderHotspots() {
    hotspotLayer.clearLayers();
    const counts = areaCounts();
    AREAS.forEach((a) => {
      const n = counts[a.name] || 0;
      if (!n) return;
      L.circle([a.lat, a.lng], {
        radius: 260 + n * 110,
        color: '#c9443b',
        weight: 1.500,
        fillColor: '#c9443b',
        fillOpacity: Math.min(0.12 + n * 0.06, 0.45),
        interactive: true
      }).bindTooltip(`${a.name}: ${n} report${n > 1 ? 's' : ''}`).addTo(hotspotLayer);
    });
  }

  function setDraftMarker(lat, lng) {
    if (draftMarker) map.removeLayer(draftMarker);
    draftMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'pin-wrap',
        html: '<div class="draft-pin"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      }),
      interactive: false
    }).addTo(map);
  }
  function clearDraftMarker() {
    if (draftMarker) { map.removeLayer(draftMarker); draftMarker = null; }
  }

  /* ---------------- Filters ---------------- */

  function filteredReports() {
    const { q, type, status, verify } = state.filters;
    const needle = q.trim().toLowerCase();
    return db.reports
      .filter((r) => {
        if (type && r.type !== type) return false;
        if (status && r.status !== status) return false;
        if (verify === 'verified' && !r.verified) return false;
        if (verify === 'unverified' && r.verified) return false;
        if (needle) {
          const hay = `${r.title} ${r.desc} ${r.area} ${r.author || ''}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function filtersActive() {
    const f = state.filters;
    return !!(f.q || f.type || f.status || f.verify);
  }

  /* ---------------- Rendering: reports list ---------------- */

  const statusPill = (r) =>
    `<span class="pill pill-status-${r.status}">${esc(STATUSES[r.status])}</span>`;

  const verifyPill = (r) => r.verified
    ? `<span class="pill pill-verified">${CHECK_SVG.replace('<svg', '<svg width="11" height="11"')}Verified</span>`
    : '<span class="pill pill-unverified">Unverified</span>';

  const sourcePill = (r) => r.source === 'official'
    ? '<span class="pill pill-official">Official announcement</span>' : '';

  function renderList() {
    const list = $('#reportList');
    const items = filteredReports();

    $('#resultCount').textContent =
      `${items.length} of ${db.reports.length} report${db.reports.length === 1 ? '' : 's'}`;
    $('#clearFilters').hidden = !filtersActive();

    if (!items.length) {
      list.innerHTML = db.reports.length ? `
        <li class="empty">
          <h3>No reports match</h3>
          <p>Try a different search or clear the filters to see every report.</p>
        </li>` : `
        <li class="empty">
          <h3>No reports yet</h3>
          <p>Reports and announcements will show up here once they are posted.</p>
        </li>`;
      return;
    }

    list.innerHTML = items.map((r) => `
      <li>
        <button type="button" class="report-card${r.id === state.selectedId ? ' is-selected' : ''}"
                data-id="${esc(r.id)}" style="--c:${TYPES[r.type]?.color || '#587079'}">
          <h3>${esc(r.title)}</h3>
          <div class="where">${esc(TYPES[r.type]?.label)} in ${esc(r.area)}</div>
          <div class="pills">
            ${statusPill(r)}${verifyPill(r)}${sourcePill(r)}
            <span class="time-ago">${ago(r.createdAt)}</span>
          </div>
        </button>
      </li>`).join('');
  }

  /* ---------------- Rendering: detail ---------------- */

  function renderDetail() {
    const box = $('#viewDetail');
    const r = getReport(state.selectedId);
    if (!r) { showView('reports'); return; }

    const t = TYPES[r.type] || { label: r.type, color: '#587079' };
    const admin = isAdmin();
    const modify = canModify(r);

    const schedule = (r.startsAt || r.endsAt)
      ? `<dt>Schedule</dt><dd>${r.startsAt ? fmtDate.format(r.startsAt) : 'Not set'} to ${r.endsAt ? fmtDate.format(r.endsAt) : 'Not set'}</dd>`
      : '';

    const statusOptions = Object.entries(STATUSES)
      .map(([k, v]) => `<option value="${k}"${k === r.status ? ' selected' : ''}>${v}</option>`).join('');

    box.innerHTML = `
      <div class="detail">
        <button type="button" class="back" data-action="back">${state.from === 'dashboard' ? 'Back to dashboard' : state.from === 'insights' ? 'Back to insights' : 'Back to all reports'}</button>

        <div class="detail-head" style="--c:${t.color}">
          <h2>${esc(r.title)}</h2>
          <div class="pills">${statusPill(r)}${verifyPill(r)}${sourcePill(r)}</div>
        </div>

        <p class="detail-desc">${r.desc ? esc(r.desc) : 'No details were added to this report.'}</p>

        <dl class="facts">
          <dt>Type</dt><dd>${esc(t.label)}</dd>
          <dt>Barangay</dt><dd>${esc(r.area)}</dd>
          <dt>Coordinates</dt><dd>${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}</dd>
          <dt>Posted by</dt><dd>${esc(r.author || 'Anonymous resident')}</dd>
          <dt>Posted</dt><dd>${fmtDate.format(r.createdAt)} (${ago(r.createdAt)})</dd>
          ${schedule}
        </dl>

        ${admin ? `
        <div class="admin-box">
          <h3>Admin controls</h3>
          <div class="row">
            <select id="adminStatus" aria-label="Change status">${statusOptions}</select>
            <button type="button" class="btn btn-small" data-action="toggle-verify">
              ${r.verified ? 'Mark as unverified' : 'Verify report'}
            </button>
          </div>
        </div>` : ''}

        <div class="actions">
          <button type="button" class="btn" data-action="focus">Show on map</button>
          ${modify ? '<button type="button" class="btn" data-action="edit">Edit</button>' : ''}
          ${modify ? '<button type="button" class="btn btn-danger" data-action="delete">Delete</button>' : ''}
        </div>
      </div>`;
  }

  /* ---------------- Rendering: insights ---------------- */

  function areaCounts() {
    const counts = {};
    db.reports.forEach((r) => { counts[r.area] = (counts[r.area] || 0) + 1; });
    return counts;
  }

  function renderInsights() {
    const box = $('#viewInsights');
    const rs = db.reports;
    const total = rs.length;
    const active = rs.filter((r) => r.status === 'ongoing' || r.status === 'reported').length;
    const scheduled = rs.filter((r) => r.status === 'scheduled').length;
    const verified = rs.filter((r) => r.verified).length;
    const pct = total ? Math.round((verified / total) * 100) : 0;

    const byType = Object.keys(TYPES).map((k) => ({
      label: TYPES[k].label, color: TYPES[k].color, n: rs.filter((r) => r.type === k).length
    }));
    const byStatus = Object.keys(STATUSES).map((k) => ({
      label: STATUSES[k], color: `var(--s-${k})`, n: rs.filter((r) => r.status === k).length
    }));

    const maxType = Math.max(1, ...byType.map((x) => x.n));
    const maxStatus = Math.max(1, ...byStatus.map((x) => x.n));

    const bars = (rows, max) => rows.map((x) => `
      <div class="bar-row">
        <span>${esc(x.label)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(x.n / max) * 100}%;--c:${x.color}"></div></div>
        <span class="bar-num">${x.n}</span>
      </div>`).join('');

    const counts = areaCounts();
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const areaRows = ranked.length ? ranked.map(([name, n]) => {
      const mine = rs.filter((r) => r.area === name);
      const open = mine.filter((r) => r.status !== 'resolved').length;
      const topType = Object.keys(TYPES)
        .map((k) => [k, mine.filter((r) => r.type === k).length])
        .sort((a, b) => b[1] - a[1])[0];
      return `
        <div class="area-row">
          <span class="area-name">${esc(name)}${n >= CONFIG.recurringThreshold ? '<span class="flag">Frequently affected</span>' : ''}</span>
          <span class="area-count">${n}</span>
          <span class="area-sub">${open} still open. Most common: ${esc(TYPES[topType[0]].label.toLowerCase())}.</span>
        </div>`;
    }).join('') : '<p class="lead">No reports yet.</p>';

    box.innerHTML = `
      <div class="insights">
        <h2>Water service summary</h2>
        <p class="lead">Based on all ${total} records in the system.</p>

        <div class="stat-strip">
          <div class="stat"><b>${total}</b><span>Total reports</span></div>
          <div class="stat"><b>${active}</b><span>Active now</span></div>
          <div class="stat"><b>${scheduled}</b><span>Scheduled</span></div>
          <div class="stat"><b>${pct}%</b><span>Verified</span></div>
        </div>

        <div class="block">
          <h3>Reports by type</h3>
          ${bars(byType, maxType)}
        </div>

        <div class="block">
          <h3>Reports by status</h3>
          ${bars(byStatus, maxStatus)}
        </div>

        <div class="block">
          <h3>Areas with the most reports</h3>
          ${areaRows}
        </div>

        <div class="insight-actions">
          <button type="button" class="btn" data-action="export">Download records (CSV)</button>
        </div>
      </div>`;
  }

  /* ---------------- Views / tabs ---------------- */

  const TAB_IDS = { reports: 'tabReports', insights: 'tabInsights', dashboard: 'tabDashboard' };
  const VIEW_IDS = { reports: 'viewReports', detail: 'viewDetail', insights: 'viewInsights', dashboard: 'viewDashboard' };

  function activate(view) {
    const tab = view === 'detail' ? state.from : view; // detail keeps the tab it came from highlighted
    Object.entries(VIEW_IDS).forEach(([k, id]) => { $('#' + id).hidden = k !== view; });
    Object.entries(TAB_IDS).forEach(([k, id]) => {
      const on = k === tab;
      $('#' + id).classList.toggle('is-active', on);
      $('#' + id).setAttribute('aria-selected', String(on));
    });
    state.view = view;
    $('#panel').scrollTop = 0;
  }

  function showView(name) {
    if (name === 'dashboard' && !currentUser()) name = 'reports';
    if (name === 'detail') name = state.from;
    state.selectedId = null;
    activate(name);
    if (name === 'reports') renderList();
    if (name === 'insights') renderInsights();
    if (name === 'dashboard') renderDashboard();
    renderMarkers();
  }

  function selectReport(id, { fly = true } = {}) {
    const r = getReport(id);
    if (!r) return;
    if (state.view !== 'detail') state.from = state.view;
    state.selectedId = id;
    activate('detail');
    renderDetail();
    renderMarkers();
    if (fly) {
      map.flyTo([r.lat, r.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
    }
    markers.get(id)?.openPopup();
  }

  function refresh() {
    renderAuth();
    renderHome();
    renderList();
    renderMarkers();
    renderHotspots();
    if (state.view === 'detail') renderDetail();
    if (state.view === 'insights') renderInsights();
    if (state.view === 'dashboard') renderDashboard();
  }

  /* ---------------- Dashboards ---------------- */

  function reportRow(r, actions = '') {
    const t = TYPES[r.type] || { label: r.type, color: '#587079' };
    return `
      <div class="queue-item" style="--c:${t.color}">
        <button type="button" class="queue-main" data-action="open" data-id="${esc(r.id)}">
          <strong>${esc(r.title)}</strong>
          <span>${esc(t.label)} in ${esc(r.area)}, ${ago(r.createdAt)}</span>
        </button>
        <div class="pills">${statusPill(r)}${verifyPill(r)}${sourcePill(r)}</div>
        <div class="queue-actions">${actions}</div>
      </div>`;
  }

  function statStrip(items) {
    return `<div class="stat-strip">${items.map(([n, label]) =>
      `<div class="stat"><b>${n}</b><span>${esc(label)}</span></div>`).join('')}</div>`;
  }

  function renderDashboard() {
    const u = currentUser();
    const box = $('#viewDashboard');
    if (!u) { showView('reports'); return; }
    box.innerHTML = u.role === 'admin' ? adminDashboardHTML(u) : residentDashboardHTML(u);
  }

  function residentDashboardHTML(u) {
    const mine = db.reports.filter((r) => r.authorId === u.id).sort((a, b) => b.createdAt - a.createdAt);
    const open = mine.filter((r) => r.status !== 'resolved').length;
    const verified = mine.filter((r) => r.verified).length;
    const resolved = mine.filter((r) => r.status === 'resolved').length;
    const notices = db.reports
      .filter((r) => r.source === 'official' && r.status !== 'resolved')
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 4);

    const mineRows = mine.length
      ? mine.map((r) => reportRow(r,
          `<button type="button" class="btn btn-small" data-action="edit" data-id="${esc(r.id)}">Edit</button>
           <button type="button" class="btn btn-small btn-danger" data-action="delete" data-id="${esc(r.id)}">Delete</button>`)).join('')
      : '<p class="empty-inline">You have not reported anything yet. Pin an issue on the map to start.</p>';

    const near = openReportsNearHome();
    const nearNote = near
      ? `<p class="lead">${near.length} open report${near.length === 1 ? '' : 's'} within ${CONFIG.geofenceRadius / 1000} km of your home.</p>`
      : '';

    const noticeRows = notices.length
      ? notices.map((r) => reportRow(r)).join('')
      : '<p class="empty-inline">No active announcements from the water provider.</p>';

    return `
      <div class="insights">
        <h2>Hello, ${esc(u.name.split(' ')[0])}</h2>
        <p class="lead">Signed in as ${esc(u.email)}. Track your reports and check official announcements.</p>
        ${nearNote}

        ${statStrip([[mine.length, 'My reports'], [open, 'Still open'], [verified, 'Verified'], [resolved, 'Resolved']])}

        <div class="block">
          <h3>My reports</h3>
          ${mineRows}
        </div>

        <div class="block">
          <h3>Current announcements</h3>
          ${noticeRows}
        </div>

        <div class="insight-actions">
          <button type="button" class="btn btn-primary" data-action="new">Report an issue</button>
          <button type="button" class="btn" data-action="change-home">Change my home</button>
          <button type="button" class="btn" data-action="insights">See area statistics</button>
        </div>
      </div>`;
  }

  function adminDashboardHTML(u) {
    const queue = db.reports
      .filter((r) => r.source === 'community' && !r.verified)
      .sort((a, b) => b.createdAt - a.createdAt);
    const live = db.reports
      .filter((r) => r.status === 'ongoing' || r.status === 'scheduled')
      .sort((a, b) => b.createdAt - a.createdAt);
    const active = db.reports.filter((r) => r.status === 'ongoing' || r.status === 'reported').length;
    const scheduled = db.reports.filter((r) => r.status === 'scheduled').length;

    const queueRows = queue.length
      ? queue.map((r) => reportRow(r,
          `<button type="button" class="btn btn-small btn-primary" data-action="verify" data-id="${esc(r.id)}">Verify</button>
           <button type="button" class="btn btn-small btn-danger" data-action="delete" data-id="${esc(r.id)}">Remove</button>`)).join('')
      : '<p class="empty-inline">Nothing to review. New community reports will show up here.</p>';

    const liveRows = live.length
      ? live.map((r) => reportRow(r,
          `<button type="button" class="btn btn-small" data-action="resolve" data-id="${esc(r.id)}">Mark as resolved</button>
           <button type="button" class="btn btn-small" data-action="edit" data-id="${esc(r.id)}">Edit</button>`)).join('')
      : '<p class="empty-inline">No ongoing or scheduled interruptions right now.</p>';

    return `
      <div class="insights">
        <h2>Admin dashboard</h2>
        <p class="lead">Signed in as ${esc(u.name)}. Review resident reports and manage announcements.</p>

        ${statStrip([[queue.length, 'To verify'], [active, 'Active now'], [scheduled, 'Scheduled'], [db.reports.length, 'Total reports']])}

        <div class="block">
          <h3>Waiting for verification</h3>
          ${queueRows}
        </div>

        <div class="block">
          <h3>Ongoing and scheduled</h3>
          ${liveRows}
        </div>

        <div class="insight-actions">
          <button type="button" class="btn btn-primary" data-action="announce">Post announcement</button>
          <button type="button" class="btn" data-action="insights">See area statistics</button>
          <button type="button" class="btn" data-action="export">Download records (CSV)</button>
          <button type="button" class="btn btn-danger" data-action="reset">Clear all reports</button>
        </div>
      </div>`;
  }

  async function resetDemo() {
    const ok = await confirmAction({
      title: 'Clear all reports?',
      text: 'Every report will be removed. This cannot be undone.',
      confirmText: 'Clear all'
    });
    if (!ok) return;
    db = seed();
    saveDB();
    toast('All reports cleared.');
    showView('dashboard');
    refresh();
  }

  async function onDashboardClick(e) {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    const r = b.dataset.id ? getReport(b.dataset.id) : null;

    if (a === 'open' && r) return selectReport(r.id);
    if (a === 'edit' && r && canModify(r)) return openReportForm({ report: r });
    if (a === 'delete' && r && canModify(r)) {
      if (!(await confirmAction({ title: 'Delete this report?', text: 'This cannot be undone.' }))) return;
      db.reports = db.reports.filter((x) => x.id !== r.id);
      saveDB();
      toast('Report deleted.');
      return refresh();
    }
    if (a === 'verify' && r && isAdmin()) {
      r.verified = true;
      saveDB();
      toast('Report verified.');
      return refresh();
    }
    if (a === 'resolve' && r && isAdmin()) {
      r.status = 'resolved';
      saveDB();
      toast('Marked as resolved.');
      return refresh();
    }
    if (a === 'change-home' && isResident()) return beginHomeSetup();
    if (a === 'new') return beginNewReport();
    if (a === 'announce' && isAdmin()) return beginNewReport({ official: true });
    if (a === 'insights') return showView('insights');
    if (a === 'export') return exportCSV();
    if (a === 'reset' && isAdmin()) return resetDemo();
  }

  /* ---------------- Auth (the login form lives in login.html) ---------------- */

  function renderAuth() {
    const u = currentUser();
    const admin = !!u && u.role === 'admin';

    $('#btnAnnounce').hidden = !admin;
    $('#tabDashboard').textContent = admin ? 'Admin dashboard' : 'My dashboard';

    $('#authArea').innerHTML = u ? `
      <div class="user-chip"><strong>${esc(u.name)}</strong><span>${admin ? 'Administrator' : esc(u.email)}</span></div>
      <button type="button" class="btn btn-ghost-light btn-small" data-auth="logout">Log out</button>` : '';
  }

  function logout() {
    try {
      sessionStorage.removeItem(CONFIG.sessionKey);
      sessionStorage.removeItem(CONFIG.welcomeKey);
    } catch (e) { /* ignore */ }
    location.replace('login.html');
  }

  /* ---------------- Location picking ---------------- */

  function startPlacing(callback) {
    state.placing = true;
    state.onPlace = callback;
    $('#map').classList.add('is-placing');
    $('#placingBanner').hidden = false;
    map.closePopup();
  }

  function stopPlacing() {
    state.placing = false;
    state.onPlace = null;
    $('#map').classList.remove('is-placing');
    $('#placingBanner').hidden = true;
  }

  map.on('click', (e) => {
    if (!state.placing) return;
    const cb = state.onPlace;
    stopPlacing();
    if (cb) cb(e.latlng.lat, e.latlng.lng);
  });

  function useMyLocationForPin() {
    if (!navigator.geolocation) return toast('This browser cannot share your location.', 'error');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const cb = state.onPlace;
        stopPlacing();
        map.setView([pos.coords.latitude, pos.coords.longitude], 17);
        if (cb) cb(pos.coords.latitude, pos.coords.longitude);
      },
      () => toast('Could not get your location. Click the map to place the pin instead.', 'error'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  /* ---------------- Report form ---------------- */

  function fillSelect(sel, options, current) {
    sel.innerHTML = options
      .map(([v, l]) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(l)}</option>`)
      .join('');
  }

  function updateLocText() {
    const d = state.draft;
    $('#locText').textContent = d ? `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}` : 'No pin yet';
  }

  function toggleScheduleRow() {
    $('#scheduleRow').hidden = !$('#rOfficial').checked;
  }

  function openReportForm({ report = null, lat, lng, official = false } = {}) {
    const admin = isAdmin();
    const editing = !!report;
    state.editingId = editing ? report.id : null;
    state.draft = { lat: editing ? report.lat : lat, lng: editing ? report.lng : lng };

    $('#reportTitle').textContent = editing ? 'Edit report' : (official ? 'Post announcement' : 'Report an issue');
    $('#reportSubmit').textContent = editing ? 'Save changes' : (official ? 'Post announcement' : 'Submit report');

    fillSelect($('#rType'), Object.entries(TYPES).map(([k, v]) => [k, v.label]), report?.type || 'interruption');
    const areaGuess = report?.area || nearestArea(state.draft.lat, state.draft.lng);
    fillSelect($('#rArea'), AREAS.map((a) => [a.name, a.name]), areaGuess);

    $('#rTitleInput').value = report?.title || '';
    $('#rDesc').value = report?.desc || '';

    // Status: admins always, owners when editing. New community reports start as "reported".
    const statusKeys = admin ? Object.keys(STATUSES) : ['reported', 'ongoing', 'resolved'];
    fillSelect($('#rStatus'), statusKeys.map((k) => [k, STATUSES[k]]),
      report?.status || (official ? 'scheduled' : 'reported'));
    $('#rStatusField').hidden = !(admin || editing);

    // Official controls are for admins only
    $('#officialBox').hidden = !admin;
    $('#rOfficial').checked = editing ? report.source === 'official' : official;
    $('#rStarts').value = toLocalInput(report?.startsAt);
    $('#rEnds').value = toLocalInput(report?.endsAt);
    toggleScheduleRow();

    $('#reportError').hidden = true;
    updateLocText();
    setDraftMarker(state.draft.lat, state.draft.lng);

    const dlg = $('#reportDialog');
    if (!dlg.open) dlg.showModal();
  }

  function beginNewReport({ official = false } = {}) {
    state.editingId = null;
    startPlacing((lat, lng) => openReportForm({ lat, lng, official }));
  }

  function onChangePin() {
    $('#reportDialog').close();
    const editing = state.editingId ? getReport(state.editingId) : null;
    const snapshot = {
      type: $('#rType').value, area: $('#rArea').value, title: $('#rTitleInput').value,
      desc: $('#rDesc').value, status: $('#rStatus').value,
      official: $('#rOfficial').checked, starts: $('#rStarts').value, ends: $('#rEnds').value
    };
    startPlacing((lat, lng) => {
      openReportForm({ report: editing, lat, lng, official: snapshot.official });
      // restore what the person already typed
      $('#rType').value = snapshot.type;
      $('#rTitleInput').value = snapshot.title;
      $('#rDesc').value = snapshot.desc;
      $('#rStatus').value = snapshot.status;
      $('#rOfficial').checked = snapshot.official;
      $('#rStarts').value = snapshot.starts;
      $('#rEnds').value = snapshot.ends;
      toggleScheduleRow();
    });
  }

  function onReportSubmit(e) {
    e.preventDefault();
    const u = currentUser();
    if (!u) return showError('reportError', 'Log in to submit a report.');

    const title = $('#rTitleInput').value.trim();
    if (!title) return showError('reportError', 'Add a short title so others know what is happening.');
    if (!state.draft) return showError('reportError', 'Pin the location on the map first.');

    const admin = u.role === 'admin';
    const official = admin && $('#rOfficial').checked;
    const startsAt = $('#rStarts').value ? new Date($('#rStarts').value).getTime() : null;
    const endsAt = $('#rEnds').value ? new Date($('#rEnds').value).getTime() : null;
    if (official && startsAt && endsAt && endsAt < startsAt) {
      return showError('reportError', 'The end time is before the start time. Check the schedule.');
    }

    const values = {
      type: $('#rType').value,
      area: $('#rArea').value,
      title,
      desc: $('#rDesc').value.trim(),
      lat: state.draft.lat,
      lng: state.draft.lng,
      startsAt: official ? startsAt : null,
      endsAt: official ? endsAt : null
    };

    let id;
    if (state.editingId) {
      const r = getReport(state.editingId);
      Object.assign(r, values);
      if (!$('#rStatusField').hidden) r.status = $('#rStatus').value;
      if (admin) {
        r.source = official ? 'official' : 'community';
        if (official) r.verified = true;
      } else if (r.source === 'community') {
        r.verified = false; // edits to a community report need to be verified again
      }
      id = r.id;
      toast('Changes saved.');
    } else {
      id = 'r' + (++db.seq);
      db.reports.push({
        id,
        ...values,
        status: !$('#rStatusField').hidden ? $('#rStatus').value : 'reported',
        source: official ? 'official' : 'community',
        verified: official,
        authorId: u.id,
        author: u.name,
        createdAt: Date.now()
      });
      toast(official ? 'Announcement posted.' : 'Report submitted. An admin can verify it.');
    }

    saveDB();
    clearDraftMarker();
    state.draft = null;
    $('#reportDialog').close();
    refresh();
    selectReport(id, { fly: true });
  }

  /* ---------------- CRUD actions from the detail view ---------------- */

  async function onDetailClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const r = getReport(state.selectedId);
    const action = btn.dataset.action;

    if (action === 'back') return showView(state.from);
    if (!r) return;

    if (action === 'focus') {
      map.flyTo([r.lat, r.lng], 17, { duration: 0.8 });
      markers.get(r.id)?.openPopup();
    }
    if (action === 'edit' && canModify(r)) {
      openReportForm({ report: r });
    }
    if (action === 'delete' && canModify(r)) {
      if (!(await confirmAction({ title: 'Delete this report?', text: 'This cannot be undone.' }))) return;
      db.reports = db.reports.filter((x) => x.id !== r.id);
      saveDB();
      toast('Report deleted.');
      showView(state.from);
      refresh();
    }
    if (action === 'toggle-verify' && isAdmin()) {
      r.verified = !r.verified;
      saveDB();
      toast(r.verified ? 'Report verified.' : 'Verification removed.');
      refresh();
    }
  }

  function onDetailChange(e) {
    if (e.target.id !== 'adminStatus' || !isAdmin()) return;
    const r = getReport(state.selectedId);
    if (!r) return;
    r.status = e.target.value;
    saveDB();
    toast(`Status changed to ${STATUSES[r.status].toLowerCase()}.`);
    refresh();
  }

  /* ---------------- Insights actions ---------------- */

  function exportCSV() {
    const head = ['id', 'type', 'title', 'barangay', 'status', 'verified', 'source', 'latitude', 'longitude', 'posted_by', 'posted_at'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = db.reports.map((r) => [
      r.id, TYPES[r.type]?.label, r.title, r.area, STATUSES[r.status],
      r.verified ? 'yes' : 'no', r.source, r.lat, r.lng, r.author || '', new Date(r.createdAt).toISOString()
    ].map(q).join(','));
    const blob = new Blob([[head.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pipesense-records.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function onInsightsClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'export') exportCSV();
  }

  /* ---------------- Resident address + geofence ---------------- */

  const homeLayer = L.layerGroup().addTo(map);

  let homeGeo = null;   // { name, lat, lng } found by GeoSearch

  // Barangay from the address saved at sign-up ("Alijis, Bacolod City")
  function baseHomeArea() {
    const u = currentUser();
    if (!u || u.role === 'admin' || !u.address) return null;
    const name = String(u.address).split(',')[0].trim().toLowerCase();
    return AREAS.find((a) => a.name.toLowerCase() === name) || null;
  }

  // The home the resident chose (null until they set it)
  let myHome = null;

  function loadHome() {
    try {
      const h = JSON.parse(localStorage.getItem(CONFIG.homeKey + currentUser().id));
      return h && isFinite(h.lat) && isFinite(h.lng) ? { lat: +h.lat, lng: +h.lng } : null;
    } catch (e) { return null; }
  }
  function saveHome(lat, lng) {
    const h = { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
    try { localStorage.setItem(CONFIG.homeKey + currentUser().id, JSON.stringify(h)); } catch (e) { /* ignore */ }
    return h;
  }

  function homeArea() {
    const u = currentUser();
    if (!u || u.role === 'admin' || !myHome) return null;
    const base = baseHomeArea();
    return { name: base ? base.name : 'your area', lat: myHome.lat, lng: myHome.lng };
  }

  function readGeoCache() {
    try { return JSON.parse(localStorage.getItem(CONFIG.geoKey)) || {}; } catch (e) { return {}; }
  }
  function writeGeoCache(c) {
    try { localStorage.setItem(CONFIG.geoKey, JSON.stringify(c)); } catch (e) { /* ignore */ }
  }
  const inBacolod = (lat, lng) => lat > 10.55 && lat < 10.80 && lng > 122.84 && lng < 123.04;

  // ---- geometry helpers: find the middle of a barangay outline ----
  function ringCentroid(ring) {            // ring = [[lng, lat], ...]
    let area = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0, y0] = ring[j], [x1, y1] = ring[i];
      const f = x0 * y1 - x1 * y0;
      area += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
    if (!area) return null;
    area *= 0.5;
    return { lng: cx / (6 * area), lat: cy / (6 * area), area: Math.abs(area) };
  }

  function pointInRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Centroid of the biggest polygon, only if it really lies inside the outline
  function outlineCenter(geo) {
    if (!geo) return null;
    const polys = geo.type === 'Polygon' ? [geo.coordinates]
      : geo.type === 'MultiPolygon' ? geo.coordinates : [];
    let best = null;
    polys.forEach((p) => {
      const c = p[0] && ringCentroid(p[0]);
      if (c && (!best || c.area > best.area)) best = { ...c, ring: p[0] };
    });
    return best && pointInRing(best.lng, best.lat, best.ring) ? best : null;
  }

  // Looks the barangay name up with Leaflet-GeoSearch (OpenStreetMap) and puts the
  // home marker in the middle of the area it finds. Falls back to the approximate
  // position from AREAS if nothing is found.
  async function geocodeHome() {
    const a = baseHomeArea();
    if (!a) return;

    const cache = readGeoCache();
    if (cache[a.name]) { homeGeo = { name: a.name, ...cache[a.name] }; return; }
    if (!window.GeoSearch) { console.warn('GeoSearch did not load; using approximate position.'); return; }

    const provider = new GeoSearch.OpenStreetMapProvider({
      params: { countrycodes: 'ph', limit: 3, bounded: 1, viewbox: CONFIG.cityViewbox, polygon_geojson: 1 }
    });
    const num = /^Barangay (\d+)$/.exec(a.name);
    const queries = [
      `${a.name}, Bacolod City, Negros Occidental, Philippines`,
      `${a.name}, Bacolod`,
      ...(num ? [`Brgy ${num[1]}, Bacolod City`, `Brgy. ${num[1]} Bacolod`] : [])
    ];

    for (const query of queries) {
      try {
        const results = await provider.search({ query });
        for (const r of results || []) {
          let lat = r.y, lng = r.x, how = 'point';

          const c = outlineCenter(r.raw && r.raw.geojson);
          if (c) { lat = c.lat; lng = c.lng; how = 'outline'; }
          else if (r.bounds) {
            const [[s, w], [n, e]] = r.bounds;
            if (Math.abs(n - s) < 0.06 && Math.abs(e - w) < 0.06) {
              lat = (s + n) / 2; lng = (w + e) / 2; how = 'box';
            }
          }
          if (!inBacolod(lat, lng)) continue;

          homeGeo = { name: a.name, lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
          cache[a.name] = { lat: homeGeo.lat, lng: homeGeo.lng };
          writeGeoCache(cache);
          console.log(`GeoSearch: "${query}" -> ${r.label} (${how}) ${homeGeo.lat}, ${homeGeo.lng}`);
          return;
        }
      } catch (e) {
        console.warn('GeoSearch failed for', query, e);
      }
    }
    console.warn(`GeoSearch found nothing for ${a.name}; using approximate position.`);
  }

  function openReportsNearHome() {
    const a = homeArea();
    if (!a) return null;
    return db.reports.filter((r) =>
      r.status !== 'resolved' &&
      haversine(a.lat, a.lng, r.lat, r.lng) <= CONFIG.geofenceRadius);
  }

  function renderHome() {
    homeLayer.clearLayers();
    const a = homeArea();
    if (!a) return;

    L.circle([a.lat, a.lng], {
      radius: CONFIG.geofenceRadius,
      color: '#1b6f8f',
      weight: 2,
      dashArray: '6 6',
      fillColor: '#5cc8d7',
      fillOpacity: 0.16,
      interactive: false
    }).addTo(homeLayer);

    L.marker([a.lat, a.lng], {
      interactive: false,
      keyboard: false,
      icon: homeIcon()
    }).addTo(homeLayer);
  }

  // Picture for the home marker (falls back to a round blue house if the image is missing)
  let homeImgOk = null;
  (() => {
    const im = new Image();
    im.onload = () => { homeImgOk = true; };
    im.onerror = () => { homeImgOk = false; console.warn('Home marker image not found: ' + CONFIG.homeIcon.url); };
    im.src = CONFIG.homeIcon.url;
  })();

  function homeIcon() {
    if (homeImgOk === false) {
      return L.divIcon({
        className: 'pin-wrap',
        html: '<div style="width:34px;height:34px;border-radius:50%;background:#1b6f8f;border:3px solid #fff;' +
              'box-shadow:0 2px 6px rgba(16,48,59,.45);display:grid;place-items:center;color:#fff">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z" fill="currentColor"/></svg></div>',
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
    }
    return L.icon({
      iconUrl: CONFIG.homeIcon.url,
      iconSize: CONFIG.homeIcon.size,
      iconAnchor: CONFIG.homeIcon.anchor
    });
  }

  function focusHome() {
    const a = homeArea();
    if (!a) return;
    // (L.circle().getBounds() needs the circle to be on the map, so use toBounds instead)
    const box = L.latLng(a.lat, a.lng).toBounds(CONFIG.geofenceRadius * 2);
    map.fitBounds(box, { padding: [30, 30] });
  }

  // Popup shown once, right after logging in
  function welcome() {
    const u = currentUser();
    if (!u) return;
    try {
      if (sessionStorage.getItem(CONFIG.welcomeKey) === String(u.id)) return;   // already shown
      sessionStorage.setItem(CONFIG.welcomeKey, String(u.id));
    } catch (e) { /* ignore */ }

    if (u.role === 'admin') {
      const waiting = db.reports.filter((r) => r.source === 'community' && !r.verified).length;
      return Swal.fire({
        icon: 'success',
        title: 'Welcome, administrator',
        html: `<p style="margin:0">${waiting
          ? `${waiting} report${waiting === 1 ? ' is' : 's are'} waiting for verification.`
          : 'No reports are waiting for verification.'}</p>`,
        confirmButtonText: 'Open dashboard'
      });
    }

    const a = homeArea();
    const near = openReportsNearHome();
    const where = a
      ? `<p style="margin:0 0 8px">Your home in <b>${esc(a.name)}</b> is marked on the map with a ${CONFIG.geofenceRadius / 1000} km geofence.</p>
         <p style="margin:0">${near.length
           ? `${near.length} open report${near.length === 1 ? '' : 's'} inside your geofence.`
           : 'No open reports inside your geofence.'}</p>`
      : '<p style="margin:0">We could not place your address on the map.</p>';

    return Swal.fire({
      icon: near && near.length ? 'warning' : 'success',
      title: `Welcome, ${esc(u.name.split(' ')[0])}`,
      html: where,
      confirmButtonText: 'View map'
    });
  }

  /* ---------------- Home setup (required before using the app) ---------------- */

  let homeDraft = null;
  let homeBanner = null;

  function isResident() {
    const u = currentUser();
    return !!u && u.role !== 'admin';
  }

  // While locked the resident can only pick a home (or log out)
  function lockApp(on) {
    document.body.classList.toggle('needs-home', on);
    $('#panel').inert = on;
    $('.map-tools').inert = on;
    $('#btnNewReport').disabled = on;
  }

  function showHomeBanner(force) {
    if (!homeBanner) {
      homeBanner = document.createElement('div');
      homeBanner.className = 'placing-banner';
      homeBanner.setAttribute('role', 'status');
      $('.mapwrap').appendChild(homeBanner);
      homeBanner.addEventListener('click', onHomeBannerClick);
    }
    homeBanner.innerHTML = `
      <strong>${force ? 'Set your home to continue' : 'Choose your home'}</strong>
      <span>Click the map where your home is.</span>
      <button type="button" class="btn btn-small" data-home="locate">Use my location</button>
      ${force ? '' : '<button type="button" class="btn btn-small btn-quiet" data-home="cancel">Cancel</button>'}`;
    homeBanner.hidden = false;
  }

  function onHomeBannerClick(e) {
    const b = e.target.closest('[data-home]');
    if (!b) return;
    if (b.dataset.home === 'cancel') return stopHomeSetup();
    if (b.dataset.home === 'locate') {
      if (!navigator.geolocation) return toast('This browser cannot share your location.', 'error');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.setView([pos.coords.latitude, pos.coords.longitude], 17);
          chooseHome(pos.coords.latitude, pos.coords.longitude);
        },
        () => toast('Could not get your location. Click the map instead.', 'error'),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }

  function beginHomeSetup({ force = false } = {}) {
    if (state.placing) { stopPlacing(); clearDraftMarker(); }
    state.settingHome = true;
    state.forceHome = force;
    $('#map').classList.add('is-placing');
    map.closePopup();
    showHomeBanner(force);

    // Start the map near the resident's barangay to make the pick easier
    const base = baseHomeArea();
    if (base) map.setView([base.lat, base.lng], 15);
    geocodeHome()
      .then(() => {
        if (homeGeo && state.settingHome && !homeDraft) map.setView([homeGeo.lat, homeGeo.lng], 16);
      })
      .catch(() => { /* the approximate view is fine */ });
  }

  function stopHomeSetup() {
    state.settingHome = false;
    $('#map').classList.remove('is-placing');
    if (homeBanner) homeBanner.hidden = true;
    if (homeDraft) { map.removeLayer(homeDraft); homeDraft = null; }
  }

  async function chooseHome(lat, lng) {
    if (state.confirmingHome) return;

    if (!inBacolod(lat, lng)) {
      await Swal.fire({
        icon: 'warning',
        title: 'Outside Bacolod City',
        text: 'Pick a spot inside Bacolod City.',
        confirmButtonText: 'OK'
      });
      return;
    }

    state.confirmingHome = true;
    if (homeDraft) map.removeLayer(homeDraft);
    homeDraft = L.marker([lat, lng], { icon: homeIcon(), interactive: false, opacity: 0.85 }).addTo(map);

    const res = await Swal.fire({
      icon: 'question',
      title: 'Set this as your home?',
      html: `<p style="margin:0">${lat.toFixed(5)}, ${lng.toFixed(5)}</p>`,
      showCancelButton: true,
      confirmButtonText: 'Yes, this is my home',
      cancelButtonText: 'Choose again',
      allowOutsideClick: false,
      reverseButtons: true
    });
    state.confirmingHome = false;

    if (!res.isConfirmed) {
      map.removeLayer(homeDraft);
      homeDraft = null;
      return;
    }

    const first = state.forceHome;
    myHome = saveHome(lat, lng);
    stopHomeSetup();
    lockApp(false);
    refresh();
    renderLegend();
    focusHome();
    if (first) welcome(); else toast('Home updated.');
  }

  map.on('click', (e) => {
    if (state.settingHome) chooseHome(e.latlng.lat, e.latlng.lng);
  });

  /* ---------------- Legend ---------------- */

  function renderLegend() {
    $('#legend').innerHTML = `
      <div class="legend-title">Report type</div>
      ${Object.values(TYPES).map((t) => `
        <div class="legend-item"><span class="legend-swatch" style="--c:${t.color}"></span>${esc(t.label)}</div>`).join('')}
      <div class="legend-sep"></div>
      <div class="legend-item"><span class="legend-swatch solid"></span>Verified</div>
      <div class="legend-item"><span class="legend-swatch dashed"></span>Not yet verified</div>
      ${homeArea() ? `
      <div class="legend-sep"></div>
      <div class="legend-item"><span class="legend-swatch" style="--c:#1b6f8f"></span>Your home</div>
      <div class="legend-item"><span class="legend-swatch dashed" style="border-color:#1b6f8f"></span>Geofence (${CONFIG.geofenceRadius / 1000} km)</div>` : ''}`;
  }

  /* ---------------- Event wiring ---------------- */

  function init() {
    if (!currentUser()) { location.replace('login.html'); return; }
    myHome = loadHome();

    // Filter selects
    fillSelect($('#fType'), [['', 'All types'], ...Object.entries(TYPES).map(([k, v]) => [k, v.label])], '');
    fillSelect($('#fStatus'), [['', 'All statuses'], ...Object.entries(STATUSES)], '');

    $('#fSearch').addEventListener('input', (e) => { state.filters.q = e.target.value; refresh({ keepView: true }); });
    $('#fType').addEventListener('change', (e) => { state.filters.type = e.target.value; refresh({ keepView: true }); });
    $('#fStatus').addEventListener('change', (e) => { state.filters.status = e.target.value; refresh({ keepView: true }); });
    $('#fVerify').addEventListener('change', (e) => { state.filters.verify = e.target.value; refresh({ keepView: true }); });
    $('#clearFilters').addEventListener('click', () => {
      state.filters = { q: '', type: '', status: '', verify: '' };
      $('#fSearch').value = ''; $('#fType').value = ''; $('#fStatus').value = ''; $('#fVerify').value = '';
      refresh({ keepView: true });
    });

    // List and detail
    $('#reportList').addEventListener('click', (e) => {
      const card = e.target.closest('[data-id]');
      if (card) selectReport(card.dataset.id);
    });
    $('#viewDetail').addEventListener('click', onDetailClick);
    $('#viewDetail').addEventListener('change', onDetailChange);
    $('#viewInsights').addEventListener('click', onInsightsClick);
    $('#viewDashboard').addEventListener('click', onDashboardClick);

    // Tabs
    $('#tabReports').addEventListener('click', () => showView('reports'));
    $('#tabInsights').addEventListener('click', () => showView('insights'));
    $('#tabDashboard').addEventListener('click', () => showView('dashboard'));

    // Top bar
    $('#btnNewReport').addEventListener('click', () => beginNewReport());
    $('#btnAnnounce').addEventListener('click', () => { if (isAdmin()) beginNewReport({ official: true }); });

    $('#authArea').addEventListener('click', (e) => {
      const b = e.target.closest('[data-auth]');
      if (!b) return;
      if (b.dataset.auth === 'logout') logout();
    });

    // Auth dialog

    // Report dialog
    $('#reportForm').addEventListener('submit', onReportSubmit);
    $('#changePin').addEventListener('click', onChangePin);
    $('#rOfficial').addEventListener('change', toggleScheduleRow);
    $('#reportDialog').addEventListener('close', () => {
      if (!state.placing) clearDraftMarker();
    });

    // Generic close buttons
    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-close]');
      if (c) $('#' + c.dataset.close).close();
    });

    // Click on dialog backdrop closes it
    document.querySelectorAll('dialog').forEach((d) => {
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    });

    // Placing banner
    $('#placeCancel').addEventListener('click', () => { stopPlacing(); clearDraftMarker(); toast('Pin placement cancelled.', 'info'); });
    $('#placeUseMyLocation').addEventListener('click', useMyLocationForPin);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.placing) { stopPlacing(); clearDraftMarker(); }
    });

    // Map tools
    $('#toggleHotspots').addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', String(on));
      e.currentTarget.textContent = on ? 'Hide frequently affected areas' : 'Show frequently affected areas';
      if (on) hotspotLayer.addTo(map); else map.removeLayer(hotspotLayer);
    });

    $('#btnLocate').addEventListener('click', () => map.locate({ setView: true, maxZoom: 16 }));
    map.on('locationfound', (e) => {
      if (meMarker) map.removeLayer(meMarker);
      meMarker = L.circleMarker(e.latlng, {
        radius: 8, color: '#10303b', weight: 3, fillColor: '#5cc8d7', fillOpacity: 1
      }).addTo(map).bindTooltip('You are here');
    });
    map.on('locationerror', () => toast('Could not get your location. Check your browser permissions.', 'error'));

    window.addEventListener('resize', () => map.invalidateSize());
    setTimeout(() => map.invalidateSize(), 300);

    renderLegend();
    refresh();
    showView('dashboard');
    if (isResident() && !myHome) {
      // Nothing else works until the resident chooses a home
      lockApp(true);
      beginHomeSetup({ force: true });
    } else {
      try { focusHome(); } catch (e) { console.error('focusHome:', e); }
      map.invalidateSize();
      welcome();
    }

    // Keep relative times fresh
    setInterval(() => { if (!$('#viewReports').hidden) renderList(); }, 60000);
  }

  init();
})();
