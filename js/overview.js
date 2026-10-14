jQuery(document).ready(function () {
  'use strict';

  const ENDPOINT = 'forms/public_reports.php';
  const AREAS = 'forms/area_counts.php';
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
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                  'August', 'September', 'October', 'November', 'December'];
  const YEARS_BACK = 5;   // how many years before this one show in the list

  const qs = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  try {
    const u = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (u && u.role) {
      const href = u.role === 'admin' ? 'admin_dashboard.html' : 'user_dashboard.html';
      qs('#publicActions').innerHTML = `<a class="btn btn-accent" href="${href}">Open my dashboard</a>`;
      qs('#btnMakeReport').setAttribute('href', href);
    }
  } catch (e) { }

  const map = L.map('map', { zoomControl: false }).setView(CENTER, 13);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  const streetTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  const satelliteTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
  });

  const viewToggle = L.control({ position: 'topright' });
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
  window.addEventListener('resize', () => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 300);

  let totalReports = 0;
  let allReports = [];
  let currentTotals = null;

  function frequencyLevel(count) {
    const share = count / Math.max(totalReports, 1);
    if (share >= 0.50) return 5;
    if (share >= 0.30) return 4;
    if (share >= 0.15) return 3;
    if (share >= 0.05) return 2;
    return 1;
  }
  const markerLayer = L.markerClusterGroup({
    maxClusterRadius: 60,
    disableClusteringAtZoom: 16,
    showCoverageOnHover: false,
    iconCreateFunction: (cluster) => {
      const n = cluster.getChildCount();
      return L.divIcon({
        className: 'cluster-wrap',
        html: `<div class="cluster f${frequencyLevel(n)}"><span>${n}</span></div>`,
        iconSize: [40, 40]
      });
    }
  }).addTo(map);
  const areaLayer = L.layerGroup().addTo(map);
  const markers = new Map();

  qs('#legend').innerHTML = `
    <h3>Legend</h3>
    <p class="legend-note">Grouped reports</p>
    <div class="freq-bar"><span class="f1"></span><span class="f2"></span><span class="f3"></span><span class="f4"></span><span class="f5"></span></div>
    <div class="freq-ends"><span>Fewer</span><span>More</span></div>
    <div class="legend-sep"></div>
    <h3>Report type</h3>
    ${Object.entries(TYPES).map(([k, t]) =>
      `<div class="legend-item">${PipeMarkers.legend(k)}${t.label}</div>`).join('')}
    <div class="legend-sep"></div>
    <div class="legend-item"><span class="legend-swatch dashed"></span>Area affected</div>`;

  const fmt = (ms) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  function schedule(r) {
    if (r.startsAt && r.endsAt) return `${fmt(r.startsAt)} to ${fmt(r.endsAt)}`;
    if (r.startsAt) return `From ${fmt(r.startsAt)}`;
    if (r.endsAt) return `Until ${fmt(r.endsAt)}`;
    return '';
  }

  function popupHTML(r) {
    const t = TYPES[r.type] || { label: r.type };
    const when = r.source === 'official' ? schedule(r) : '';
    const photo = r.photo
      ? `<img class="popup-photo" src="${esc(r.photo)}" alt="Photo attached to this report" loading="lazy">`
      : '';
    return photo + `<div class="popup-title">${esc(r.title)}</div>` +
      `<div class="popup-sub">${esc(t.label)} &middot; ${esc(STATUSES[r.status] || r.status)}</div>` +
      (when ? `<div class="popup-sub">${esc(when)}</div>` : '') +
      (r.desc ? `<p style="margin:8px 0 0;max-width:240px">${esc(r.desc)}</p>` : '');
  }

  let first = true;

  function getFilteredReports() {
    const range = periodRange();

    if (!range) return allReports;

    const [fy, fm, fd] = range.from.split('-').map(Number);
    const [ty, tm, td] = range.to.split('-').map(Number);

    const from = new Date(fy, fm - 1, fd);
    const to   = new Date(ty, tm - 1, td);

    return allReports.filter((report) => {
      const timestamp = report.startsAt || report.createdAt;

      if (!timestamp) return false;

      const reportDate = new Date(timestamp);

      return reportDate >= from && reportDate < to;
    });
  }

  function renderFiltered() {
    const filteredReports = getFilteredReports();
    render(filteredReports, currentTotals);
  }

  function render(reports, totals) {
    qs('#statTotal').textContent = totals ? totals.all : reports.length;
    qs('#statScheduled').textContent = totals ? totals.scheduledToday : '-';

    markerLayer.clearLayers();
    areaLayer.clearLayers();
    markers.clear();
    totalReports = reports.length;
    const batch = [];
    reports.forEach((r) => {
      const t = TYPES[r.type] || { color: '#587079' };
      const m = L.marker([r.lat, r.lng], {
        icon: PipeMarkers.divIcon(TYPES[r.type] ? r.type : 'pressure', 'pin-img st-' + esc(r.status)),
        title: r.title,
        riseOnHover: true
      });
      m.bindPopup(popupHTML(r), { closeButton: false, maxWidth: 260, minWidth: 180 });
      m.on('popupopen', (ev) => {
        const img = ev.popup.getElement() && ev.popup.getElement().querySelector('.popup-photo');
        if (img && !img.complete) img.addEventListener('load', () => ev.popup.update());
      });
      batch.push(m);
      const g = r.geofence;
      const cStyle = { color: t.color, weight: 1.5, dashArray: '4 6', fillColor: t.color, fillOpacity: 0.09, interactive: false };
      if (g && g.type === 'rectangle' && g.bounds) L.rectangle(g.bounds, cStyle).addTo(areaLayer);
      else if (g && g.type === 'polygon' && g.points.length >= 3) L.polygon(g.points, cStyle).addTo(areaLayer);
      else if (r.radius) L.circle([r.lat, r.lng], { ...cStyle, radius: r.radius }).addTo(areaLayer);
      markers.set(r.id, m);
    });
    markerLayer.addLayers(batch);

    if (first && reports.length) {
      map.fitBounds(L.featureGroup([...markers.values()]).getBounds().pad(0.25), { maxZoom: 15 });
    }
    first = false;
  }

  function showProblem(message) {
    qs('#statTotal').textContent = '-';
    qs('#statScheduled').textContent = '-';
    qs('#legend').insertAdjacentHTML('beforeend', `<p class="legend-note" role="alert" style="margin-top:14px;color:#a8322a">${esc(message)}</p>`);
  }

  let lastSignature = '';

  function load() {
    $.ajax({
      url: ENDPOINT,
      type: 'GET',
      dataType: 'text',
      cache: false,

      success: function (response) {
        let data;
        try {
          data = JSON.parse(response);
        } catch (e) {
          console.error('JSON parse error:', e);
          if (first) { showProblem('Unexpected reply from ' + ENDPOINT + ': ' + String(response).replace(/<[^>]*>/g, ' ').trim().slice(0, 140)); first = false; }
          return;
        }

        if (data.status !== 'success') {
          if (first) { showProblem((data.message || 'The server returned an error.') + (data.detail ? ` (${data.detail})` : '')); first = false; }
          return;
        }

        const signature = JSON.stringify([
          data.reports,
          data.totals
        ]);

        if (signature !== lastSignature || first) {
          lastSignature = signature;

          allReports = data.reports;
          currentTotals = data.totals;

          renderFiltered();
        }
      },

      error: function () {
        if (!first) return;
        showProblem('Error connecting to server. Open this page from http://localhost/... with Apache and MySQL running in Laragon.');
        first = false;
      }
    });
  }

  let now = new Date();

  MONTHS.forEach((name, i) => {
    qs('#selMonth').insertAdjacentHTML('beforeend', `<option value="${i}">${name}</option>`);
  });
  for (let y = now.getFullYear(); y >= now.getFullYear() - YEARS_BACK; y--) {
    qs('#selYear').insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`);
  }

  function resetToToday() {
    now = new Date();
    qs('#selMonth').value = now.getMonth();
    qs('#selYear').value = now.getFullYear();
    qs('#selDay').value = ymd(now);
  }

  function periodRange() {
    const mode = qs('#sortBy').value;
    let from, to;
    if (mode === 'month') {
      const m = parseInt(qs('#selMonth').value, 10);
      from = new Date(now.getFullYear(), m, 1);
      to = new Date(now.getFullYear(), m + 1, 1);
    } else if (mode === 'year') {
      const yr = parseInt(qs('#selYear').value, 10);
      from = new Date(yr, 0, 1);
      to = new Date(yr + 1, 0, 1);
    } else {
      const parts = qs('#selDay').value.split('-');
      if (parts.length !== 3) return null;
      from = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
    }
    return { from: ymd(from), to: ymd(to) };
  }

  function periodText() {
    const mode = qs('#sortBy').value;
    if (mode === 'month') return MONTHS[qs('#selMonth').value] + ' ' + now.getFullYear();
    if (mode === 'year') return qs('#selYear').value;
    const parts = qs('#selDay').value.split('-');
    return parts.length === 3 ? MONTHS[+parts[1] - 1] + ' ' + (+parts[2]) + ', ' + parts[0] : '';
  }

  const freqRow = (html) => `<tr><td colspan="3" class="freq-empty">${html}</td></tr>`;
  let areaTicket = 0;

  function loadFrequentAreas() {
    const range = periodRange();
    if (!range) { qs('#freqBody').innerHTML = freqRow('Pick a date to see the areas.'); return; }

    const mine = ++areaTicket;
    $.ajax({
      url: AREAS,
      type: 'GET',
      data: range,
      dataType: 'text',
      cache: false,

      success: function (response) {
        if (mine !== areaTicket) return;
        let res;
        try {
          res = JSON.parse(response);
        } catch (e) {
          console.error('JSON parse error:', e);
          qs('#freqBody').innerHTML = freqRow('Could not load the areas.');
          return;
        }
        if (res.status === 'success' && res.areas.length) {
          qs('#freqBody').innerHTML = res.areas.map((row, i) =>
            `<tr><td>${i + 1}</td><td>${esc(row.area)}</td><td>${row.report_count}</td></tr>`).join('');
        } else {
          qs('#freqBody').innerHTML = freqRow('No reports for this period.');
        }
      },

      error: function () {
        if (mine === areaTicket) qs('#freqBody').innerHTML = freqRow('Could not load the areas.');
      }
    });
  }

  function updatePeriod() {
    const mode = qs('#sortBy').value;

    qs('#fieldMonth').hidden = mode !== 'month';
    qs('#fieldDay').hidden = mode !== 'day';
    qs('#fieldYear').hidden = mode !== 'year';

    const text = periodText();

    qs('#periodLabel').textContent = text.toUpperCase();
    qs('#freqPeriod').textContent =
      text === '' ? '' : 'Reports during ' + text + '.';

    loadFrequentAreas();

    if (allReports.length) {
      renderFiltered();
    }
  }

  resetToToday();
  updatePeriod();
  ['#selMonth', '#selDay', '#selYear'].forEach((s) => qs(s).addEventListener('change', updatePeriod));
  qs('#sortBy').addEventListener('change', () => { resetToToday(); updatePeriod(); });

  load();
  setInterval(load, REFRESH_MS);
});
