(() => {
  'use strict';

  const CONFIG = {
    sessionKey: 'pipesense.user',
    center: [10.6713, 122.9511],
    zoom: 13,
    geofenceRadius: 1000,
    homeIcon: { url: 'assets/images/HOMEMARKER.png', size: [44, 44], anchor: [22, 44] },
    geoKey: 'pipesense.geo.v3',
    welcomeKey: 'pipesense.welcomed',
    cityViewbox: '122.84,10.80,123.04,10.55',
    recurringThreshold: 3
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

  const AREAS = [
    ...NAMED_AREAS.slice(0, 3),
    ...NUMBERED_AREAS,
    ...NAMED_AREAS.slice(3)
  ];

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

  function pointInPoly(lat, lng, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [yi, xi] = pts[i], [yj, xj] = pts[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function polyAreaKm2(pts) {
    if (pts.length < 3) return 0;
    const lat0 = pts.reduce((t, p) => t + p[0], 0) / pts.length;
    const kx = 111.320 * Math.cos(lat0 * Math.PI / 180), ky = 110.574;
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      a += (pts[j][1] * kx) * (pts[i][0] * ky) - (pts[i][1] * kx) * (pts[j][0] * ky);
    }
    return Math.abs(a) / 2;
  }

  function segsCross(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 && o2 && o3 && o4;
  }

  function selfIntersects(pts) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue;
        if (segsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
      }
    }
    return false;
  }

  function reportCovers(r, lat, lng) {
    const g = r.geofence;
    if (g && g.type === 'polygon' && g.points && g.points.length >= 3) return pointInPoly(lat, lng, g.points);
    return haversine(r.lat, r.lng, lat, lng) <= (r.radius || CONFIG.geofenceRadius);
  }

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

  const API = {
    reports: 'forms/reports.php',
    deleteReport: 'forms/delete_report.php',
    home: 'forms/save_home.php',
    searchUsers: 'forms/search_users.php',
    notifications: 'forms/notifications.php',
    log: 'forms/report_log.php'
  };

  const db = { reports: [], notifications: [], log: [] };
  const seenNoteIds = new Set();

  let sessionEnding = false;
  async function sessionExpired() {
    if (sessionEnding) return;
    sessionEnding = true;
    try { sessionStorage.removeItem(CONFIG.sessionKey); } catch (e) { }
    await Swal.fire({ icon: 'warning', title: 'Session expired', text: 'Please log in again.', confirmButtonText: 'OK' });
    location.replace('login.html');
  }

  async function api(url, fields = {}) {
    let res;
    try {
      const u = currentUser();
      const body = new URLSearchParams(fields);
      if (u && u.token) body.set('token', u.token);
      res = await fetch(url, { method: 'POST', body, credentials: 'same-origin' });
    } catch (e) {
      throw new Error('Cannot reach the server. Make sure Apache and MySQL are running in Laragon.');
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      throw new Error('Unexpected reply from ' + url + ': ' + text.replace(/<[^>]*>/g, ' ').trim().slice(0, 160));
    }
    if (res.status === 401) { sessionExpired(); throw new Error(data.message || 'Session expired.'); }
    if (data.status !== 'success') {
      const err = new Error(data.message || 'The request failed.');
      err.detail = data.detail;
      throw err;
    }
    return data;
  }

  const errMsg = (e) => (e && e.message ? e.message : 'Something went wrong.') + (e && e.detail ? ` (${e.detail})` : '');

  async function loadReports() {
    const data = await api(API.reports, { action: 'list' });
    db.reports = data.reports;
  }

  async function loadNotifications() {
    if (!isResident()) { db.notifications = []; return db.notifications; }
    const data = await api(API.notifications, { action: 'list' });
    db.notifications = data.notifications;
    return db.notifications;
  }

  const unreadNotes = () => db.notifications.filter((n) => !n.read);

  async function markNotes(fields) {
    try { await api(API.notifications, fields); return true; }
    catch (err) { toast(errMsg(err), 'error'); return false; }
  }

  async function pollNotes() {
    const list = await loadNotifications();
    const fresh = list.filter((n) => !n.read && !seenNoteIds.has(n.id));
    list.forEach((n) => seenNoteIds.add(n.id));
    if (fresh.length) announceNewNotes(fresh);
    return fresh.length > 0;
  }

  function announceNewNotes(fresh) {
    const items = fresh.slice(0, 5).map((n) => `<li>${esc(n.message)}</li>`).join('');
    Swal.fire({
      icon: 'warning',
      title: fresh.length === 1 ? 'Water service notice for your home' : `${fresh.length} water service notices for your home`,
      html: `<ul style="text-align:left;margin:0;padding-left:1.2em">${items}</ul>`,
      confirmButtonText: 'View dashboard',
      showCancelButton: true,
      cancelButtonText: 'Close'
    }).then((res) => { if (res.isConfirmed) showView('dashboard'); });
  }

  let lastUpdate = { message: '', emailed: 0 };

  function verifyNotice() {
    const m = lastUpdate.message || 'Report verified.';
    toast(m, /could not be sent/.test(m) ? 'warning' : 'success');
  }

  async function withBusy(title, fn) {
    Swal.fire({ title, text: 'Please wait...', allowOutsideClick: false, allowEscapeKey: false,
                showConfirmButton: false, didOpen: () => Swal.showLoading() });
    try { return await fn(); }
    finally { Swal.close(); }
  }

  async function updateReport(id, fields) {
    try {
      const data = await api(API.reports, { action: 'update', id, ...fields });
      lastUpdate = { message: data.message || '', emailed: data.emailed || 0 };
      const i = db.reports.findIndex((x) => x.id === data.report.id);
      if (i >= 0) db.reports[i] = data.report; else db.reports.push(data.report);
      return data.report;
    } catch (err) {
      toast(errMsg(err), 'error');
      return null;
    }
  }

  async function removeReport(id) {
    try {
      await api(API.deleteReport, { id });
      db.reports = db.reports.filter((x) => x.id !== id);
      toast('Report deleted.');
      return true;
    } catch (err) {
      toast(errMsg(err), 'error');
      return false;
    }
  }

  function showError(id, message) {
    const el = $('#' + id);
    el.textContent = message;
    el.hidden = false;
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

  const isOwn = (r) => {
    const u = currentUser();
    return !!u && !!r.authorId && r.authorId === u.id;
  };

  function affectsHome(r) {
    if (r.status === 'resolved') return false;
    const h = homeArea();
    if (!h) return false;
    if (r.codeRed && haversine(h.lat, h.lng, r.lat, r.lng) <= CONFIG.geofenceRadius) return true;
    if (r.source !== 'official') return false;
    return reportCovers(r, h.lat, h.lng);
  }

  const state = {
    view: 'reports',
    from: 'reports',
    selectedId: null,
    filters: { q: '', type: '', status: '', verify: '', scope: '', area: '', from: '', to: '' },
    placing: false,
    onPlace: null,
    editingId: null,
    draft: null,
    draftGeo: null,
    drawingGeo: false,
    history: { tab: 'resolved', q: '', from: '', to: '' }
  };

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
      html: `<div class="pin ${ver} st-${r.status}${sel}${r.codeRed ? ' is-codered' : ''}" style="--c:${t.color}"><span>${inner}</span></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    markers.clear();
    filteredReports('map').forEach((r) => {
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
      m.on('click', () => { if (!state.drawingGeo) selectReport(r.id, { fly: false }); });
      m.addTo(markerLayer);
      markers.set(r.id, m);
      if (r.source === 'official' && r.status !== 'resolved') {
        const c = TYPES[r.type]?.color || '#587079';
        const style = { color: c, weight: 1.5, dashArray: '4 6', fillColor: c, fillOpacity: 0.07, interactive: false };
        if (r.geofence && r.geofence.type === 'polygon' && r.geofence.points.length >= 3) {
          L.polygon(r.geofence.points, style).addTo(markerLayer);
        } else if (r.radius) {
          L.circle([r.lat, r.lng], { ...style, radius: r.radius }).addTo(markerLayer);
        }
      }
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

  function filteredReports(mode = 'list') {
    const { q, type, status, verify, scope, area, from, to } = state.filters;
    const needle = q.trim().toLowerCase();
    const fromMs = from ? new Date(from + 'T00:00:00').getTime() : null;
    const toMs = to ? new Date(to + 'T23:59:59.999').getTime() : null;
    return db.reports
      .filter((r) => {
        if (mode === 'map') { if (r.status === 'resolved' && r.id !== state.selectedId) return false; }
        else if (isAdmin() && r.status === 'resolved') return false;
        if (scope === 'mine' && !isOwn(r)) return false;
        if (scope === 'others' && isOwn(r)) return false;
        if (area && r.area !== area) return false;
        if (fromMs !== null && r.createdAt < fromMs) return false;
        if (toMs !== null && r.createdAt > toMs) return false;
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

  const emptyFilters = () => ({ q: '', type: '', status: '', verify: '', scope: '', area: '', from: '', to: '' });

  function syncFilterControls() {
    [['#fSearch', 'q'], ['#fType', 'type'], ['#fStatus', 'status'], ['#fVerify', 'verify'],
     ['#fScope', 'scope'], ['#fArea', 'area'], ['#fFrom', 'from'], ['#fTo', 'to']].forEach(([sel, key]) => {
      const el = $(sel);
      if (el) el.value = state.filters[key];
    });
  }

  function openReportsTab(preset = {}) {
    state.filters = { ...emptyFilters(), ...preset };
    syncFilterControls();
    showView('reports');
  }

  function showAllPosts() {
    if (state.settingHome) return;
    openReportsTab();

    const shown = filteredReports('map');
    const pts = shown.map((r) => [r.lat, r.lng]);
    const home = homeArea();
    if (home) pts.push([home.lat, home.lng]);
    if (isAdmin()) userHomes.forEach((h) => pts.push([h.lat, h.lng]));

    if (!pts.length) return toast('There are no posts yet.', 'info');
    map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 16 });
    toast(`Showing all ${filteredReports().length} post${filteredReports().length === 1 ? '' : 's'}.`, 'info');
  }

  function filtersActive() {
    const f = state.filters;
    return !!(f.q || f.type || f.status || f.verify || f.scope || f.area || f.from || f.to);
  }

  const statusPill = (r) =>
    `<span class="pill pill-status-${r.status}">${esc(STATUSES[r.status])}</span>`;

  const verifyPill = (r) => r.verified
    ? `<span class="pill pill-verified">${CHECK_SVG.replace('<svg', '<svg width="11" height="11"')}Verified</span>`
    : '<span class="pill pill-unverified">Unverified</span>';

  const codePill = (r) => r.codeRed ? '<span class="pill pill-codered">Code red</span>' : '';
  const minePill = (r) => isOwn(r) ? '<span class="pill pill-mine">Yours</span>' : '';
  const affectsPill = (r) => affectsHome(r) ? '<span class="pill pill-affects">Affects your home</span>' : '';

  const sourcePill = (r) => r.source === 'official'
    ? '<span class="pill pill-official">Official announcement</span>' : '';

  function renderList() {
    const list = $('#reportList');
    const items = filteredReports();
    const listBase = isAdmin() ? db.reports.filter((r) => r.status !== 'resolved').length : db.reports.length;

    $('#resultCount').textContent =
      `${items.length} of ${listBase} report${listBase === 1 ? '' : 's'}`;
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
          <div class="where">${esc(TYPES[r.type]?.label)} in ${esc(r.area)} &middot; ${fmtDate.format(r.createdAt)}</div>
          <div class="pills">
            ${codePill(r)}${statusPill(r)}${verifyPill(r)}${sourcePill(r)}${minePill(r)}${affectsPill(r)}
            <span class="time-ago">${ago(r.createdAt)}</span>
          </div>
        </button>
      </li>`).join('');
  }

  function coverageLabel(r) {
    const g = r.geofence;
    if (g && g.type === 'polygon' && g.points.length >= 3) {
      return `Drawn area, ${g.points.length} points, about ${polyAreaKm2(g.points).toFixed(2)} km\u00b2`;
    }
    return `${r.radius || CONFIG.geofenceRadius} m around the pin`;
  }

  function affectedResidents(r) {
    return userHomes.filter((h) => reportCovers(r, h.lat, h.lng));
  }

  function affectedText(r) {
    const list = affectedResidents(r);
    if (!list.length) return 'None have a home marker inside this area.';
    const names = list.slice(0, 6).map((h) => h.name).join(', ');
    return `${list.length}: ${names}${list.length > 6 ? ', and more' : ''}`;
  }

  function renderDetail() {
    const box = $('#viewDetail');
    const r = getReport(state.selectedId);
    if (!r) { showView('reports'); return; }

    const t = TYPES[r.type] || { label: r.type, color: '#587079' };
    const admin = isAdmin();
    const modify = canModify(r);
    const alertBox = affectsHome(r)
      ? '<p class="home-alert"><strong>This affects your home.</strong> Your home marker is inside the coverage area of this announcement.</p>'
      : '';

    const schedule = (r.startsAt || r.endsAt)
      ? `<dt>Schedule</dt><dd>${r.startsAt ? fmtDate.format(r.startsAt) : 'Not set'} to ${r.endsAt ? fmtDate.format(r.endsAt) : 'Not set'}</dd>`
      : '';

    const statusOptions = Object.entries(STATUSES)
      .map(([k, v]) => `<option value="${k}"${k === r.status ? ' selected' : ''}>${v}</option>`).join('');

    box.innerHTML = `
      <div class="detail">
        <button type="button" class="back" data-action="back">${state.from === 'dashboard' ? 'Back to dashboard' : state.from === 'insights' ? 'Back to insights' : state.from === 'history' ? 'Back to history' : 'Back to all reports'}</button>

        <div class="detail-head" style="--c:${t.color}">
          <h2>${esc(r.title)}</h2>
          <div class="pills">${codePill(r)}${statusPill(r)}${verifyPill(r)}${sourcePill(r)}</div>
        </div>

        ${alertBox}
        <p class="detail-desc">${r.desc ? esc(r.desc) : 'No details were added to this report.'}</p>

        <dl class="facts">
          <dt>Type</dt><dd>${esc(t.label)}</dd>
          <dt>Barangay</dt><dd>${esc(r.area)}</dd>
          <dt>Coordinates</dt><dd>${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}</dd>
          <dt>Posted by</dt><dd>${esc(r.author || 'Anonymous resident')}</dd>
          <dt>Posted</dt><dd>${fmtDate.format(r.createdAt)} (${ago(r.createdAt)})</dd>
          <dt>Verification</dt><dd>${r.verified ? 'Verified by an administrator' : 'Not yet verified'}</dd>
          ${isOwn(r) ? `<dt>Resolution</dt><dd>${esc(STATUSES[r.status])}</dd>` : ''}
          ${r.source === 'official' ? `<dt>Coverage</dt><dd>${esc(coverageLabel(r))}</dd>` : ''}
          ${admin && r.source === 'official' ? `<dt>Residents in area</dt><dd>${esc(affectedText(r))}</dd>` : ''}
          ${r.status === 'resolved' && r.resolvedAt ? `<dt>Resolved</dt><dd>${fmtDate.format(r.resolvedAt)}</dd>` : ''}
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
            ${r.verified && r.status !== 'resolved' ? '<button type="button" class="btn btn-small" data-action="resend-verified">Resend emails</button>' : ''}
          </div>
        </div>` : ''}

        <div class="actions">
          <button type="button" class="btn" data-action="focus">Show on map</button>
          ${admin && r.status !== 'resolved' ? '<button type="button" class="btn" data-action="resolve">Mark as resolved</button>' : ''}
          ${admin && r.status === 'resolved' ? '<button type="button" class="btn" data-action="reopen">Reopen</button>' : ''}
          ${admin ? '<button type="button" class="btn" data-action="history">View history</button>' : ''}
          ${admin && r.source === 'official' && ['scheduled', 'ongoing'].includes(r.status) ? '<button type="button" class="btn" data-action="renotify">Send notice again</button>' : ''}
          ${modify ? '<button type="button" class="btn" data-action="edit">Edit</button>' : ''}
          ${modify ? '<button type="button" class="btn btn-danger" data-action="delete">Delete</button>' : ''}
        </div>
      </div>`;
  }

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

  const TAB_IDS = { reports: 'tabReports', insights: 'tabInsights', dashboard: 'tabDashboard', history: 'tabHistory' };
  const VIEW_IDS = { reports: 'viewReports', detail: 'viewDetail', insights: 'viewInsights', dashboard: 'viewDashboard', history: 'viewHistory' };

  function activate(view) {
    const tab = view === 'detail' ? state.from : view;
    Object.entries(VIEW_IDS).forEach(([k, id]) => { const el = $('#' + id); if (el) el.hidden = k !== view; });
    Object.entries(TAB_IDS).forEach(([k, id]) => {
      const on = k === tab;
      const el = $('#' + id);
      if (!el) return;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', String(on));
    });
    state.view = view;
    $('#panel').scrollTop = 0;
  }

  function showView(name) {
    if (name === 'dashboard' && !currentUser()) name = 'reports';
    if (name === 'history' && !isAdmin()) name = 'reports';
    if (name === 'detail') name = state.from;
    state.selectedId = null;
    activate(name);
    if (name === 'reports') renderList();
    if (name === 'insights') renderInsights();
    if (name === 'dashboard') renderDashboard();
    if (name === 'history') renderHistory();
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
    if (state.view === 'history') renderHistoryBody();
  }

  function reportRow(r, actions = '') {
    const t = TYPES[r.type] || { label: r.type, color: '#587079' };
    return `
      <div class="queue-item" style="--c:${t.color}">
        <button type="button" class="queue-main" data-action="open" data-id="${esc(r.id)}">
          <strong>${esc(r.title)}</strong>
          <span>${esc(t.label)} in ${esc(r.area)}, ${ago(r.createdAt)}</span>
        </button>
        <div class="pills">${codePill(r)}${statusPill(r)}${verifyPill(r)}${sourcePill(r)}</div>
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

  function noteRow(n) {
    return `
      <div class="notice-item${n.read ? '' : ' is-unread'}">
        <button type="button" class="queue-main" data-action="notif-open" data-nid="${esc(n.id)}" data-rid="${esc(n.reportId)}">
          <strong>${esc(n.message)}</strong>
          <span>${ago(n.createdAt)}${n.read ? '' : ' &middot; New'}</span>
        </button>
      </div>`;
  }

  function residentDashboardHTML(u) {
    const byNewest = (a, b) => b.createdAt - a.createdAt;
    const mine = db.reports.filter(isOwn).sort(byNewest);
    const open = mine.filter((r) => r.status !== 'resolved').length;
    const verified = mine.filter((r) => r.verified).length;
    const resolved = mine.filter((r) => r.status === 'resolved').length;

    const current = db.reports.filter((r) => r.status !== 'resolved');
    const advisories = current.filter((r) => r.source === 'official').sort(byNewest);
    const communityOpen = current.filter((r) => r.source !== 'official').length;
    const near = openReportsNearHome();
    const unread = unreadNotes().length;

    const noteRows = db.notifications.length
      ? db.notifications.slice(0, 5).map(noteRow).join('')
      : '<p class="empty-inline">No interruption notices for your home. You will see one here, and get an email, when a scheduled interruption covers your home marker.</p>';

    const mineRows = mine.length
      ? mine.slice(0, 3).map((r) => reportRow(r,
          `<button type="button" class="btn btn-small" data-action="edit" data-id="${esc(r.id)}">Edit</button>
           <button type="button" class="btn btn-small btn-danger" data-action="delete" data-id="${esc(r.id)}">Delete</button>`)).join('')
        + (mine.length > 3 ? `<p style="margin:10px 0 0"><button type="button" class="link-btn" data-action="my-reports">See all ${mine.length} of my reports</button></p>` : '')
      : '<p class="empty-inline">You have not reported anything yet. Pin an issue on the map to start.</p>';

    const advisoryRows = advisories.length
      ? advisories.slice(0, 4).map((r) => reportRow(r)).join('')
      : '<p class="empty-inline">No active announcements from the water provider.</p>';

    return `
      <div class="insights">
        <h2>Hello, ${esc(u.name.split(' ')[0])}</h2>
        <p class="lead">Signed in as ${esc(u.email)}. Here is what is happening with water service.</p>

        ${statStrip([
          [advisories.length, 'Advisories'],
          [communityOpen, 'Open reports'],
          [near ? near.length : 0, 'Near my home'],
          [open, 'My open reports']
        ])}

        <div class="block">
          <h3>Notifications for my home ${unread ? `<span class="badge">${unread} new</span>` : ''}</h3>
          ${noteRows}
          ${unread ? '<p style="margin:10px 0 0"><button type="button" class="link-btn" data-action="notif-read-all">Mark all as read</button></p>' : ''}
        </div>

        <div class="block">
          <h3>Quick access</h3>
          <div class="insight-actions">
            <button type="button" class="btn" data-action="my-reports">My reports (${mine.length})</button>
            <button type="button" class="btn" data-action="all-reports">All reports</button>
            <button type="button" class="btn" data-action="map">Open map</button>
            <button type="button" class="btn btn-primary" data-action="new">Report an issue</button>
          </div>
        </div>

        <div class="block">
          <h3>Current announcements</h3>
          ${advisoryRows}
        </div>

        <div class="block">
          <h3>My latest reports</h3>
          <p class="lead" style="margin:0 0 6px">${verified} verified, ${resolved} resolved.</p>
          ${mineRows}
        </div>

        <div class="insight-actions">
          <button type="button" class="btn" data-action="change-home">Change my home</button>
          <button type="button" class="btn" data-action="insights">See area statistics</button>
        </div>
      </div>`;
  }

  function adminDashboardHTML(u) {
    const now = Date.now();
    const rs = db.reports;
    const pending = rs.filter((r) => r.source === 'community' && !r.verified && r.status !== 'resolved');
    const verifiedN = rs.filter((r) => r.verified).length;
    const resolvedN = rs.filter((r) => r.status === 'resolved').length;
    const active = rs.filter((r) => r.status === 'ongoing' || r.status === 'reported').length;
    const upcoming = rs
      .filter((r) => r.status === 'scheduled' && !(r.endsAt && r.endsAt < now))
      .sort((a, b) => (a.startsAt || Infinity) - (b.startsAt || Infinity));
    const ongoing = rs.filter((r) => r.status === 'ongoing').sort((a, b) => b.createdAt - a.createdAt);
    const live = [...ongoing, ...upcoming];

    const queueRows = pending.length
      ? pending.sort((a, b) => b.createdAt - a.createdAt).map((r) => reportRow(r,
          `<button type="button" class="btn btn-small btn-primary" data-action="verify" data-id="${esc(r.id)}">Verify</button>
           <button type="button" class="btn btn-small btn-danger" data-action="delete" data-id="${esc(r.id)}">Remove</button>`)).join('')
      : '<p class="empty-inline">Nothing to review. New community reports will show up here.</p>';

    const liveRows = live.length
      ? live.map((r) => reportRow(r,
          `<button type="button" class="btn btn-small" data-action="resolve" data-id="${esc(r.id)}">Mark as resolved</button>
           <button type="button" class="btn btn-small" data-action="edit" data-id="${esc(r.id)}">Edit</button>`)).join('')
      : '<p class="empty-inline">No ongoing or upcoming interruptions right now.</p>';

    return `
      <div class="insights">
        <h2>Admin dashboard</h2>
        <p class="lead">Signed in as ${esc(u.name)}. Review resident reports and manage announcements.</p>

        <div class="stat-strip stat-strip-3">
          ${[[rs.length, 'Total reports'], [pending.length, 'Pending verification'], [verifiedN, 'Verified reports'],
             [resolvedN, 'Resolved reports'], [upcoming.length, 'Upcoming interruptions'], [active, 'Active now']]
            .map(([n, label]) => `<div class="stat"><b>${n}</b><span>${esc(label)}</span></div>`).join('')}
        </div>

        <div class="block">
          <h3>Pending verification</h3>
          ${queueRows}
        </div>

        <div class="block">
          <h3>Ongoing and upcoming interruptions</h3>
          ${liveRows}
        </div>

        <div class="insight-actions">
          <button type="button" class="btn btn-primary" data-action="announce">Post announcement</button>
          <button type="button" class="btn" data-action="history">Report history</button>
          <button type="button" class="btn" data-action="test-mail">Send test email</button>
          <button type="button" class="btn" data-action="insights">See area statistics</button>
          <button type="button" class="btn" data-action="export">Download records (CSV)</button>
        </div>
      </div>`;
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
      if (!(await removeReport(r.id))) return;
      return refresh();
    }
    if (a === 'verify' && r && isAdmin()) {
      if (!(await withBusy('Verifying and emailing residents', () => updateReport(r.id, { verified: '1' })))) return;
      verifyNotice();
      return refresh();
    }
    if (a === 'resolve' && r && isAdmin()) {
      if (!(await confirmAction({ title: 'Mark as resolved?', text: 'It leaves the active map but stays in the report history.', confirmText: 'Mark as resolved', danger: false }))) return;
      if (!(await updateReport(r.id, { status: 'resolved' }))) return;
      toast('Marked as resolved.');
      return refresh();
    }
    if (a === 'notif-open') {
      const n = db.notifications.find((x) => String(x.id) === b.dataset.nid);
      if (n && !n.read) { n.read = true; markNotes({ action: 'read', id: n.id }); renderAuth(); }
      const rep = getReport(b.dataset.rid);
      if (rep) return selectReport(rep.id);
      return toast('That announcement is no longer available.', 'info');
    }
    if (a === 'notif-read-all') {
      if (!(await markNotes({ action: 'read_all' }))) return;
      db.notifications.forEach((n) => { n.read = true; });
      return refresh();
    }
    if (a === 'my-reports') return openReportsTab({ scope: 'mine' });
    if (a === 'all-reports') return openReportsTab();
    if (a === 'map') {
      focusHome();
      const wrap = $('.mapwrap');
      if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (a === 'change-home' && isResident()) return beginHomeSetup();
    if (a === 'new') return beginNewReport();
    if (a === 'announce' && isAdmin()) return beginNewReport({ official: true });
    if (a === 'insights') return showView('insights');
    if (a === 'history' && isAdmin()) return showView('history');
    if (a === 'test-mail' && isAdmin()) {
      const res = await Swal.fire({
        title: 'Send a test email',
        text: 'Checks that residents can receive code red and interruption emails.',
        input: 'email',
        inputPlaceholder: 'you@gmail.com',
        showCancelButton: true,
        confirmButtonText: 'Send'
      });
      if (!res.isConfirmed || !res.value) return;
      try {
        const data = await api('forms/test_mail.php', { to: res.value });
        return Swal.fire({ icon: 'success', title: 'Email sent', text: data.message, confirmButtonText: 'OK' });
      } catch (err) {
        return Swal.fire({ icon: 'error', title: 'Email not sent', text: errMsg(err), confirmButtonText: 'OK' });
      }
    }
    if (a === 'export') return exportCSV();
  }

  function renderAuth() {
    const u = currentUser();
    const admin = !!u && u.role === 'admin';

    $('#btnAnnounce').hidden = !admin;
    const unread = admin ? 0 : unreadNotes().length;
    $('#tabDashboard').textContent = admin ? 'Admin dashboard' : (unread ? `My dashboard (${unread})` : 'My dashboard');

    $('#authArea').innerHTML = u ? `
      <div class="user-chip"><strong>${esc(u.name)}</strong><span>${admin ? 'Administrator' : esc(u.email)}</span></div>
      <button type="button" class="btn btn-ghost-light btn-small" data-auth="logout">Log out</button>` : '';
  }

  function logout() {
    try {
      sessionStorage.removeItem(CONFIG.sessionKey);
      sessionStorage.removeItem(CONFIG.welcomeKey);
    } catch (e) { }
    location.replace('index.html');
  }

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
    if ($('#radiusField')) $('#radiusField').hidden = !$('#rOfficial').checked;
    updateGeoUi();
  }

  function openReportForm({ report = null, lat, lng, official = false, keepGeo = false } = {}) {
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

    const statusKeys = admin ? Object.keys(STATUSES) : ['reported', 'ongoing', 'resolved'];
    fillSelect($('#rStatus'), statusKeys.map((k) => [k, STATUSES[k]]),
      report?.status || (official ? 'scheduled' : 'reported'));
    $('#rStatusField').hidden = !(admin || editing);
    if ($('#codeRedField')) {
      $('#codeRedField').hidden = !admin;
      $('#rCodeRed').checked = !!report?.codeRed;
    }

    $('#officialBox').hidden = !admin;
    $('#rOfficial').checked = editing ? report.source === 'official' : official;
    $('#rStarts').value = toLocalInput(report?.startsAt);
    $('#rEnds').value = toLocalInput(report?.endsAt);
    if ($('#rRadius')) $('#rRadius').value = report?.radius || 1000;
    if (!keepGeo) {
      state.draftGeo = report?.geofence || null;
      if ($('#rGeoPolygon')) { $('#rGeoPolygon').checked = !!state.draftGeo; $('#rGeoCircle').checked = !state.draftGeo; }
    }
    toggleScheduleRow();

    $('#reportError').hidden = true;
    updateLocText();
    setDraftMarker(state.draft.lat, state.draft.lng);
    updateGeoUi();

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
      official: $('#rOfficial').checked, starts: $('#rStarts').value, ends: $('#rEnds').value,
      radius: $('#rRadius') ? $('#rRadius').value : '',
      geo: $('#rGeoPolygon') ? $('#rGeoPolygon').checked : false,
      codeRed: $('#rCodeRed') ? $('#rCodeRed').checked : false
    };
    startPlacing((lat, lng) => {
      openReportForm({ report: editing, lat, lng, official: snapshot.official, keepGeo: true });
      $('#rType').value = snapshot.type;
      $('#rTitleInput').value = snapshot.title;
      $('#rDesc').value = snapshot.desc;
      $('#rStatus').value = snapshot.status;
      $('#rOfficial').checked = snapshot.official;
      $('#rStarts').value = snapshot.starts;
      $('#rEnds').value = snapshot.ends;
      if ($('#rRadius')) $('#rRadius').value = snapshot.radius;
      if ($('#rGeoPolygon')) { $('#rGeoPolygon').checked = snapshot.geo; $('#rGeoCircle').checked = !snapshot.geo; }
      if ($('#rCodeRed')) $('#rCodeRed').checked = snapshot.codeRed;
      toggleScheduleRow();
    });
  }

  async function onReportSubmit(e) {
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

    const radius = Number($('#rRadius') ? $('#rRadius').value : 1000);
    if (official && (!Number.isInteger(radius) || radius < 100 || radius > 10000)) {
      return showError('reportError', 'The coverage radius must be a whole number from 100 to 10000 meters.');
    }

    const polygonOn = official && !!$('#rGeoPolygon') && $('#rGeoPolygon').checked;
    if (polygonOn && !(state.draftGeo && state.draftGeo.points.length >= 3)) {
      return showError('reportError', 'Draw the coverage area on the map first, or choose the circle option.');
    }

    const editing = !!state.editingId;
    const payload = {
      action: editing ? 'update' : 'create',
      type: $('#rType').value,
      area: $('#rArea').value,
      title,
      desc: $('#rDesc').value.trim(),
      lat: state.draft.lat,
      lng: state.draft.lng
    };
    if (editing) payload.id = state.editingId;
    if (!$('#rStatusField').hidden) payload.status = $('#rStatus').value;
    if (admin) {
      payload.official = official ? '1' : '0';
      payload.radius = official ? String(radius) : '';
      payload.geofence = polygonOn ? JSON.stringify(state.draftGeo) : '';
      payload.codeRed = $('#rCodeRed') && $('#rCodeRed').checked ? '1' : '0';
      payload.startsAt = official && startsAt ? startsAt : '';
      payload.endsAt = official && endsAt ? endsAt : '';
    }

    const btn = $('#reportSubmit');
    btn.disabled = true;
    try {
      const data = await api(API.reports, payload);
      const saved = data.report;
      const i = db.reports.findIndex((x) => x.id === saved.id);
      if (i >= 0) db.reports[i] = saved; else db.reports.push(saved);

      toast(editing ? 'Changes saved.' : (official ? 'Announcement posted.' : 'Report submitted. An admin can verify it.'));
      clearDraftMarker();
      state.draft = null;
      state.draftGeo = null;
      $('#reportDialog').close();
      refresh();
      selectReport(saved.id, { fly: true });
    } catch (err) {
      showError('reportError', errMsg(err));
    } finally {
      btn.disabled = false;
    }
  }

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
      if (!(await removeReport(r.id))) return;
      showView(state.from);
      refresh();
    }
    if (action === 'resolve' && isAdmin()) {
      if (!(await confirmAction({ title: 'Mark as resolved?', text: 'It leaves the active map but stays in the report history.', confirmText: 'Mark as resolved', danger: false }))) return;
      const saved = await updateReport(r.id, { status: 'resolved' });
      if (!saved) return;
      toast('Marked as resolved.');
      return refresh();
    }
    if (action === 'reopen' && isAdmin()) return reopenReport(r.id);
    if (action === 'history' && isAdmin()) return showReportHistory(r);
    if (action === 'resend-verified' && isAdmin()) {
      try {
        const data = await withBusy('Sending emails', () => api(API.reports, { action: 'email_verified', id: r.id }));
        toast(data.message, /could not be sent/.test(data.message) ? 'warning' : (data.emailed ? 'success' : 'info'));
      } catch (err) { toast(errMsg(err), 'error'); }
      return;
    }
    if (action === 'renotify' && isAdmin()) {
      try {
        const data = await api(API.reports, { action: 'notify', id: r.id });
        toast(data.message, data.notified ? 'success' : 'info');
      } catch (err) { toast(errMsg(err), 'error'); }
      return;
    }
    if (action === 'toggle-verify' && isAdmin()) {
      const saved = r.verified
        ? await updateReport(r.id, { verified: '0' })
        : await withBusy('Verifying and emailing residents', () => updateReport(r.id, { verified: '1' }));
      if (!saved) return;
      if (saved.verified) verifyNotice(); else toast('Verification removed.');
      refresh();
    }
  }

  async function onDetailChange(e) {
    if (e.target.id !== 'adminStatus' || !isAdmin()) return;
    const r = getReport(state.selectedId);
    if (!r) return;
    if (e.target.value === 'resolved' &&
        !(await confirmAction({ title: 'Mark as resolved?', text: 'It leaves the active map but stays in the report history.', confirmText: 'Mark as resolved', danger: false }))) {
      return refresh();
    }
    const saved = await updateReport(r.id, { status: e.target.value });
    if (!saved) return refresh();
    toast(`Status changed to ${STATUSES[saved.status].toLowerCase()}.`);
    refresh();
  }

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

  const homeLayer = L.layerGroup().addTo(map);

  let homeGeo = null;

  function baseHomeArea() {
    const u = currentUser();
    if (!u || u.role === 'admin' || !u.address) return null;
    const name = String(u.address).split(',')[0].trim().toLowerCase();
    return AREAS.find((a) => a.name.toLowerCase() === name) || null;
  }

  let myHome = null;

  async function fetchMyHome() {
    const data = await api(API.home, { action: 'get' });
    return data.home ? { lat: +data.home.lat, lng: +data.home.lng } : null;
  }

  async function saveHome(lat, lng) {
    const data = await api(API.home, { action: 'save', lat, lng });
    return { lat: +data.home.lat, lng: +data.home.lng };
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
    try { localStorage.setItem(CONFIG.geoKey, JSON.stringify(c)); } catch (e) { }
  }
  const inBacolod = (lat, lng) => lat > 10.55 && lat < 10.80 && lng > 122.84 && lng < 123.04;

  function ringCentroid(ring) {
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

    const hm = L.marker([a.lat, a.lng], {
      interactive: true,
      draggable: isResident(),
      keyboard: false,
      icon: homeIcon(),
      title: 'Your home'
    }).addTo(homeLayer);
    if (isResident()) {
      hm.bindTooltip('Your home. Drag to move it.', { direction: 'top', offset: [0, -40] });
      hm.on('dragstart', () => { state.draggingHome = true; });
      hm.on('dragend', () => moveHomeByDrag(hm));
    }
  }

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
    const box = L.latLng(a.lat, a.lng).toBounds(CONFIG.geofenceRadius * 2);
    map.fitBounds(box, { padding: [30, 30] });
  }

  function welcome() {
    const u = currentUser();
    if (!u) return;
    try {
      if (sessionStorage.getItem(CONFIG.welcomeKey) === String(u.id)) return;
      sessionStorage.setItem(CONFIG.welcomeKey, String(u.id));
    } catch (e) { }

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
    const unread = unreadNotes().length;
    const where = a
      ? `<p style="margin:0 0 8px">Your home in <b>${esc(a.name)}</b> is marked on the map with a ${CONFIG.geofenceRadius / 1000} km geofence.</p>
         <p style="margin:0">${near.length
           ? `${near.length} open report${near.length === 1 ? '' : 's'} inside your geofence.`
           : 'No open reports inside your geofence.'}</p>
         ${unread ? `<p style="margin:8px 0 0"><b>${unread}</b> interruption notice${unread === 1 ? '' : 's'} cover${unread === 1 ? 's' : ''} your home. Check your dashboard.</p>` : ''}`
      : '<p style="margin:0">We could not place your address on the map.</p>';

    return Swal.fire({
      icon: (near && near.length) || unread ? 'warning' : 'success',
      title: `Welcome, ${esc(u.name.split(' ')[0])}`,
      html: where,
      confirmButtonText: 'View map'
    });
  }

  let homeDraft = null;
  let homeBanner = null;

  function isResident() {
    const u = currentUser();
    return !!u && u.role !== 'admin';
  }

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

    const base = baseHomeArea();
    if (base) map.setView([base.lat, base.lng], 15);
    geocodeHome()
      .then(() => {
        if (homeGeo && state.settingHome && !homeDraft) map.setView([homeGeo.lat, homeGeo.lng], 16);
      })
      .catch(() => { });
  }

  function stopHomeSetup() {
    state.settingHome = false;
    $('#map').classList.remove('is-placing');
    if (homeBanner) homeBanner.hidden = true;
    if (homeDraft) { map.removeLayer(homeDraft); homeDraft = null; }
  }

  async function askHomeConfirm(lat, lng) {
    const moving = !!myHome;
    const dist = moving ? Math.round(haversine(myHome.lat, myHome.lng, lat, lng)) : 0;
    const res = await Swal.fire({
      icon: 'question',
      title: moving ? 'Move your home marker?' : 'Set this as your home?',
      html: moving
        ? `<p style="margin:0 0 6px">New spot: ${lat.toFixed(5)}, ${lng.toFixed(5)}<br>About ${dist} m from your current home.</p>
           <p style="margin:0;font-size:14px;color:#587079">Interruption notices will follow the new location.</p>`
        : `<p style="margin:0">${lat.toFixed(5)}, ${lng.toFixed(5)}</p>`,
      showCancelButton: true,
      confirmButtonText: moving ? 'Yes, move my home' : 'Yes, this is my home',
      cancelButtonText: moving ? 'Keep current home' : 'Choose again',
      allowOutsideClick: false,
      reverseButtons: true
    });
    return res.isConfirmed;
  }

  async function commitHome(lat, lng, { first = false } = {}) {
    try {
      myHome = await saveHome(lat, lng);
    } catch (err) {
      await Swal.fire({ icon: 'error', title: 'Could not save your home', text: errMsg(err), confirmButtonText: 'OK' });
      if (homeDraft) { map.removeLayer(homeDraft); homeDraft = null; }
      return false;
    }
    stopHomeSetup();
    lockApp(false);
    try { await pollNotes(); } catch (e) { }
    refresh();
    renderLegend();
    focusHome();
    if (first) welcome(); else toast('Home updated.');
    return true;
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

    const ok = await askHomeConfirm(lat, lng);
    state.confirmingHome = false;

    if (!ok) {
      map.removeLayer(homeDraft);
      homeDraft = null;
      return;
    }
    await commitHome(lat, lng, { first: state.forceHome });
  }

  async function moveHomeByDrag(marker) {
    const old = myHome;
    const p = marker.getLatLng();
    try {
      if (!old) return;
      if (!inBacolod(p.lat, p.lng)) {
        marker.setLatLng([old.lat, old.lng]);
        await Swal.fire({ icon: 'warning', title: 'Outside Bacolod City', text: 'Pick a spot inside Bacolod City.', confirmButtonText: 'OK' });
        return;
      }
      state.confirmingHome = true;
      const ok = await askHomeConfirm(p.lat, p.lng);
      state.confirmingHome = false;
      if (!ok) { marker.setLatLng([old.lat, old.lng]); return; }
      if (!(await commitHome(p.lat, p.lng))) marker.setLatLng([old.lat, old.lng]);
    } finally {
      state.confirmingHome = false;
      state.draggingHome = false;
    }
  }

  map.on('click', (e) => {
    if (state.settingHome) chooseHome(e.latlng.lat, e.latlng.lng);
  });

  const usersLayer = L.layerGroup().addTo(map);
  const userMarkers = new Map();
  let userHomes = [];

  async function loadUserHomes() {
    const data = await api(API.home, { action: 'list' });
    userHomes = data.homes;
  }

  function renderUserHomes() {
    usersLayer.clearLayers();
    userMarkers.clear();
    if (!isAdmin()) return;

    userHomes.forEach((h) => {
      const marker = L.marker([h.lat, h.lng], { icon: homeIcon(), title: h.name });
      marker.bindPopup(
        `<div class="popup-title">${esc(h.name)}</div>` +
        `<div class="popup-sub">@${esc(h.username)}<br>${esc(h.address)}</div>`,
        { closeButton: false }
      );
      marker.addTo(usersLayer);
      userMarkers.set(String(h.id), marker);
    });
  }

  function initUserSearch() {
    if (!isAdmin()) return;

    const box = document.createElement('div');
    box.className = 'map-search';
    box.innerHTML = `
      <label class="sr-only" for="userSearch">Search residents</label>
      <input type="search" id="userSearch" placeholder="Search a resident or barangay" autocomplete="off"
             role="combobox" aria-expanded="false" aria-controls="userSuggest" aria-autocomplete="list">
      <ul class="suggest" id="userSuggest" role="listbox" hidden></ul>`;
    $('.mapwrap').appendChild(box);

    const input = $('#userSearch');
    const list = $('#userSuggest');
    let items = [];
    let active = -1;
    let timer = null;
    let ticket = 0;

    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      active = -1;
    }

    function setActive(i) {
      active = i;
      [...list.children].forEach((li, n) => li.classList.toggle('is-active', n === i));
    }

    function render() {
      if (!items.length) {
        list.innerHTML = '<li class="suggest-empty">No residents found.</li>';
      } else {
        list.innerHTML = items.map((r, i) => `
          <li role="option" data-i="${i}" class="${r.hasHome ? '' : 'no-home'}">
            <strong>${esc(r.name)}</strong>
            <span>@${esc(r.username)} &middot; ${esc(r.address)}</span>
            ${r.hasHome ? '' : '<em>No home set yet</em>'}
          </li>`).join('');
      }
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      active = -1;
    }

    async function search() {
      const q = input.value.trim();
      if (!q) { items = []; return close(); }
      const mine = ++ticket;
      try {
        const data = await api(API.searchUsers, { q });
        if (mine !== ticket) return;
        items = data.results;
        render();
      } catch (err) {
        if (mine === ticket) { items = []; close(); toast(errMsg(err), 'error'); }
      }
    }

    async function choose(i) {
      const r = items[i];
      if (!r) return;
      input.value = r.name;
      close();
      if (!r.hasHome) return toast(`${r.name} has not set a home yet.`, 'info');

      if (!userMarkers.has(String(r.id))) {
        try { await loadUserHomes(); renderUserHomes(); } catch (e) { }
      }
      map.flyTo([r.lat, r.lng], 17, { duration: 0.8 });
      map.once('moveend', () => userMarkers.get(String(r.id))?.openPopup());
    }

    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 250); });
    input.addEventListener('focus', () => { if (items.length && input.value.trim()) render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') return close();
      if (list.hidden) return;
      const n = items.length;
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); setActive((active + 1) % n); }
      else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setActive((active - 1 + n) % n); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(active >= 0 ? active : 0); }
    });
    list.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li[data-i]');
      if (li) { e.preventDefault(); choose(+li.dataset.i); }
    });
    document.addEventListener('click', (e) => { if (!box.contains(e.target)) close(); });
  }

  async function loadLog() {
    const data = await api(API.log, { action: 'list', limit: '300' });
    db.log = data.log;
  }

  async function reopenReport(id) {
    const r = getReport(id);
    if (!r) return;
    const next = r.source === 'official' ? 'scheduled' : 'reported';
    if (!(await confirmAction({
      title: 'Reopen this report?',
      text: `It goes back on the active map as ${STATUSES[next].toLowerCase()}.`,
      confirmText: 'Reopen', danger: false
    }))) return;
    if (!(await updateReport(id, { status: next }))) return;
    toast('Report reopened.');
    if (state.view === 'history' && state.history.tab === 'log') await loadLog().catch(() => {});
    refresh();
  }

  function logText(e) {
    const s = (k) => STATUSES[k] || k;
    switch (e.action) {
      case 'created':    return `Created (${e.to || 'report'})`;
      case 'status':     return `Status changed from ${s(e.from)} to ${s(e.to)}`;
      case 'verified':   return 'Verified';
      case 'unverified': return 'Verification removed';
      case 'official':   return `Changed from ${e.from} to ${e.to}`;
      case 'geofence':   return `Coverage changed: ${e.from} to ${e.to}`;
      case 'codered':    return e.to === '1' ? 'Marked as code red' : 'Code red removed';
      case 'edited':     return 'Details edited';
      case 'notified':   return `Notice sent to ${e.to} resident${e.to === '1' ? '' : 's'}`;
      case 'deleted':    return 'Deleted';
      default:           return e.action;
    }
  }

  async function showReportHistory(r) {
    let entries = [];
    try {
      const data = await api(API.log, { action: 'list', report_id: r.id });
      entries = data.log;
    } catch (err) { return toast(errMsg(err), 'error'); }

    const rows = entries.length
      ? entries.map((e) => `<li style="margin:0 0 8px"><b>${esc(logText(e))}</b><br>
          <span style="font-size:13px;color:#587079">${fmtDate.format(e.createdAt)} by ${esc(e.actor || 'unknown')}</span></li>`).join('')
      : '<li>No changes were recorded for this report yet.</li>';

    Swal.fire({
      title: 'Report history',
      html: `<p style="margin:0 0 10px;font-weight:600">${esc(r.title)}</p>
             <ul style="text-align:left;margin:0;padding-left:1.1em;max-height:320px;overflow:auto">${rows}</ul>`,
      confirmButtonText: 'Close'
    });
  }

  const histTime = (r) => r.resolvedAt || r.createdAt;

  function renderHistory() {
    const box = $('#viewHistory');
    if (!box) return;
    const h = state.history;
    box.innerHTML = `
      <div class="insights">
        <h2>Report history</h2>
        <p class="lead">Resolved reports leave the active map but stay stored here, with a log of every change.</p>

        <div class="seg" role="tablist" aria-label="History sections">
          <button type="button" class="seg-btn${h.tab === 'resolved' ? ' is-active' : ''}" data-action="hist-tab" data-tab="resolved">Resolved reports</button>
          <button type="button" class="seg-btn${h.tab === 'log' ? ' is-active' : ''}" data-action="hist-tab" data-tab="log">Activity log</button>
        </div>

        <div class="hist-controls">
          <label class="search"><span class="sr-only">Search history</span>
            <input type="search" id="hSearch" placeholder="Search by title, area, or person" value="${esc(h.q)}" autocomplete="off"></label>
          <div class="filter-row filter-row-2">
            <label class="date-field"><span>From</span><input type="date" id="hFrom" value="${esc(h.from)}"></label>
            <label class="date-field"><span>To</span><input type="date" id="hTo" value="${esc(h.to)}"></label>
          </div>
        </div>

        <div id="histBody"></div>
      </div>`;

    if (h.tab === 'log') {
      loadLog().then(renderHistoryBody).catch((err) => {
        const b = $('#histBody');
        if (b) b.innerHTML = `<p class="empty-inline">${esc(errMsg(err))}</p>`;
      });
    }
    renderHistoryBody();
  }

  function inHistRange(ms) {
    const { from, to } = state.history;
    if (from && ms < new Date(from + 'T00:00:00').getTime()) return false;
    if (to && ms > new Date(to + 'T23:59:59.999').getTime()) return false;
    return true;
  }

  function renderHistoryBody() {
    const body = $('#histBody');
    if (!body) return;
    const h = state.history;
    const needle = h.q.trim().toLowerCase();

    if (h.tab === 'resolved') {
      const items = db.reports
        .filter((r) => r.status === 'resolved')
        .filter((r) => inHistRange(histTime(r)))
        .filter((r) => !needle || `${r.title} ${r.desc} ${r.area} ${r.author || ''}`.toLowerCase().includes(needle))
        .sort((a, b) => histTime(b) - histTime(a));

      body.innerHTML = `<p class="lead" style="margin:0 0 6px">${items.length} resolved report${items.length === 1 ? '' : 's'}.</p>` +
        (items.length ? items.map((r) => {
          const t = TYPES[r.type] || { label: r.type, color: '#587079' };
          return `
            <div class="queue-item" style="--c:${t.color}">
              <button type="button" class="queue-main" data-action="open" data-id="${esc(r.id)}">
                <strong>${esc(r.title)}</strong>
                <span>${esc(t.label)} in ${esc(r.area)}. ${r.resolvedAt ? 'Resolved ' + fmtDate.format(r.resolvedAt) : 'Posted ' + fmtDate.format(r.createdAt)}</span>
              </button>
              <div class="pills">${verifyPill(r)}${sourcePill(r)}</div>
              <div class="queue-actions">
                <button type="button" class="btn btn-small" data-action="reopen" data-id="${esc(r.id)}">Reopen</button>
                <button type="button" class="btn btn-small" data-action="history" data-id="${esc(r.id)}">View log</button>
              </div>
            </div>`;
        }).join('') : '<p class="empty-inline">No resolved reports match.</p>');
      return;
    }

    const entries = db.log
      .filter((e) => inHistRange(e.createdAt))
      .filter((e) => !needle || `${e.title} ${e.actor} ${logText(e)}`.toLowerCase().includes(needle));

    body.innerHTML = `
      <div class="result-meta" style="margin:0 0 6px">
        <span>${entries.length} log entr${entries.length === 1 ? 'y' : 'ies'}</span>
        <button type="button" class="link-btn" data-action="export-log">Download log (CSV)</button>
      </div>` +
      (entries.length ? entries.map((e) => `
        <div class="log-row">
          <button type="button" class="queue-main" data-action="open" data-id="${esc(e.reportId)}">
            <strong>${esc(e.title || e.reportId)}</strong>
            <span>${esc(logText(e))}</span>
          </button>
          <span class="log-when">${fmtDate.format(e.createdAt)}<br>${esc(e.actor || '')}</span>
        </div>`).join('') : '<p class="empty-inline">No log entries match.</p>');
  }

  function exportLogCSV() {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['time', 'report', 'title', 'change', 'by'];
    const rows = db.log.map((e) => [new Date(e.createdAt).toISOString(), e.reportId, e.title, logText(e), e.actor].map(q).join(','));
    const blob = new Blob([[head.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pipesense-report-log.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function onHistoryClick(e) {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'hist-tab') { state.history.tab = b.dataset.tab; return renderHistory(); }
    if (a === 'export-log') return exportLogCSV();
    const r = b.dataset.id ? getReport(b.dataset.id) : null;
    if (a === 'open') {
      if (r) return selectReport(r.id);
      return toast('That report was deleted. Only its log entries remain.', 'info');
    }
    if (a === 'reopen' && r) return reopenReport(r.id);
    if (a === 'history' && r) return showReportHistory(r);
  }

  function onHistoryInput(e) {
    const h = state.history;
    if (e.target.id === 'hSearch') h.q = e.target.value;
    else if (e.target.id === 'hFrom') h.from = e.target.value;
    else if (e.target.id === 'hTo') h.to = e.target.value;
    else return;
    renderHistoryBody();
  }

  const geoLayer = L.layerGroup().addTo(map);
  let geoPts = [];
  let geoPoly = null;
  let geoDone = null;
  let geoBanner = null;

  function startGeoDraw(initial, done) {
    state.drawingGeo = true;
    geoPts = (initial || []).map((p) => [p[0], p[1]]);
    geoDone = done;
    $('#map').classList.add('is-placing');
    map.closePopup();
    showGeoBanner();
    redrawGeo();
    if (geoPts.length) map.fitBounds(L.latLngBounds(geoPts).pad(0.3));
    else if (state.draft) map.setView([state.draft.lat, state.draft.lng], 15);
  }

  function stopGeoDraw() {
    state.drawingGeo = false;
    $('#map').classList.remove('is-placing');
    geoLayer.clearLayers();
    geoPoly = null;
    if (geoBanner) geoBanner.hidden = true;
  }

  function redrawGeo() {
    geoLayer.clearLayers();
    geoPoly = null;
    if (geoPts.length >= 2) {
      const style = { color: '#c9443b', weight: 2, dashArray: '6 4', fillColor: '#c9443b', fillOpacity: 0.15, interactive: false };
      geoPoly = (geoPts.length >= 3 ? L.polygon(geoPts, style) : L.polyline(geoPts, style)).addTo(geoLayer);
    }
    geoPts.forEach((p, i) => {
      const h = L.marker(p, {
        draggable: true,
        keyboard: false,
        title: 'Drag to move this point. Right-click to remove it.',
        icon: L.divIcon({ className: 'geo-handle', html: '<span></span>', iconSize: [16, 16], iconAnchor: [8, 8] })
      }).addTo(geoLayer);
      h.on('drag', () => {
        const ll = h.getLatLng();
        geoPts[i] = [ll.lat, ll.lng];
        if (geoPoly) geoPoly.setLatLngs(geoPts);
      });
      h.on('dragend', updateGeoBanner);
      h.on('contextmenu', () => { geoPts.splice(i, 1); redrawGeo(); });
    });
    updateGeoBanner();
  }

  function showGeoBanner() {
    if (!geoBanner) {
      geoBanner = document.createElement('div');
      geoBanner.className = 'placing-banner';
      geoBanner.setAttribute('role', 'status');
      $('.mapwrap').appendChild(geoBanner);
      geoBanner.addEventListener('click', onGeoBannerClick);
    }
    geoBanner.innerHTML = `
      <strong>Draw the coverage area</strong>
      <span id="geoHint"></span>
      <button type="button" class="btn btn-small" data-geo="undo">Undo point</button>
      <button type="button" class="btn btn-small" data-geo="clear">Clear</button>
      <button type="button" class="btn btn-small btn-primary" data-geo="done" id="geoDone">Use this area</button>
      <button type="button" class="btn btn-small btn-quiet" data-geo="cancel">Cancel</button>`;
    geoBanner.hidden = false;
  }

  function updateGeoBanner() {
    const hint = $('#geoHint');
    if (!hint) return;
    const n = geoPts.length;
    const bad = n >= 4 && selfIntersects(geoPts);
    hint.textContent = bad ? 'The lines cross. Move a point so they do not.'
      : n < 3 ? `Click the map to add points (${n} so far, at least 3).`
      : `${n} points, about ${polyAreaKm2(geoPts).toFixed(2)} km\u00b2. Drag points to adjust.`;
    const done = $('#geoDone');
    if (done) done.disabled = n < 3 || bad;
  }

  function onGeoBannerClick(e) {
    const b = e.target.closest('[data-geo]');
    if (!b) return;
    const act = b.dataset.geo;
    if (act === 'undo') { geoPts.pop(); return redrawGeo(); }
    if (act === 'clear') { geoPts = []; return redrawGeo(); }
    if (act === 'cancel') {
      const cb = geoDone;
      stopGeoDraw();
      if (cb) cb(null);
      return;
    }
    if (act === 'done') {
      if (geoPts.length < 3 || selfIntersects(geoPts)) return;
      const pts = geoPts.map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]);
      const cb = geoDone;
      stopGeoDraw();
      if (cb) cb(pts);
    }
  }

  map.on('click', (e) => {
    if (!state.drawingGeo) return;
    if (!inBacolod(e.latlng.lat, e.latlng.lng)) return toast('Keep the area inside Bacolod City.', 'warning');
    if (geoPts.length >= 200) return toast('That is the most points one area can have.', 'warning');
    geoPts.push([e.latlng.lat, e.latlng.lng]);
    redrawGeo();
  });

  function captureForm() {
    return {
      type: $('#rType').value, area: $('#rArea').value, title: $('#rTitleInput').value,
      desc: $('#rDesc').value, status: $('#rStatus').value,
      official: $('#rOfficial').checked, starts: $('#rStarts').value, ends: $('#rEnds').value,
      radius: $('#rRadius') ? $('#rRadius').value : '',
      codeRed: $('#rCodeRed') ? $('#rCodeRed').checked : false
    };
  }

  function restoreForm(f) {
    $('#rType').value = f.type;
    $('#rArea').value = f.area;
    $('#rTitleInput').value = f.title;
    $('#rDesc').value = f.desc;
    $('#rStatus').value = f.status;
    $('#rOfficial').checked = f.official;
    $('#rStarts').value = f.starts;
    $('#rEnds').value = f.ends;
    if ($('#rRadius')) $('#rRadius').value = f.radius;
    if ($('#rCodeRed')) $('#rCodeRed').checked = f.codeRed;
    toggleScheduleRow();
  }

  function beginDrawArea() {
    if (!isAdmin() || !state.draft) return;
    const editing = state.editingId ? getReport(state.editingId) : null;
    const snapshot = captureForm();
    const pin = { ...state.draft };

    $('#reportDialog').close();
    startGeoDraw(state.draftGeo ? state.draftGeo.points : [], (pts) => {
      if (pts) state.draftGeo = { type: 'polygon', points: pts };
      openReportForm({ report: editing, lat: pin.lat, lng: pin.lng, official: snapshot.official, keepGeo: true });
      restoreForm(snapshot);
      if ($('#rGeoPolygon') && state.draftGeo) { $('#rGeoPolygon').checked = true; $('#rGeoCircle').checked = false; }
      updateGeoUi();
    });
  }

  function updateGeoUi() {
    const poly = $('#rGeoPolygon');
    if (!poly) return;
    const on = poly.checked;
    $('#circleRow').hidden = on;
    $('#polygonRow').hidden = !on;

    const g = state.draftGeo;
    $('#geoSummary').textContent = g
      ? `${g.points.length} points, about ${polyAreaKm2(g.points).toFixed(2)} km\u00b2`
      : 'No area drawn yet.';

    let text = '';
    const d = state.draft;
    if (isAdmin() && d && $('#rOfficial').checked && (!on || g)) {
      const n = affectedResidents({
        lat: d.lat, lng: d.lng,
        radius: Number($('#rRadius').value) || 1000,
        geofence: on ? g : null
      }).length;
      text = `${n} resident${n === 1 ? '' : 's'} with a home marker inside this area will be notified.`;
    }
    $('#geoAffected').textContent = text;
  }

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

  async function init() {
    if (!currentUser()) { location.replace('login.html'); return; }

    try {
      await loadReports();
      if (isResident()) {
        myHome = await fetchMyHome();
        await loadNotifications().catch(() => { db.notifications = []; });
        db.notifications.forEach((n) => seenNoteIds.add(n.id));
      } else {
        await loadUserHomes();
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not load data', text: errMsg(err), confirmButtonText: 'OK' });
    }

    fillSelect($('#fType'), [['', 'All types'], ...Object.entries(TYPES).map(([k, v]) => [k, v.label])], '');
    fillSelect($('#fStatus'), [['', 'All statuses'], ...Object.entries(STATUSES).filter(([k]) => !(isAdmin() && k === 'resolved'))], '');

    $('#fSearch').addEventListener('input', (e) => { state.filters.q = e.target.value; refresh({ keepView: true }); });
    $('#fType').addEventListener('change', (e) => { state.filters.type = e.target.value; refresh({ keepView: true }); });
    $('#fStatus').addEventListener('change', (e) => { state.filters.status = e.target.value; refresh({ keepView: true }); });
    $('#fVerify').addEventListener('change', (e) => { state.filters.verify = e.target.value; refresh({ keepView: true }); });

    if ($('#fArea')) fillSelect($('#fArea'), [['', 'All barangays'], ...AREAS.map((a) => [a.name, a.name])], '');
    [['#fScope', 'scope'], ['#fArea', 'area'], ['#fFrom', 'from'], ['#fTo', 'to']].forEach(([sel, key]) => {
      const el = $(sel);
      if (el) el.addEventListener('change', (e) => { state.filters[key] = e.target.value; refresh({ keepView: true }); });
    });
    $('#clearFilters').addEventListener('click', () => {
      state.filters = emptyFilters();
      syncFilterControls();
      refresh({ keepView: true });
    });

    $('#reportList').addEventListener('click', (e) => {
      const card = e.target.closest('[data-id]');
      if (card) selectReport(card.dataset.id);
    });
    $('#viewDetail').addEventListener('click', onDetailClick);
    $('#viewDetail').addEventListener('change', onDetailChange);
    $('#viewInsights').addEventListener('click', onInsightsClick);
    $('#viewDashboard').addEventListener('click', onDashboardClick);

    const vh = $('#viewHistory');
    if (vh) {
      vh.addEventListener('click', onHistoryClick);
      vh.addEventListener('input', onHistoryInput);
      vh.addEventListener('change', onHistoryInput);
    }
    const th = $('#tabHistory');
    if (th) th.addEventListener('click', () => showView('history'));

    if ($('#rGeoPolygon')) {
      $('#rGeoCircle').addEventListener('change', updateGeoUi);
      $('#rGeoPolygon').addEventListener('change', updateGeoUi);
      $('#rRadius').addEventListener('input', updateGeoUi);
      $('#btnDrawArea').addEventListener('click', beginDrawArea);
    }

    $('#tabReports').addEventListener('click', () => showView('reports'));
    $('#tabInsights').addEventListener('click', () => showView('insights'));
    $('#tabDashboard').addEventListener('click', () => showView('dashboard'));

    $('#btnNewReport').addEventListener('click', () => beginNewReport());
    $('#btnAnnounce').addEventListener('click', () => { if (isAdmin()) beginNewReport({ official: true }); });

    $('#authArea').addEventListener('click', (e) => {
      const b = e.target.closest('[data-auth]');
      if (!b) return;
      if (b.dataset.auth === 'logout') logout();
    });

    $('#reportForm').addEventListener('submit', onReportSubmit);
    $('#changePin').addEventListener('click', onChangePin);
    $('#rOfficial').addEventListener('change', toggleScheduleRow);
    $('#reportDialog').addEventListener('close', () => {
      if (!state.placing && !state.drawingGeo) clearDraftMarker();
    });

    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-close]');
      if (c) $('#' + c.dataset.close).close();
    });

    document.querySelectorAll('dialog').forEach((d) => {
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    });

    $('#placeCancel').addEventListener('click', () => { stopPlacing(); clearDraftMarker(); toast('Pin placement cancelled.', 'info'); });
    $('#placeUseMyLocation').addEventListener('click', useMyLocationForPin);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.placing) { stopPlacing(); clearDraftMarker(); }
    });

    $('#toggleHotspots').addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', String(on));
      e.currentTarget.textContent = on ? 'Hide frequently affected areas' : 'Show frequently affected areas';
      if (on) hotspotLayer.addTo(map); else map.removeLayer(hotspotLayer);
    });

    $('#btnLocate').addEventListener('click', () => map.locate({ setView: true, maxZoom: 16 }));
    if ($('#btnPosts')) $('#btnPosts').addEventListener('click', showAllPosts);
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
    renderUserHomes();
    initUserSearch();

    if (isResident() && !myHome) {
      lockApp(true);
      beginHomeSetup({ force: true });
    } else {
      try { focusHome(); } catch (e) { console.error('focusHome:', e); }
      map.invalidateSize();
      welcome();
    }

    setInterval(() => { if (!$('#viewReports').hidden) renderList(); }, 60000);

    async function pollData() {
      if (state.settingHome || state.confirmingHome || state.draggingHome || state.placing || $('#reportDialog').open) return;
      try {
        const before = JSON.stringify(db.reports);
        await loadReports();
        let changed = JSON.stringify(db.reports) !== before;
        if (isResident()) {
          const notesBefore = JSON.stringify(db.notifications);
          const fresh = await pollNotes();
          if (fresh || JSON.stringify(db.notifications) !== notesBefore) changed = true;
        }
        if (changed) refresh();
        if (isAdmin()) {
          const homesBefore = JSON.stringify(userHomes);
          await loadUserHomes();
          if (JSON.stringify(userHomes) !== homesBefore) renderUserHomes();
        }
      } catch (e) { }
    }
    setInterval(pollData, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pollData(); });
    window.addEventListener('focus', pollData);
  }

  init();
})();
