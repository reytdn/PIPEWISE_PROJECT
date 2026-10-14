const VIEW_FILES = [
  'admin_dashboard',
  'auth_area',
  'avatar',
  'cluster_icon',
  'detail',
  'draft_pin',
  'empty_inline',
  'geo_banner',
  'geo_handle',
  'history_log',
  'history_resolved',
  'history_view',
  'home_banner',
  'home_confirm',
  'home_icon_fallback',
  'insights',
  'legend',
  'map_attribution',
  'list_empty',
  'notice_item',
  'notice_list',
  'photo_preview',
  'pills',
  'popup',
  'profile',
  'profile_error',
  'queue_actions_live',
  'queue_actions_mine',
  'queue_actions_pending',
  'queue_item',
  'report_card',
  'report_log_dialog',
  'resident_dashboard',
  'select_options',
  'stat_strip',
  'suggest_empty',
  'suggest_items',
  'user_popup',
  'user_search',
  'welcome_admin',
  'welcome_resident'
];

function templateFailed(err) {
  const banner = document.getElementById('bootError');
  if (!banner) { console.error(err); return; }
  banner.textContent = 'PipeSense could not start: ' + err.message + '. Open this page from http://localhost/... with Apache running in Laragon.';
  banner.hidden = false;
}

function startApp() {
  'use strict';

  const CONFIG = {
    sessionKey: 'pipesense.user',
    center: [10.6713, 122.9511],
    zoom: 13,
    geofenceRadius: 1000,
    homeViewM: 1000,
    maxPhotoPx: 1600,
    homeIcon: { url: PipeMarkers.src('home') },
    geoKey: 'pipesense.geo.v3',
    welcomeKey: 'pipesense.welcomed',
    cityViewbox: '122.84,10.80,123.04,10.55'
  };

  const TYPES = {
    interruption: { label: 'Water interruption', color: '#c9443b' },
    maintenance:  { label: 'Maintenance',        color: '#d98e04' },
    pressure:     { label: 'Low pressure',       color: '#2f78a8' },
    quality:      { label: 'Water quality',      color: '#7a5ba6' }
  };

  const RANGES = {
    interruption: { narrow: 500, standard: 1000, wide: 2000 },
    maintenance:  { narrow: 300, standard: 800,  wide: 1500 },
    pressure:     { narrow: 200, standard: 500,  wide: 1000 },
    quality:      { narrow: 500, standard: 1500, wide: 3000 }
  };
  const RANGE_LABELS = { narrow: 'Narrower', standard: 'Standard', wide: 'Wider' };
  const rangeFor = (type, key) => (RANGES[type] || RANGES.interruption)[key];

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

  const qs = (sel, root = document) => root.querySelector(sel);

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
    if (g && g.type === 'rectangle' && g.bounds) {
      return lat >= g.bounds[0][0] && lat <= g.bounds[1][0] && lng >= g.bounds[0][1] && lng <= g.bounds[1][1];
    }
    if (g && g.type === 'polygon' && g.points && g.points.length >= 3) return pointInPoly(lat, lng, g.points);
    return haversine(r.lat, r.lng, lat, lng) <= (r.radius || CONFIG.geofenceRadius);
  }

  const geoKind = (g) => (g && g.type === 'rectangle' ? 'rectangle' : g && g.type === 'polygon' ? 'polygon' : 'circle');
  const clampLat = (v) => Math.min(10.799, Math.max(10.551, v));
  const clampLng = (v) => Math.min(123.039, Math.max(122.841, v));

  function rectSizeM(b) {
    return [haversine(b[0][0], b[0][1], b[0][0], b[1][1]), haversine(b[0][0], b[0][1], b[1][0], b[0][1])];
  }

  function defaultGeo(kind, lat, lng, radius) {
    const dLat = radius / 111320;
    const dLng = radius / (111320 * Math.cos(lat * Math.PI / 180));
    if (kind === 'rectangle') {
      return { type: 'rectangle', bounds: [
        [+clampLat(lat - dLat).toFixed(6), +clampLng(lng - dLng).toFixed(6)],
        [+clampLat(lat + dLat).toFixed(6), +clampLng(lng + dLng).toFixed(6)]
      ] };
    }
    if (kind === 'polygon') {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        pts.push([+clampLat(lat + dLat * Math.sin(a)).toFixed(6), +clampLng(lng + dLng * Math.cos(a)).toFixed(6)]);
      }
      return { type: 'polygon', points: pts };
    }
    return null;
  }

  function shiftGeo(g, dLat, dLng) {
    if (!g) return null;
    if (g.type === 'rectangle') {
      return { type: 'rectangle', bounds: g.bounds.map((p) => [+clampLat(p[0] + dLat).toFixed(6), +clampLng(p[1] + dLng).toFixed(6)]) };
    }
    return { type: 'polygon', points: g.points.map((p) => [+clampLat(p[0] + dLat).toFixed(6), +clampLng(p[1] + dLng).toFixed(6)]) };
  }

  function coverageLayer(r, style) {
    const g = r.geofence;
    if (g && g.type === 'rectangle' && g.bounds) return L.rectangle(g.bounds, style);
    if (g && g.type === 'polygon' && g.points.length >= 3) return L.polygon(g.points, style);
    if (r.radius) return L.circle([r.lat, r.lng], { ...style, radius: r.radius });
    return null;
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
      confirmButtonColor: danger ? '#c9443b' : '#08768b',
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
    log: 'forms/report_log.php',
    hotspots: 'forms/hotspots.php',
    profile: 'forms/profile.php'
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

  function api(url, fields = {}) {
    const u = currentUser();
    const hasFile = Object.values(fields).some((v) => v instanceof Blob);
    let data;
    if (hasFile) {
      data = new FormData();
      Object.entries(fields).forEach(([k, v]) => {
        if (v instanceof Blob) data.append(k, v, 'photo.jpg');
        else data.append(k, v == null ? '' : v);
      });
      if (u && u.token) data.set('token', u.token);
    } else {
      data = { ...fields };
      if (u && u.token) data.token = u.token;
    }

    return new Promise((resolve, reject) => {
      $.ajax({
        url: url,
        type: 'POST',
        data: data,
        dataType: 'text',
        processData: !hasFile,
        contentType: hasFile ? false : 'application/x-www-form-urlencoded; charset=UTF-8',

        success: function (response) {
          let res;
          try {
            res = JSON.parse(response);
          } catch (e) {
            console.error('JSON parse error:', e);
            reject(new Error('Unexpected reply from ' + url + ': ' + String(response).replace(/<[^>]*>/g, ' ').trim().slice(0, 160)));
            return;
          }

          if (res.status === 'success') {
            resolve(res);
            return;
          }

          if (res.code === 'not_logged_in') sessionExpired();

          const err = new Error(res.message || 'The request failed.');
          err.detail = res.detail;
          reject(err);
        },

        error: function () {
          reject(new Error('Error connecting to server. Make sure Apache and MySQL are running in Laragon.'));
        }
      });
    });
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
    Swal.fire({
      icon: 'warning',
      title: fresh.length === 1 ? 'Water service notice for your home' : `${fresh.length} water service notices for your home`,
      html: Tpl.render('notice_list', { items: fresh.slice(0, 5) }),
      confirmButtonText: 'View dashboard',
      showCancelButton: true,
      cancelButtonText: 'Close'
    }).then((res) => { if (res.isConfirmed) showView('dashboard'); });
  }

  let lastUpdate = { message: '', emailed: 0 };

  function resolvedNotice(fallback = 'Marked as resolved.') {
    const m = lastUpdate.message || fallback;
    toast(m, /could not be sent/.test(m) ? 'warning' : 'success');
  }

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
    const el = qs('#' + id);
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
    if (!r.verified) return false;
    const h = homeArea();
    if (!h) return false;
    return reportCovers(r, h.lat, h.lng);
  }

  const state = {
    view: 'reports',
    from: 'reports',
    selectedId: null,
    filters: { q: '', type: '', status: '', verify: '', scope: '', from: '', to: '' },
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
  const streetTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: Tpl.render('map_attribution')
  }).addTo(map);
  const satelliteTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
  });

  const viewToggle = L.control({ position: 'bottomright' });
  viewToggle.onAdd = () => {
    const btn = L.DomUtil.create('button', 'view-toggle');
    btn.type = 'button';
    btn.textContent = 'Satellite';
    L.DomEvent.disableClickPropagation(btn);
    btn.addEventListener('click', () => {
      const toSatellite = !map.hasLayer(satelliteTiles);
      if (toSatellite) { map.removeLayer(streetTiles); satelliteTiles.addTo(map); }
      else { map.removeLayer(satelliteTiles); streetTiles.addTo(map); }
      btn.textContent = toSatellite ? 'Map' : 'Satellite';
      btn.classList.toggle('is-on', toSatellite);
    });
    return btn;
  };
  viewToggle.addTo(map);

  let clusterTotal = 0;

  function frequencyLevel(count) {
    const share = count / Math.max(clusterTotal, 1);
    if (share >= 0.50) return 5;
    if (share >= 0.30) return 4;
    if (share >= 0.15) return 3;
    if (share >= 0.05) return 2;
    return 1;
  }

  function clusterIcon(cluster) {
    const n = cluster.getChildCount();
    return L.divIcon({
      className: 'cluster-wrap',
      html: Tpl.render('cluster_icon', { cls: 'f' + frequencyLevel(n), count: n }),
      iconSize: [40, 40]
    });
  }

  function homeClusterIcon(cluster) {
    return L.divIcon({
      className: 'cluster-wrap',
      html: Tpl.render('cluster_icon', { cls: 'fh', count: cluster.getChildCount() }),
      iconSize: [40, 40]
    });
  }

  function unverifiedClusterIcon(cluster) {
    return L.divIcon({
      className: 'cluster-wrap',
      html: Tpl.render('cluster_icon', { cls: 'fu', count: cluster.getChildCount() }),
      iconSize: [40, 40]
    });
  }

  const clusterOptions = { maxClusterRadius: 60, disableClusteringAtZoom: 16, showCoverageOnHover: false };

  const markerLayer = L.markerClusterGroup({ ...clusterOptions, iconCreateFunction: clusterIcon }).addTo(map);
  const unverifiedLayer = L.markerClusterGroup({ ...clusterOptions, iconCreateFunction: unverifiedClusterIcon }).addTo(map);
  const plainLayer = L.layerGroup().addTo(map);
  const areaLayer = L.layerGroup().addTo(map);
  const hotspotLayer = L.layerGroup();

  function revealMarker(group, marker, done) {
    if (!marker) return;
    if (!group.hasLayer(marker)) { if (marker._map && done) done(); return; }
    if (group.getVisibleParent(marker) === marker) { if (done) done(); return; }
    group.zoomToShowLayer(marker, () => { if (done) done(); });
  }
  function revealReport(id) {
    const m = markers.get(id);
    if (!m) return;
    const group = unverifiedLayer.hasLayer(m) ? unverifiedLayer : markerLayer;
    revealMarker(group, m, () => m.openPopup());
  }
  const markers = new Map();
  let draftMarker = null;
  let meMarker = null;


  function pinIcon(r) {
    const key = r.verified && TYPES[r.type] ? r.type : 'unverified';
    const sel = r.id === state.selectedId ? ' is-selected' : '';
    return PipeMarkers.divIcon(key, `pin-img st-${r.status}${sel}`);
  }

  function popupHTML(r) {
    return Tpl.render('popup', {
      photo: r.photo,
      title: r.title,
      typeLabel: TYPES[r.type]?.label,
      statusLabel: STATUSES[r.status],
      desc: r.desc
    });
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    unverifiedLayer.clearLayers();
    plainLayer.clearLayers();
    areaLayer.clearLayers();
    markers.clear();

    const shown = filteredReports('map');
    const groupable = (r) => r.status !== 'resolved' && (r.source === 'official' || r.verified);
    clusterTotal = shown.filter(groupable).length;
    const pendingGroup = (r) => r.status !== 'resolved' && r.source !== 'official' && !r.verified;
    const batch = [];
    const pendingBatch = [];

    shown.forEach((r) => {
      const m = L.marker([r.lat, r.lng], {
        icon: pinIcon(r),
        title: r.title,
        keyboard: true
      });
      m.bindPopup(popupHTML(r), { closeButton: false, maxWidth: 260, minWidth: 180 });
      m.on('popupopen', (ev) => {
        const img = ev.popup.getElement() && ev.popup.getElement().querySelector('.popup-photo');
        if (img && !img.complete) img.addEventListener('load', () => ev.popup.update());
      });
      m.on('click', () => { if (!state.drawingGeo) selectReport(r.id, { fly: false }); });
      markers.set(r.id, m);

      if (groupable(r)) batch.push(m);
      else if (pendingGroup(r)) pendingBatch.push(m);
      else m.addTo(plainLayer);
      if (groupable(r)) {
        const c = TYPES[r.type]?.color || '#587079';
        const layer = coverageLayer(r, {
          color: c, weight: 1.5, dashArray: '4 6',
          fillColor: c, fillOpacity: 0.09, interactive: false
        });
        if (layer) layer.addTo(areaLayer);
      }
    });

    markerLayer.addLayers(batch);
    unverifiedLayer.addLayers(pendingBatch);
  }

  const hot = { index: new Map(), data: null, sig: '' };
  const hotRenderer = L.canvas({ padding: 0.3 });
  const hotTip = L.tooltip({ direction: 'top', offset: [0, -4], opacity: 0.95 });

  const heatOpacity = (n) => Math.min(0.16 + (n - 2) * 0.14, 0.78);

  function hotSignature() {
    return JSON.stringify(db.reports.filter((r) => r.verified)
      .map((r) => [r.id, r.lat, r.lng, r.radius, r.geofence]));
  }

  async function loadHotspots() {
    try {
      const data = await api(API.hotspots, {});
      hot.data = data;
      hot.sig = hotSignature();
      hot.index = new Map();
      (data.cells || []).forEach(([lat, lng, n]) => {
        const i = Math.round((lat - data.south) / data.stepLat);
        const j = Math.round((lng - data.west) / data.stepLng);
        hot.index.set(i + ':' + j, n);
      });
      renderHotspots();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  }

  function renderHotspots() {
    hotspotLayer.clearLayers();
    const d = hot.data;
    if (!d || !d.cells || !d.cells.length) return;
    d.cells.forEach(([lat, lng, n]) => {
      L.rectangle([[lat, lng], [lat + d.stepLat, lng + d.stepLng]], {
        renderer: hotRenderer,
        stroke: false,
        fillColor: '#c9443b',
        fillOpacity: heatOpacity(n),
        interactive: false
      }).addTo(hotspotLayer);
    });
  }

  function hotspotCount(latlng) {
    const d = hot.data;
    if (!d || !d.stepLat) return 0;
    const i = Math.floor((latlng.lat - d.south) / d.stepLat);
    const j = Math.floor((latlng.lng - d.west) / d.stepLng);
    return hot.index.get(i + ':' + j) || 0;
  }

  map.on('mousemove', (e) => {
    if (!state.hotOn) return;
    const n = hotspotCount(e.latlng);
    if (!n) { map.closeTooltip(hotTip); return; }
    hotTip.setLatLng(e.latlng).setContent(`${n} verified reports cover this spot`);
    map.openTooltip(hotTip);
  });

  function setDraftMarker(lat, lng) {
    if (draftMarker) map.removeLayer(draftMarker);
    draftMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'pin-wrap',
        html: Tpl.render('draft_pin'),
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
    const { q, type, status, verify, scope, from, to } = state.filters;
    const needle = q.trim().toLowerCase();
    const fromMs = from ? new Date(from + 'T00:00:00').getTime() : null;
    const toMs = to ? new Date(to + 'T23:59:59.999').getTime() : null;
    return db.reports
      .filter((r) => {
        if (mode === 'map') { if (r.status === 'resolved' && r.id !== state.selectedId) return false; }
        else if (isAdmin() && r.status === 'resolved') return false;
        if (scope === 'mine' && !isOwn(r)) return false;
        if (scope === 'others' && isOwn(r)) return false;
        if (fromMs !== null && r.createdAt < fromMs) return false;
        if (toMs !== null && r.createdAt > toMs) return false;
        if (type && r.type !== type) return false;
        if (status && r.status !== status) return false;
        if (verify === 'verified' && !r.verified) return false;
        if (verify === 'unverified' && r.verified) return false;
        if (needle) {
          const hay = `${r.title} ${r.desc} ${r.author || ''}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  const emptyFilters = () => ({ q: '', type: '', status: '', verify: '', scope: '', from: '', to: '' });

  function syncFilterControls() {
    [['#fSearch', 'q'], ['#fType', 'type'], ['#fStatus', 'status'], ['#fVerify', 'verify'],
     ['#fScope', 'scope'], ['#fFrom', 'from'], ['#fTo', 'to']].forEach(([sel, key]) => {
      const el = qs(sel);
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
    return !!(f.q || f.type || f.status || f.verify || f.scope || f.from || f.to);
  }

function pillsHTML(r, opts = {}) {
    return Tpl.render('pills', {
      showStatus: !!opts.status,
      status: r.status,
      statusLabel: STATUSES[r.status],
      verified: !!r.verified,
      official: r.source === 'official',
      mine: !!opts.mine && isOwn(r),
      affects: !!opts.affects && affectsHome(r)
    });
  }

  function renderList() {
    const list = qs('#reportList');
    const items = filteredReports();
    const listBase = isAdmin() ? db.reports.filter((r) => r.status !== 'resolved').length : db.reports.length;

    qs('#resultCount').textContent =
      `${items.length} of ${listBase} report${listBase === 1 ? '' : 's'}`;
    qs('#clearFilters').hidden = !filtersActive();

    if (!items.length) {
      list.innerHTML = db.reports.length
        ? Tpl.render('list_empty', { title: 'No reports match', text: 'Try a different search or clear the filters to see every report.' })
        : Tpl.render('list_empty', { title: 'No reports yet', text: 'Reports and announcements will show up here once they are posted.' });
      return;
    }

    list.innerHTML = items.map((r) => Tpl.render('report_card', {
      id: r.id,
      selected: r.id === state.selectedId,
      color: TYPES[r.type]?.color || '#587079',
      title: r.title,
      typeLabel: TYPES[r.type]?.label,
      date: fmtDate.format(r.createdAt),
      pills: pillsHTML(r, { status: true, mine: true, affects: true }),
      ago: ago(r.createdAt)
    })).join('');
  }

  function coverageLabel(r) {
    const g = r.geofence;
    if (g && g.type === 'rectangle') {
      const [w, h] = rectSizeM(g.bounds);
      return `Rectangle, about ${Math.round(w)} m by ${Math.round(h)} m`;
    }
    if (g && g.type === 'polygon' && g.points.length >= 3) {
      return `Drawn area, ${g.points.length} points, about ${polyAreaKm2(g.points).toFixed(2)} km\u00b2`;
    }
    return `Circle, ${r.radius || CONFIG.geofenceRadius} m around the pin`;
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
    const box = qs('#viewDetail');
    const r = getReport(state.selectedId);
    if (!r) { showView('reports'); return; }

    const t = TYPES[r.type] || { label: r.type, color: '#587079' };
    const admin = isAdmin();
    const modify = canModify(r);

    const statusOptions = Tpl.render('select_options', {
      options: Object.entries(STATUSES).map(([k, v]) => ({ value: k, label: v, selected: k === r.status }))
    });

    box.innerHTML = Tpl.render('detail', {
      backLabel: state.from === 'dashboard' ? 'Back to dashboard' : state.from === 'insights' ? 'Back to insights' : state.from === 'history' ? 'Back to history' : 'Back to all reports',
      color: t.color,
      title: r.title,
      pills: pillsHTML(r, { status: true }),
      affectsHome: affectsHome(r),
      photo: r.photo,
      description: r.desc ? r.desc : 'No details were added to this report.',
      typeLabel: t.label,
      coordinates: `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`,
      author: r.author || 'Anonymous resident',
      posted: `${fmtDate.format(r.createdAt)} (${ago(r.createdAt)})`,
      verification: r.verified ? 'Verified by an administrator' : 'Not yet verified',
      own: isOwn(r),
      statusLabel: STATUSES[r.status],
      verified: !!r.verified,
      coverage: r.verified ? coverageLabel(r) : '',
      showResidents: admin && r.verified,
      residents: admin && r.verified ? affectedText(r) : '',
      resolvedDate: r.status === 'resolved' && r.resolvedAt ? fmtDate.format(r.resolvedAt) : '',
      hasSchedule: !!(r.startsAt || r.endsAt),
      startText: r.startsAt ? fmtDate.format(r.startsAt) : 'Not set',
      endText: r.endsAt ? fmtDate.format(r.endsAt) : 'Not set',
      admin: admin,
      statusOptions: statusOptions,
      verifyLabel: r.verified ? 'Mark as unverified' : 'Verify report',
      canResend: !!r.verified && r.status !== 'resolved',
      canResolve: admin && r.status !== 'resolved',
      canReopen: admin && r.status === 'resolved',
      canRenotify: admin && r.source === 'official' && ['scheduled', 'ongoing'].includes(r.status),
      modify: modify,
      canDelete: modify && r.status !== 'resolved'
    });
  }

  function renderInsights() {
    const box = qs('#viewInsights');
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

    const bars = (rows, max) => rows.map((x) => ({ label: x.label, color: x.color, n: x.n, width: (x.n / max) * 100 }));

    box.innerHTML = Tpl.render('insights', {
      total: total,
      stats: statStrip([[total, 'Total reports'], [active, 'Active now'], [scheduled, 'Scheduled'], [pct + '%', 'Verified']]),
      byType: bars(byType, maxType),
      byStatus: bars(byStatus, maxStatus)
    });
  }

  const TAB_IDS = { reports: 'tabReports', insights: 'tabInsights', dashboard: 'tabDashboard', profile: 'tabProfile', history: 'tabHistory' };
  const VIEW_IDS = { reports: 'viewReports', detail: 'viewDetail', insights: 'viewInsights', dashboard: 'viewDashboard', profile: 'viewProfile', history: 'viewHistory' };

  function activate(view) {
    const tab = view === 'detail' ? state.from : view;
    Object.entries(VIEW_IDS).forEach(([k, id]) => { const el = qs('#' + id); if (el) el.hidden = k !== view; });
    Object.entries(TAB_IDS).forEach(([k, id]) => {
      const on = k === tab;
      const el = qs('#' + id);
      if (!el) return;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', String(on));
    });
    state.view = view;
    qs('#panel').scrollTop = 0;
  }

  function showView(name) {
    if (name === 'dashboard' && !currentUser()) name = 'reports';
    if (name === 'history' && !isAdmin()) name = 'reports';
    if (name === 'profile' && (!currentUser() || isAdmin())) name = 'reports';
    if (name === 'detail') name = state.from;
    state.selectedId = null;
    activate(name);
    if (name === 'reports') renderList();
    if (name === 'insights') renderInsights();
    if (name === 'dashboard') renderDashboard();
    if (name === 'history') renderHistory();
    if (name === 'profile') openProfile();
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
    const open = () => revealReport(id);
    if (fly) map.once('moveend', open); else open();
  }

  function refresh() {
    renderAuth();
    renderHome();
    renderList();
    renderMarkers();
    if (state.hotOn && hotSignature() !== hot.sig) loadHotspots();
    if (state.view === 'detail') renderDetail();
    if (state.view === 'insights') renderInsights();
    if (state.view === 'dashboard') renderDashboard();
    if (state.view === 'history') renderHistoryBody();
  }

  function reportRow(r, actions = '') {
    const t = TYPES[r.type] || { label: r.type, color: '#587079' };
    return Tpl.render('queue_item', {
      color: t.color,
      id: r.id,
      title: r.title,
      typeLabel: t.label,
      ago: ago(r.createdAt),
      pills: pillsHTML(r, { status: true }),
      actions: actions
    });
  }

  function statStrip(items, wide) {
    return Tpl.render('stat_strip', {
      wide: !!wide,
      stats: items.map(([n, label]) => ({ n: n, label: label }))
    });
  }

  function renderDashboard() {
    const u = currentUser();
    const box = qs('#viewDashboard');
    if (!u) { showView('reports'); return; }
    box.innerHTML = u.role === 'admin' ? adminDashboardHTML(u) : residentDashboardHTML(u);
  }

  function noteRow(n) {
    return Tpl.render('notice_item', {
      unread: !n.read,
      id: n.id,
      reportId: n.reportId,
      message: n.message,
      ago: ago(n.createdAt)
    });
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
      : Tpl.render('empty_inline', { text: 'No interruption notices for your home. You will see one here, and get an email, when a scheduled interruption covers your home marker.' });

    const mineRows = mine.length
      ? mine.slice(0, 3).map((r) => reportRow(r,
          Tpl.render('queue_actions_mine', { id: r.id, canDelete: r.status !== 'resolved' }))).join('')
      : Tpl.render('empty_inline', { text: 'You have not reported anything yet. Pin an issue on the map to start.' });

    const advisoryRows = advisories.length
      ? advisories.slice(0, 4).map((r) => reportRow(r)).join('')
      : Tpl.render('empty_inline', { text: 'No active announcements from the water provider.' });

    return Tpl.render('resident_dashboard', {
      firstName: u.name.split(' ')[0],
      email: u.email,
      stats: statStrip([
        [advisories.length, 'Advisories'],
        [communityOpen, 'Open reports'],
        [near ? near.length : 0, 'Near my home'],
        [open, 'My open reports']
      ]),
      unread: unread,
      noteRows: noteRows,
      advisoryRows: advisoryRows,
      mineRows: mineRows,
      moreMine: mine.length > 3,
      mineCount: mine.length,
      verified: verified,
      resolved: resolved
    });
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
          Tpl.render('queue_actions_pending', { id: r.id }))).join('')
      : Tpl.render('empty_inline', { text: 'Nothing to review. New community reports will show up here.' });

    const liveRows = live.length
      ? live.map((r) => reportRow(r,
          Tpl.render('queue_actions_live', { id: r.id }))).join('')
      : Tpl.render('empty_inline', { text: 'No ongoing or upcoming interruptions right now.' });

    return Tpl.render('admin_dashboard', {
      name: u.name,
      stats: statStrip([
        [rs.length, 'Total reports'],
        [pending.length, 'Pending verification'],
        [verifiedN, 'Verified reports'],
        [resolvedN, 'Resolved reports'],
        [upcoming.length, 'Upcoming interruptions'],
        [active, 'Active now']
      ], true),
      queueRows: queueRows,
      liveRows: liveRows
    });
  }

  async function onDashboardClick(e) {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    const r = b.dataset.id ? getReport(b.dataset.id) : null;

    if (a === 'open' && r) return selectReport(r.id);
    if (a === 'edit' && r && canModify(r)) return openReportForm({ report: r });
    if (a === 'delete' && r && canModify(r)) {
      if (r.status === 'resolved') return toast('Resolved reports are kept in the history and cannot be deleted.', 'info');
      if (!(await confirmAction({ title: 'Delete this report?', text: 'This cannot be undone.' }))) return;
      if (!(await removeReport(r.id))) return;
      return refresh();
    }
    if (a === 'verify' && r && isAdmin()) return openReportForm({ report: r, verifying: true });
    if (a === 'resolve' && r && isAdmin()) {
      if (!(await confirmAction({ title: 'Mark as resolved?', text: 'It leaves the active map but stays in the report history.', confirmText: 'Mark as resolved', danger: false }))) return;
      if (!(await updateReport(r.id, { status: 'resolved' }))) return;
      resolvedNotice();
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
      const wrap = qs('.mapwrap');
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
        text: 'Checks that residents can receive water service emails.',
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

  function saveStoredUser(patch) {
    const u = currentUser();
    if (!u) return;
    try { sessionStorage.setItem(CONFIG.sessionKey, JSON.stringify({ ...u, ...patch })); } catch (e) { }
  }

  function applyProfile(p) {
    saveStoredUser({ username: p.username, name: p.name || undefined, email: p.email, avatar: p.avatar || '' });
    renderAuth();
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function avatarHTML(u, size) {
    const px = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px`;
    return Tpl.render('avatar', { src: u && u.avatar, px: px, initials: initials(u && u.name) });
  }

  async function openProfile() {
    renderProfile();
    try {
      const res = await api(API.profile, { action: 'get' });
      applyProfile(res.profile);
      if (state.view === 'profile') renderProfile();
    } catch (err) {
      const box = qs('#viewProfile');
      if (box && !box.querySelector('.profile-load-error')) {
        box.insertAdjacentHTML('afterbegin', Tpl.render('profile_error', { message: errMsg(err) }));
      }
    }
  }

  function renderProfile() {
    const u = currentUser();
    const box = qs('#viewProfile');
    if (!u || !box) return;

    box.innerHTML = Tpl.render('profile', {
      avatar: avatarHTML(u, 96),
      hasAvatar: !!u.avatar,
      name: u.name,
      username: u.username || '',
      email: u.email || '',
      maskedEmail: maskMail(u.email)
    });
  }

  function maskMail(email) {
    const [n, d] = String(email || '').split('@');
    if (!d) return email || 'your email';
    const keep = n.slice(0, 2);
    return keep + '*'.repeat(Math.max(n.length - keep.length, 1)) + '@' + d;
  }

  function showFormError(sel, msg) {
    const el = qs(sel);
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function squareAvatar(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const out = Math.min(side, 400);
        const c = document.createElement('canvas');
        c.width = c.height = out;
        c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('That image could not be read.'))), 'image/jpeg', 0.88);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a readable image.')); };
      img.src = url;
    });
  }

  let otpTimer = null;
  function startResendCooldown(secs) {
    const btn = qs('#pwResend');
    if (!btn) return;
    clearInterval(otpTimer);
    let left = secs;
    const tick = () => {
      const b = qs('#pwResend');
      if (!b) { clearInterval(otpTimer); return; }
      if (left <= 0) { b.disabled = false; b.textContent = 'Resend code'; clearInterval(otpTimer); return; }
      b.disabled = true; b.textContent = `Resend code (${left}s)`; left -= 1;
    };
    tick();
    otpTimer = setInterval(tick, 1000);
  }

  async function sendOtp() {
    const sendBtn = qs('#pwSendBtn');
    if (sendBtn) sendBtn.disabled = true;
    showFormError('#pwError', '');
    try {
      const res = await api(API.profile, { action: 'otp_send' });
      qs('#pwStart').hidden = true;
      qs('#pwForm').hidden = false;
      qs('#pwNote').textContent = `${res.message} It expires in ${res.minutes} minutes.`;
      qs('#pwCode').value = '';
      qs('#pwCode').focus();
      startResendCooldown(60);
    } catch (err) {
      if (qs('#pwForm').hidden) {
        Swal.fire({ icon: 'error', title: 'Code not sent', text: errMsg(err), confirmButtonText: 'OK' });
      } else {
        showFormError('#pwError', errMsg(err));
      }
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  async function onProfileClick(e) {
    const b = e.target.closest('[data-profile]');
    if (!b) return;
    const a = b.dataset.profile;

    if (a === 'pick') return qs('#pAvatarInput').click();

    if (a === 'avatar-remove') {
      if (!(await confirmAction({ title: 'Remove your profile picture?', confirmText: 'Remove' }))) return;
      try {
        const res = await api(API.profile, { action: 'avatar_remove' });
        applyProfile(res.profile);
        renderProfile();
        toast('Profile picture removed.');
      } catch (err) { Swal.fire({ icon: 'error', title: 'Could not remove', text: errMsg(err), confirmButtonText: 'OK' }); }
      return;
    }

    if (a === 'otp-send') return sendOtp();

    if (a === 'otp-cancel') {
      clearInterval(otpTimer);
      qs('#pwForm').hidden = true;
      qs('#pwStart').hidden = false;
      showFormError('#pwError', '');
    }
  }

  async function onProfileChange(e) {
    if (e.target.id !== 'pAvatarInput') return;
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      return Swal.fire({ icon: 'error', title: 'Wrong file type', text: 'Choose a JPG, PNG or WebP image.', confirmButtonText: 'OK' });
    }
    try {
      const blob = await squareAvatar(file);
      const res = await api(API.profile, { action: 'avatar', avatar: blob });
      applyProfile(res.profile);
      renderProfile();
      toast('Profile picture updated.');
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Picture not saved', text: errMsg(err), confirmButtonText: 'OK' });
    }
  }

  async function onProfileSubmit(e) {
    e.preventDefault();

    if (e.target.id === 'pForm') {
      const username = qs('#pUsername').value.trim();
      const email = qs('#pEmail').value.trim();
      showFormError('#pError', '');
      if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) return showFormError('#pError', 'Username must be 3 to 30 letters, numbers, dots, dashes or underscores.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showFormError('#pError', 'Enter a valid email address.');

      const btn = qs('#pSave');
      btn.disabled = true;
      try {
        const res = await api(API.profile, { action: 'save', username, email });
        applyProfile(res.profile);
        renderProfile();
        toast('Profile updated.');
      } catch (err) {
        showFormError('#pError', errMsg(err));
        btn.disabled = false;
      }
      return;
    }

    if (e.target.id === 'pwForm') {
      const code = qs('#pwCode').value.replace(/\D/g, '');
      const pw = qs('#pwNew').value;
      const again = qs('#pwConfirm').value;
      showFormError('#pwError', '');
      if (code.length !== 6) return showFormError('#pwError', 'Enter the 6-digit code from your email.');
      if (pw.length < 8) return showFormError('#pwError', 'Password must be at least 8 characters.');
      if (pw !== again) return showFormError('#pwError', 'The two passwords do not match.');

      const btn = qs('#pwSubmit');
      btn.disabled = true;
      try {
        await api(API.profile, { action: 'password_change', code, password: pw });
        clearInterval(otpTimer);
        renderProfile();
        Swal.fire({ icon: 'success', title: 'Password changed', text: 'Use your new password the next time you log in.', confirmButtonText: 'OK' });
      } catch (err) {
        showFormError('#pwError', errMsg(err));
        btn.disabled = false;
      }
    }
  }

  function renderAuth() {
    const u = currentUser();
    const admin = !!u && u.role === 'admin';

    qs('#btnAnnounce').hidden = !admin;
    const unread = admin ? 0 : unreadNotes().length;
    qs('#tabDashboard').textContent = admin ? 'Admin dashboard' : (unread ? `My dashboard (${unread})` : 'My dashboard');

    qs('#authArea').innerHTML = u ? Tpl.render('auth_area', {
      showProfile: !admin,
      avatar: admin ? '' : avatarHTML(u, 34),
      name: u.name,
      subtitle: admin ? 'Administrator' : u.email
    }) : '';
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
    qs('#map').classList.add('is-placing');
    qs('#placingBanner').hidden = false;
    map.closePopup();
  }

  function stopPlacing() {
    state.placing = false;
    state.onPlace = null;
    qs('#map').classList.remove('is-placing');
    qs('#placingBanner').hidden = true;
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
    sel.innerHTML = Tpl.render('select_options', {
      options: options.map(([v, l]) => ({ value: v, label: l, selected: v === current }))
    });
  }

  function updateLocText() {
    const d = state.draft;
    qs('#locText').textContent = d ? `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}` : 'No pin yet';
  }

  function toggleScheduleRow() {
    qs('#scheduleRow').hidden = !qs('#rOfficial').checked;
    updateGeoUi();
  }

  function fillRangeSelect(type, current) {
    const sel = qs('#rRange');
    sel.innerHTML = Tpl.render('select_options', {
      options: [
        ...Object.keys(RANGE_LABELS).map((k) => ({ value: k, label: `${RANGE_LABELS[k]} (${rangeFor(type, k)} m)`, selected: false })),
        { value: 'custom', label: 'Custom size', selected: false }
      ]
    });
    sel.value = current;
  }

  function regenGeo() {
    const d = state.draft;
    const kind = qs('#rShape').value;
    if (!d) return;
    const radius = Number(qs('#rRadius').value) || 1000;
    state.draftGeo = kind === 'circle' ? null : defaultGeo(kind, d.lat, d.lng, radius);
    updateGeoUi();
  }

  function onTypeChange() {
    const key = qs('#rRange').value;
    fillRangeSelect(qs('#rType').value, key);
    if (key !== 'custom') {
      qs('#rRadius').value = rangeFor(qs('#rType').value, key);
      regenGeo();
    }
  }

  function onRangeChange() {
    const key = qs('#rRange').value;
    if (key !== 'custom') qs('#rRadius').value = rangeFor(qs('#rType').value, key);
    regenGeo();
  }

  function onShapeChange() { regenGeo(); }

  function onRadiusInput() {
    qs('#rRange').value = 'custom';
    regenGeo();
  }

  function loadPhotoBlob(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, CONFIG.maxPhotoPx / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('fail'))), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('fail')); };
      img.src = url;
    });
  }

  function renderPhotoUi(existing) {
    const box = qs('#photoPreview');
    if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = null; }
    if (state.photoBlob) {
      photoUrl = URL.createObjectURL(state.photoBlob);
      box.innerHTML = Tpl.render('photo_preview', { src: photoUrl, alt: 'Selected photo preview' });
      qs('#photoClear').hidden = false;
      qs('#photoRemoveField').hidden = true;
    } else if (existing) {
      box.innerHTML = Tpl.render('photo_preview', { src: existing, alt: 'Current photo' });
      qs('#photoClear').hidden = true;
      qs('#photoRemoveField').hidden = false;
    } else {
      box.innerHTML = '';
      qs('#photoClear').hidden = true;
      qs('#photoRemoveField').hidden = true;
    }
  }

  async function onPhotoPicked() {
    const file = qs('#rPhoto').files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      qs('#rPhoto').value = '';
      return showError('reportError', 'Choose a JPG, PNG or WebP photo.');
    }
    try {
      state.photoBlob = await loadPhotoBlob(file);
      qs('#reportError').hidden = true;
      qs('#rPhotoRemove').checked = false;
      const editing = state.editingId ? getReport(state.editingId) : null;
      renderPhotoUi(editing && editing.photo);
    } catch (e) {
      qs('#rPhoto').value = '';
      showError('reportError', 'That photo could not be read. Try a different one.');
    }
  }

  function clearPhoto() {
    state.photoBlob = null;
    qs('#rPhoto').value = '';
    const editing = state.editingId ? getReport(state.editingId) : null;
    renderPhotoUi(editing && editing.photo);
  }

  function openReportForm({ report = null, lat, lng, official = false, keepGeo = false, verifying = false } = {}) {
    const admin = isAdmin();
    const editing = !!report;
    state.editingId = editing ? report.id : null;
    state.verifying = verifying;
    state.draft = { lat: editing ? report.lat : lat, lng: editing ? report.lng : lng };

    qs('#reportTitle').textContent = verifying ? 'Verify report' : editing ? 'Edit report' : (official ? 'Post announcement' : 'Report an issue');
    qs('#reportSubmit').textContent = verifying ? 'Verify report' : editing ? 'Save changes' : (official ? 'Post announcement' : 'Submit report');

    const type = report?.type || 'interruption';
    fillSelect(qs('#rType'), Object.entries(TYPES).map(([k, v]) => [k, v.label]), type);

    qs('#rTitleInput').value = report?.title || '';
    qs('#rDesc').value = report?.desc || '';

    const statusKeys = admin ? Object.keys(STATUSES) : ['reported', 'ongoing', 'resolved'];
    fillSelect(qs('#rStatus'), statusKeys.map((k) => [k, STATUSES[k]]),
      report?.status || (official ? 'scheduled' : 'reported'));
    qs('#rStatusField').hidden = !(admin || editing);

    qs('#officialBox').hidden = !admin;
    qs('#rOfficial').checked = editing ? report.source === 'official' : official;
    qs('#rStarts').value = toLocalInput(report?.startsAt);
    qs('#rEnds').value = toLocalInput(report?.endsAt);

    if (!keepGeo) {
      state.draftGeo = report?.geofence || null;
      state.photoBlob = null;
      qs('#rPhoto').value = '';
      qs('#rPhotoRemove').checked = false;
    }
    if (qs('#rShape')) {
      qs('#rShape').value = geoKind(report?.geofence);
      if (editing) {
        qs('#rRadius').value = report.radius || rangeFor(type, 'standard');
        fillRangeSelect(type, verifying && !report.verified ? 'standard' : 'custom');
        if (verifying && !report.verified && !keepGeo) onRangeChange();
      } else {
        qs('#rRadius').value = rangeFor(type, 'standard');
        fillRangeSelect(type, 'standard');
      }
    }
    renderPhotoUi(report && report.photo);
    toggleScheduleRow();

    qs('#reportError').hidden = true;
    updateLocText();
    setDraftMarker(state.draft.lat, state.draft.lng);
    updateGeoUi();

    const dlg = qs('#reportDialog');
    if (!dlg.open) dlg.showModal();
  }

  function beginNewReport({ official = false } = {}) {
    state.editingId = null;
    startPlacing((lat, lng) => openReportForm({ lat, lng, official }));
  }

  function onChangePin() {
    const old = { ...state.draft };
    const verifying = state.verifying;
    const snapshot = captureForm();
    const geo = state.draftGeo;
    qs('#reportDialog').close();
    const editing = state.editingId ? getReport(state.editingId) : null;
    startPlacing((lat, lng) => {
      state.draftGeo = geo;
      openReportForm({ report: editing, lat, lng, official: snapshot.official, keepGeo: true, verifying });
      restoreForm(snapshot);
      if (state.draftGeo) state.draftGeo = shiftGeo(state.draftGeo, lat - old.lat, lng - old.lng);
      updateGeoUi();
    });
  }

  async function onReportSubmit(e) {
    e.preventDefault();
    const u = currentUser();
    if (!u) return showError('reportError', 'Log in to submit a report.');

    const title = qs('#rTitleInput').value.trim();
    if (!title) return showError('reportError', 'Add a short title so others know what is happening.');
    if (!state.draft) return showError('reportError', 'Pin the location on the map first.');

    const admin = u.role === 'admin';
    const official = admin && qs('#rOfficial').checked;
    const startsAt = qs('#rStarts').value ? new Date(qs('#rStarts').value).getTime() : null;
    const endsAt = qs('#rEnds').value ? new Date(qs('#rEnds').value).getTime() : null;
    if (official && startsAt && endsAt && endsAt < startsAt) {
      return showError('reportError', 'The end time is before the start time. Check the schedule.');
    }

    const radius = admin ? Number(qs('#rRadius').value) : 0;
    const kind = admin ? qs('#rShape').value : 'circle';
    if (admin) {
      if (!Number.isInteger(radius) || radius < 100 || radius > 10000) {
        return showError('reportError', 'The radius must be a whole number from 100 to 10000 meters.');
      }
      if (kind !== 'circle' && !state.draftGeo) regenGeo();
      if (kind === 'polygon' && selfIntersects(state.draftGeo.points)) {
        return showError('reportError', 'The lines of the drawn area cross. Adjust it on the map first.');
      }
    }

    const editing = !!state.editingId;
    const payload = {
      action: editing ? 'update' : 'create',
      type: qs('#rType').value,
      title,
      desc: qs('#rDesc').value.trim(),
      lat: state.draft.lat,
      lng: state.draft.lng
    };
    if (state.photoBlob) payload.photo = state.photoBlob;
    else if (editing && qs('#rPhotoRemove').checked) payload.removePhoto = '1';
    if (editing) payload.id = state.editingId;
    if (!qs('#rStatusField').hidden) payload.status = qs('#rStatus').value;
    if (admin) {
      payload.radius = String(radius);
      payload.geofence = kind !== 'circle' && state.draftGeo ? JSON.stringify(state.draftGeo) : '';
      if (state.verifying) payload.verified = '1';
      payload.official = official ? '1' : '0';
      payload.startsAt = official && startsAt ? startsAt : '';
      payload.endsAt = official && endsAt ? endsAt : '';
    }

    const btn = qs('#reportSubmit');
    btn.disabled = true;
    try {
      const data = await api(API.reports, payload);
      const saved = data.report;
      const i = db.reports.findIndex((x) => x.id === saved.id);
      if (i >= 0) db.reports[i] = saved; else db.reports.push(saved);

      toast(state.verifying ? data.message : editing ? 'Changes saved.' : (official ? 'Announcement posted.' : 'Report submitted. An admin can verify it.'));
      state.verifying = false;
      clearDraftMarker();
      state.draft = null;
      state.draftGeo = null;
      state.photoBlob = null;
      qs('#reportDialog').close();
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
      map.once('moveend', () => revealReport(r.id));
    }
    if (action === 'edit' && canModify(r)) {
      openReportForm({ report: r });
    }
    if (action === 'delete' && canModify(r)) {
      if (r.status === 'resolved') return toast('Resolved reports are kept in the history and cannot be deleted.', 'info');
      if (!(await confirmAction({ title: 'Delete this report?', text: 'This cannot be undone.' }))) return;
      if (!(await removeReport(r.id))) return;
      showView(state.from);
      refresh();
    }
    if (action === 'resolve' && isAdmin()) {
      if (!(await confirmAction({ title: 'Mark as resolved?', text: 'It leaves the active map but stays in the report history.', confirmText: 'Mark as resolved', danger: false }))) return;
      const saved = await updateReport(r.id, { status: 'resolved' });
      if (!saved) return;
      resolvedNotice();
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
      if (!r.verified) return openReportForm({ report: r, verifying: true });
      const saved = await updateReport(r.id, { verified: '0' });
      if (!saved) return;
      toast('Verification removed.');
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
    if (saved.status === 'resolved') resolvedNotice();
    else toast(`Status changed to ${STATUSES[saved.status].toLowerCase()}.`);
    refresh();
  }

  function exportCSV() {
    const head = ['id', 'type', 'title', 'status', 'verified', 'source', 'latitude', 'longitude', 'posted_by', 'posted_at'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = db.reports.map((r) => [
      r.id, TYPES[r.type]?.label, r.title, STATUSES[r.status],
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
    if (!u || u.role === 'admin' || !((myHome && myHome.barangay) || u.address)) return null;
    const name = String((myHome && myHome.barangay) || u.address).split(',')[0].trim().toLowerCase();
    return AREAS.find((a) => a.name.toLowerCase() === name) || null;
  }

  let myHome = null;

  async function fetchMyHome() {
    const data = await api(API.home, { action: 'get' });
    return data.home ? { lat: +data.home.lat, lng: +data.home.lng, barangay: data.home.barangay || '' } : null;
  }

  async function saveHome(lat, lng, barangay) {
    const data = await api(API.home, { action: 'save', lat, lng, barangay });
    return { lat: +data.home.lat, lng: +data.home.lng, barangay: data.home.barangay || barangay };
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
    if (!homeArea()) return null;
    return db.reports.filter(affectsHome);
  }

  function renderHome() {
    homeLayer.clearLayers();
    const a = homeArea();
    if (!a) return;

    const hm = L.marker([a.lat, a.lng], {
      interactive: true,
      draggable: isResident(),
      keyboard: false,
      icon: homeIcon(),
      title: 'Your home'
    }).addTo(homeLayer);
    if (isResident()) {
      hm.bindTooltip('Your home. Drag to move it.', { direction: 'top', offset: [0, -46] });
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
        html: Tpl.render('home_icon_fallback'),
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
    }
    return PipeMarkers.divIcon('home', 'pin-img');
  }

  function focusHome() {
    const a = homeArea();
    if (!a) return;
    const box = L.latLng(a.lat, a.lng).toBounds(CONFIG.homeViewM * 2);
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
        html: Tpl.render('welcome_admin', {
          text: waiting
            ? `${waiting} report${waiting === 1 ? ' is' : 's are'} waiting for verification.`
            : 'No reports are waiting for verification.'
        }),
        confirmButtonText: 'Open dashboard'
      });
    }

    const a = homeArea();
    const near = openReportsNearHome();
    const unread = unreadNotes().length;
    const coverText = a
      ? (near.length
        ? `${near.length} open report${near.length === 1 ? '' : 's'} cover${near.length === 1 ? 's' : ''} your home.`
        : 'No open reports cover your home.')
      : '';
    const where = Tpl.render('welcome_resident', {
      hasHome: !!a,
      coverText: coverText,
      unread: unread,
      plural: unread === 1 ? '' : 's',
      verb: unread === 1 ? 's' : ''
    });

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
    qs('#panel').inert = on;
    qs('.map-tools').inert = on;
    qs('#btnNewReport').disabled = on;
  }

  function showHomeBanner(force) {
    if (!homeBanner) {
      homeBanner = document.createElement('div');
      homeBanner.className = 'placing-banner';
      homeBanner.setAttribute('role', 'status');
      qs('.mapwrap').appendChild(homeBanner);
      homeBanner.addEventListener('click', onHomeBannerClick);
    }
    homeBanner.innerHTML = Tpl.render('home_banner', {
      title: force ? 'Set your home to continue' : 'Choose your home',
      cancellable: !force
    });
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
    qs('#map').classList.add('is-placing');
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
    qs('#map').classList.remove('is-placing');
    if (homeBanner) homeBanner.hidden = true;
    if (homeDraft) { map.removeLayer(homeDraft); homeDraft = null; }
  }

  async function askBarangay() {
    const moving = !!myHome;
    const res = await Swal.fire({
      icon: 'question',
      title: 'Which barangay is your home in?',
      text: moving && myHome.barangay ? `Your home is currently in ${myHome.barangay}.` : 'Choose the barangay of this spot.',
      input: 'select',
      inputOptions: Object.fromEntries(AREAS.map((a) => [a.name, a.name])),
      inputPlaceholder: 'Choose your barangay',
      inputValidator: (v) => (v ? undefined : 'Please choose your barangay.'),
      showCancelButton: true,
      confirmButtonText: 'Next',
      cancelButtonText: moving ? 'Keep current home' : 'Choose again',
      allowOutsideClick: false,
      reverseButtons: true,
      didOpen: (popup) => {
        const sel = popup.querySelector('select.swal2-select');
        if (sel) {
          sel.style.width = 'min(300px, calc(100% - 4em))';
          sel.style.maxWidth = '300px';
          sel.style.margin = '14px auto 0';
          sel.style.boxSizing = 'border-box';
          sel.style.display = 'block';
        }
      }
    });
    return res.isConfirmed ? res.value : null;
  }

  async function askHomeConfirm(lat, lng) {
    const barangay = await askBarangay();
    if (!barangay) return null;

    const moving = !!myHome;
    const dist = moving ? Math.round(haversine(myHome.lat, myHome.lng, lat, lng)) : 0;
    const res = await Swal.fire({
      icon: 'question',
      title: moving ? 'Move your home marker?' : 'Set this as your home?',
html: Tpl.render('home_confirm', { moving: moving, barangay: barangay, coords: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, dist: dist }),
      showCancelButton: true,
      confirmButtonText: moving ? 'Yes, move my home' : 'Yes, this is my home',
      cancelButtonText: moving ? 'Keep current home' : 'Choose again',
      allowOutsideClick: false,
      reverseButtons: true
    });
    return res.isConfirmed ? barangay : null;
  }

  async function commitHome(lat, lng, barangay, { first = false } = {}) {
    try {
      myHome = await saveHome(lat, lng, barangay);
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

    const barangay = await askHomeConfirm(lat, lng);
    state.confirmingHome = false;

    if (!barangay) {
      map.removeLayer(homeDraft);
      homeDraft = null;
      return;
    }
    await commitHome(lat, lng, barangay, { first: state.forceHome });
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
      const barangay = await askHomeConfirm(p.lat, p.lng);
      state.confirmingHome = false;
      if (!barangay) { marker.setLatLng([old.lat, old.lng]); return; }
      if (!(await commitHome(p.lat, p.lng, barangay))) marker.setLatLng([old.lat, old.lng]);
    } finally {
      state.confirmingHome = false;
      state.draggingHome = false;
    }
  }

  map.on('click', (e) => {
    if (state.settingHome) chooseHome(e.latlng.lat, e.latlng.lng);
  });

  const usersLayer = L.markerClusterGroup({ ...clusterOptions, iconCreateFunction: homeClusterIcon }).addTo(map);
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
        Tpl.render('user_popup', { name: h.name, username: h.username, address: h.address }),
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
box.innerHTML = Tpl.render('user_search');
    qs('.mapwrap').appendChild(box);

    const input = qs('#userSearch');
    const list = qs('#userSuggest');
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
        list.innerHTML = Tpl.render('suggest_empty');
      } else {
        list.innerHTML = Tpl.render('suggest_items', {
          rows: items.map((r, i) => ({
            i: i,
            cls: r.hasHome ? '' : 'no-home',
            name: r.name,
            username: r.username,
            address: r.address,
            hasHome: !!r.hasHome
          }))
        });
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
      map.once('moveend', () => revealMarker(usersLayer, userMarkers.get(String(r.id)), () => userMarkers.get(String(r.id)).openPopup()));
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

    Swal.fire({
      title: 'Report history',
      html: Tpl.render('report_log_dialog', {
        title: r.title,
        entries: entries.map((e) => ({
          text: logText(e),
          when: fmtDate.format(e.createdAt),
          actor: e.actor || 'unknown'
        }))
      }),
      confirmButtonText: 'Close'
    });
  }

  const histTime = (r) => r.resolvedAt || r.createdAt;

  function renderHistory() {
    const box = qs('#viewHistory');
    if (!box) return;
    const h = state.history;
    box.innerHTML = Tpl.render('history_view', {
      resolvedTab: h.tab === 'resolved',
      logTab: h.tab === 'log',
      q: h.q,
      from: h.from,
      to: h.to
    });

    if (h.tab === 'log') {
      loadLog().then(renderHistoryBody).catch((err) => {
        const b = qs('#histBody');
        if (b) b.innerHTML = Tpl.render('empty_inline', { text: errMsg(err) });
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
    const body = qs('#histBody');
    if (!body) return;
    const h = state.history;
    const needle = h.q.trim().toLowerCase();

    if (h.tab === 'resolved') {
      const items = db.reports
        .filter((r) => r.status === 'resolved')
        .filter((r) => inHistRange(histTime(r)))
        .filter((r) => !needle || `${r.title} ${r.desc} ${r.author || ''}`.toLowerCase().includes(needle))
        .sort((a, b) => histTime(b) - histTime(a));

      body.innerHTML = Tpl.render('history_resolved', {
        count: items.length,
        plural: items.length === 1 ? '' : 's',
        rows: items.map((r) => {
          const t = TYPES[r.type] || { label: r.type, color: '#587079' };
          return {
            color: t.color,
            id: r.id,
            title: r.title,
            typeLabel: t.label,
            when: r.resolvedAt ? 'Resolved ' + fmtDate.format(r.resolvedAt) : 'Posted ' + fmtDate.format(r.createdAt),
            pills: pillsHTML(r)
          };
        })
      });
      return;
    }

    const entries = db.log
      .filter((e) => inHistRange(e.createdAt))
      .filter((e) => !needle || `${e.title} ${e.actor} ${logText(e)}`.toLowerCase().includes(needle));

    body.innerHTML = Tpl.render('history_log', {
      count: entries.length,
      plural: entries.length === 1 ? 'y' : 'ies',
      rows: entries.map((e) => ({
        reportId: e.reportId,
        title: e.title || e.reportId,
        text: logText(e),
        when: fmtDate.format(e.createdAt),
        actor: e.actor || ''
      }))
    });
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
  let edit = null;
  let geoBanner = null;
  let photoUrl = null;

  const GEO_STYLE = { color: '#c9443b', weight: 2, dashArray: '6 4', fillColor: '#c9443b', fillOpacity: 0.15, interactive: false };

  function geoHandle(latlng, title) {
    return L.marker(latlng, {
      draggable: true,
      keyboard: false,
      title,
      icon: L.divIcon({ className: 'geo-handle', html: Tpl.render('geo_handle'), iconSize: [16, 16], iconAnchor: [8, 8] })
    }).addTo(geoLayer);
  }

  function startShapeEdit(kind, init, done) {
    state.drawingGeo = true;
    edit = {
      kind,
      center: [state.draft.lat, state.draft.lng],
      radius: init.radius || 1000,
      bounds: init.bounds ? init.bounds.map((p) => [p[0], p[1]]) : null,
      pts: init.points ? init.points.map((p) => [p[0], p[1]]) : [],
      done
    };
    qs('#map').classList.add('is-placing');
    map.closePopup();
    showGeoBanner();
    redrawGeo();
    if (kind === 'circle') map.fitBounds(L.latLng(edit.center).toBounds(edit.radius * 3), { padding: [30, 30] });
    else if (kind === 'rectangle') map.fitBounds(L.latLngBounds(edit.bounds).pad(0.4));
    else if (edit.pts.length) map.fitBounds(L.latLngBounds(edit.pts).pad(0.3));
    else map.setView(edit.center, 15);
  }

  function stopGeoDraw() {
    state.drawingGeo = false;
    edit = null;
    qs('#map').classList.remove('is-placing');
    geoLayer.clearLayers();
    if (geoBanner) geoBanner.hidden = true;
  }

  function redrawGeo() {
    geoLayer.clearLayers();
    if (!edit) return;

    if (edit.kind === 'circle') {
      const c = edit.center;
      const circle = L.circle(c, { ...GEO_STYLE, radius: edit.radius }).addTo(geoLayer);
      const dLng = edit.radius / (111320 * Math.cos(c[0] * Math.PI / 180));
      const h = geoHandle([c[0], c[1] + dLng], 'Drag to change the radius');
      h.on('drag', () => {
        const ll = h.getLatLng();
        edit.radius = Math.min(10000, Math.max(100, Math.round(haversine(c[0], c[1], ll.lat, ll.lng))));
        circle.setRadius(edit.radius);
        updateGeoBanner();
      });
      h.on('dragend', redrawGeo);
    } else if (edit.kind === 'rectangle') {
      const b = edit.bounds;
      const rect = L.rectangle(b, GEO_STYLE).addTo(geoLayer);
      const corners = () => [[b[0][0], b[0][1]], [b[0][0], b[1][1]], [b[1][0], b[1][1]], [b[1][0], b[0][1]]];
      const handles = corners().map((p, i) => {
        const h = geoHandle(p, 'Drag to resize');
        h.on('drag', () => {
          const ll = h.getLatLng();
          const lat = clampLat(ll.lat), lng = clampLng(ll.lng);
          if (i === 0) { b[0][0] = lat; b[0][1] = lng; }
          if (i === 1) { b[0][0] = lat; b[1][1] = lng; }
          if (i === 2) { b[1][0] = lat; b[1][1] = lng; }
          if (i === 3) { b[1][0] = lat; b[0][1] = lng; }
          rect.setBounds(L.latLngBounds(b));
          corners().forEach((q, j) => { if (j !== i) handles[j].setLatLng(q); });
          updateGeoBanner();
        });
        h.on('dragend', () => {
          edit.bounds = [
            [Math.min(b[0][0], b[1][0]), Math.min(b[0][1], b[1][1])],
            [Math.max(b[0][0], b[1][0]), Math.max(b[0][1], b[1][1])]
          ];
          redrawGeo();
        });
        return h;
      });
    } else {
      const pts = edit.pts;
      let poly = null;
      if (pts.length >= 2) poly = (pts.length >= 3 ? L.polygon(pts, GEO_STYLE) : L.polyline(pts, GEO_STYLE)).addTo(geoLayer);
      pts.forEach((p, i) => {
        const h = geoHandle(p, 'Drag to move this point. Right-click to remove it.');
        h.on('drag', () => {
          const ll = h.getLatLng();
          pts[i] = [ll.lat, ll.lng];
          if (poly) poly.setLatLngs(pts);
        });
        h.on('dragend', updateGeoBanner);
        h.on('contextmenu', () => { pts.splice(i, 1); redrawGeo(); });
      });
    }
    updateGeoBanner();
  }

  function showGeoBanner() {
    if (!geoBanner) {
      geoBanner = document.createElement('div');
      geoBanner.className = 'placing-banner';
      geoBanner.setAttribute('role', 'status');
      qs('.mapwrap').appendChild(geoBanner);
      geoBanner.addEventListener('click', onGeoBannerClick);
    }
    const title = { circle: 'Adjust the circle', rectangle: 'Adjust the rectangle', polygon: 'Draw the affected area' }[edit.kind];
geoBanner.innerHTML = Tpl.render('geo_banner', { title: title, polygon: edit.kind === 'polygon' });
    geoBanner.hidden = false;
  }

  function updateGeoBanner() {
    const hint = qs('#geoHint');
    if (!hint || !edit) return;
    let ok = true, text = '';
    if (edit.kind === 'circle') {
      text = `${edit.radius} m radius. Drag the white handle to change it.`;
    } else if (edit.kind === 'rectangle') {
      const [w, h] = rectSizeM(edit.bounds);
      text = `About ${Math.round(w)} m by ${Math.round(h)} m. Drag a corner to resize.`;
      ok = w >= 20 && h >= 20;
    } else {
      const n = edit.pts.length;
      const bad = n >= 4 && selfIntersects(edit.pts);
      text = bad ? 'The lines cross. Move a point so they do not.'
        : n < 3 ? `Click the map to add points (${n} so far, at least 3).`
        : `${n} points, about ${polyAreaKm2(edit.pts).toFixed(2)} km\u00b2. Drag points to adjust, click the map to add more.`;
      ok = n >= 3 && !bad;
    }
    hint.textContent = text;
    const done = qs('#geoDone');
    if (done) done.disabled = !ok;
  }

  function onGeoBannerClick(e) {
    const b = e.target.closest('[data-geo]');
    if (!b || !edit) return;
    const act = b.dataset.geo;
    if (act === 'undo') { edit.pts.pop(); return redrawGeo(); }
    if (act === 'reset') {
      const d = state.draft;
      const r = Number(qs('#rRadius').value) || 1000;
      if (edit.kind === 'circle') edit.radius = r;
      else if (edit.kind === 'rectangle') edit.bounds = defaultGeo('rectangle', d.lat, d.lng, r).bounds;
      else edit.pts = defaultGeo('polygon', d.lat, d.lng, r).points;
      return redrawGeo();
    }
    if (act === 'cancel') {
      const cb = edit.done;
      stopGeoDraw();
      if (cb) cb(null);
      return;
    }
    if (act === 'done') {
      const done = qs('#geoDone');
      if (done && done.disabled) return;
      let result;
      if (edit.kind === 'circle') result = { radius: edit.radius };
      else if (edit.kind === 'rectangle') {
        result = { geo: { type: 'rectangle', bounds: edit.bounds.map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]) } };
      } else {
        result = { geo: { type: 'polygon', points: edit.pts.map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]) } };
      }
      const cb = edit.done;
      stopGeoDraw();
      if (cb) cb(result);
    }
  }

  map.on('click', (e) => {
    if (!state.drawingGeo || !edit || edit.kind !== 'polygon') return;
    if (!inBacolod(e.latlng.lat, e.latlng.lng)) return toast('Keep the area inside Bacolod City.', 'warning');
    if (edit.pts.length >= 200) return toast('That is the most points one area can have.', 'warning');
    edit.pts.push([e.latlng.lat, e.latlng.lng]);
    redrawGeo();
  });

  function captureForm() {
    return {
      type: qs('#rType').value, title: qs('#rTitleInput').value,
      desc: qs('#rDesc').value, status: qs('#rStatus').value,
      official: qs('#rOfficial').checked, starts: qs('#rStarts').value, ends: qs('#rEnds').value,
      radius: qs('#rRadius') ? qs('#rRadius').value : '',
      range: qs('#rRange') ? qs('#rRange').value : '',
      shape: qs('#rShape') ? qs('#rShape').value : 'circle',
      removePhoto: qs('#rPhotoRemove').checked
    };
  }

  function restoreForm(f) {
    qs('#rType').value = f.type;
    qs('#rTitleInput').value = f.title;
    qs('#rDesc').value = f.desc;
    qs('#rStatus').value = f.status;
    qs('#rOfficial').checked = f.official;
    qs('#rStarts').value = f.starts;
    qs('#rEnds').value = f.ends;
    if (qs('#rShape')) {
      qs('#rRadius').value = f.radius;
      fillRangeSelect(f.type, f.range);
      qs('#rShape').value = f.shape;
    }
    qs('#rPhotoRemove').checked = f.removePhoto;
    toggleScheduleRow();
  }

  function beginDrawArea() {
    if (!state.draft) return;
    const editing = state.editingId ? getReport(state.editingId) : null;
    const snapshot = captureForm();
    const pin = { ...state.draft };
    const verifying = state.verifying;
    const kind = snapshot.shape;
    if (kind !== 'circle' && !state.draftGeo) regenGeo();
    const init = kind === 'circle' ? { radius: Number(snapshot.radius) || 1000 }
      : kind === 'rectangle' ? { bounds: state.draftGeo.bounds }
      : { points: state.draftGeo.points };
    const geoBefore = state.draftGeo;

    qs('#reportDialog').close();
    startShapeEdit(kind, init, (result) => {
      state.draftGeo = geoBefore;
      if (result && result.geo) state.draftGeo = result.geo;
      if (result && result.radius) { snapshot.radius = String(result.radius); snapshot.range = 'custom'; }
      openReportForm({ report: editing, lat: pin.lat, lng: pin.lng, official: snapshot.official, keepGeo: true, verifying });
      restoreForm(snapshot);
      updateGeoUi();
    });
  }

  function updateGeoUi() {
    if (!qs('#rShape')) return;
    const kind = qs('#rShape').value;
    qs('#circleRow').hidden = kind !== 'circle';

    const g = state.draftGeo;
    const radius = Number(qs('#rRadius').value) || 1000;
    let summary = '';
    if (kind === 'circle') summary = `Circle, ${radius} m around the pin.`;
    else if (g) summary = coverageLabel({ geofence: g }) + '.';
    qs('#geoSummary').textContent = summary;

    let text = '';
    const d = state.draft;
    if (isAdmin() && d) {
      const n = affectedResidents({ lat: d.lat, lng: d.lng, radius, geofence: kind === 'circle' ? null : g }).length;
      const when = qs('#rOfficial').checked ? 'will be notified' : 'will be notified once the report is verified';
      text = `${n} resident${n === 1 ? '' : 's'} with a home marker inside this area ${when}.`;
    }
    qs('#geoAffected').textContent = text;
  }

  function renderLegend() {
    const rows = [
      ...Object.entries(TYPES).map(([k, t]) => ({ pin: PipeMarkers.legend(k), label: t.label })),
      { pin: PipeMarkers.legend('unverified'), label: 'Not yet verified' }
    ];
    if (homeArea()) rows.push({ pin: PipeMarkers.legend('home'), label: 'Your home' });
    qs('#legend').innerHTML = Tpl.render('legend', { rows: rows, hotOn: state.hotOn });
  }

  async function init() {
    if (!currentUser()) { location.replace('login.html'); return; }

    try {
      await loadReports();
      if (isResident()) {
        myHome = await fetchMyHome();
        api(API.profile, { action: 'get' }).then((r) => applyProfile(r.profile)).catch(() => { });
        await loadNotifications().catch(() => { db.notifications = []; });
        db.notifications.forEach((n) => seenNoteIds.add(n.id));
      } else {
        await loadUserHomes();
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not load data', text: errMsg(err), confirmButtonText: 'OK' });
    }

    fillSelect(qs('#fType'), [['', 'All types'], ...Object.entries(TYPES).map(([k, v]) => [k, v.label])], '');
    fillSelect(qs('#fStatus'), [['', 'All statuses'], ...Object.entries(STATUSES).filter(([k]) => !(isAdmin() && k === 'resolved'))], '');

    qs('#fSearch').addEventListener('input', (e) => { state.filters.q = e.target.value; refresh({ keepView: true }); });
    qs('#fType').addEventListener('change', (e) => { state.filters.type = e.target.value; refresh({ keepView: true }); });
    qs('#fStatus').addEventListener('change', (e) => { state.filters.status = e.target.value; refresh({ keepView: true }); });
    qs('#fVerify').addEventListener('change', (e) => { state.filters.verify = e.target.value; refresh({ keepView: true }); });

    [['#fScope', 'scope'], ['#fFrom', 'from'], ['#fTo', 'to']].forEach(([sel, key]) => {
      const el = qs(sel);
      if (el) el.addEventListener('change', (e) => { state.filters[key] = e.target.value; refresh({ keepView: true }); });
    });
    qs('#clearFilters').addEventListener('click', () => {
      state.filters = emptyFilters();
      syncFilterControls();
      refresh({ keepView: true });
    });

    qs('#reportList').addEventListener('click', (e) => {
      const card = e.target.closest('[data-id]');
      if (card) selectReport(card.dataset.id);
    });
    qs('#viewDetail').addEventListener('click', onDetailClick);
    qs('#viewDetail').addEventListener('change', onDetailChange);
    qs('#viewInsights').addEventListener('click', onInsightsClick);
    qs('#viewDashboard').addEventListener('click', onDashboardClick);

    const vp = qs('#viewProfile');
    if (vp) {
      vp.addEventListener('click', onProfileClick);
      vp.addEventListener('change', onProfileChange);
      vp.addEventListener('submit', onProfileSubmit);
    }
    const tp = qs('#tabProfile');
    if (tp) tp.addEventListener('click', () => showView('profile'));

    const vh = qs('#viewHistory');
    if (vh) {
      vh.addEventListener('click', onHistoryClick);
      vh.addEventListener('input', onHistoryInput);
      vh.addEventListener('change', onHistoryInput);
    }
    const th = qs('#tabHistory');
    if (th) th.addEventListener('click', () => showView('history'));

    if (qs('#rShape')) {
      qs('#rType').addEventListener('change', onTypeChange);
      qs('#rRange').addEventListener('change', onRangeChange);
      qs('#rShape').addEventListener('change', onShapeChange);
      qs('#rRadius').addEventListener('input', onRadiusInput);
      qs('#btnDrawArea').addEventListener('click', beginDrawArea);
    }
    qs('#rPhoto').addEventListener('change', onPhotoPicked);
    qs('#photoClear').addEventListener('click', clearPhoto);

    qs('#tabReports').addEventListener('click', () => showView('reports'));
    qs('#tabInsights').addEventListener('click', () => showView('insights'));
    qs('#tabDashboard').addEventListener('click', () => showView('dashboard'));

    qs('#btnNewReport').addEventListener('click', () => beginNewReport());
    qs('#btnAnnounce').addEventListener('click', () => { if (isAdmin()) beginNewReport({ official: true }); });

    qs('#authArea').addEventListener('click', (e) => {
      const b = e.target.closest('[data-auth]');
      if (!b) return;
      if (b.dataset.auth === 'logout') logout();
      if (b.dataset.auth === 'profile') showView('profile');
    });

    qs('#reportForm').addEventListener('submit', onReportSubmit);
    qs('#changePin').addEventListener('click', onChangePin);
    qs('#rOfficial').addEventListener('change', toggleScheduleRow);
    qs('#reportDialog').addEventListener('close', () => {
      if (!state.placing && !state.drawingGeo) clearDraftMarker();
    });

    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-close]');
      if (c) qs('#' + c.dataset.close).close();
    });

    document.querySelectorAll('dialog').forEach((d) => {
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    });

    qs('#placeCancel').addEventListener('click', () => { stopPlacing(); clearDraftMarker(); toast('Pin placement cancelled.', 'info'); });
    qs('#placeUseMyLocation').addEventListener('click', useMyLocationForPin);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.placing) { stopPlacing(); clearDraftMarker(); }
    });

    qs('#toggleHotspots').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const on = btn.getAttribute('aria-pressed') !== 'true';
      state.hotOn = on;
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'Hide frequently affected areas' : 'Show frequently affected areas';
      if (on) {
        hotspotLayer.addTo(map);
        await loadHotspots();
        if (hot.data && !hot.data.cells.length) toast('No areas overlap yet. Two or more verified reports must cover the same ground.', 'info');
      } else {
        map.removeLayer(hotspotLayer);
        map.closeTooltip(hotTip);
      }
      renderLegend();
    });

    qs('#btnLocate').addEventListener('click', () => map.locate({ setView: true, maxZoom: 16 }));
    if (qs('#btnPosts')) qs('#btnPosts').addEventListener('click', showAllPosts);
    map.on('locationfound', (e) => {
      if (meMarker) map.removeLayer(meMarker);
      meMarker = L.circleMarker(e.latlng, {
        radius: 8, color: '#0a3d49', weight: 3, fillColor: '#2db6cc', fillOpacity: 1
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

    setInterval(() => { if (!qs('#viewReports').hidden) renderList(); }, 60000);

    async function pollData() {
      if (state.settingHome || state.confirmingHome || state.draggingHome || state.placing || qs('#reportDialog').open) return;
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
}

jQuery(document).ready(function () {
  Tpl.load(VIEW_FILES, startApp, templateFailed);
});
