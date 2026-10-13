$(document).ready(function () {

    // ---------- Settings ----------
    var TYPES = {
        interruption: { label: 'Water interruption', color: '#c9443b' },
        maintenance:  { label: 'Maintenance',        color: '#d98e04' },
        pressure:     { label: 'Low pressure',       color: '#2f78a8' },
        quality:      { label: 'Water quality',      color: '#7a5ba6' }
    };

    var STATUSES = {
        reported:  'Reported',
        scheduled: 'Scheduled',
        ongoing:   'Ongoing',
        resolved:  'Resolved'
    };

    // 61 barangays of Bacolod City
    var AREAS = ['Alangilan', 'Alijis', 'Banago'];
    for (var i = 1; i <= 41; i++) {
        AREAS.push('Barangay ' + i);
    }
    AREAS = AREAS.concat(['Bata', 'Cabug', 'Estefania', 'Felisa', 'Granada', 'Handumanan',
        'Mandalagan', 'Mansilingan', 'Montevista', 'Pahanocoy', 'Punta Taytay',
        'Singcang-Airport', 'Sum-ag', 'Taculing', 'Tangub', 'Villamonte', 'Vista Alegre']);

    var CHECK = '<svg viewBox="0 0 12 12"><path d="M2.5 6.3l2.4 2.4L9.5 3.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';


    // ---------- Things the page remembers ----------
    var user = null;            // who is logged in
    var reports = [];           // every report
    var notes = [];             // notices of the resident
    var home = null;            // home marker of the resident
    var homes = [];             // home markers of all residents (admin)
    var logs = [];              // history (admin)
    var historyFor = null;      // id of the report whose history is shown, null = all
    var selectedId = null;      // report shown in the detail view
    var backTo = 'reports';     // where the Back button goes
    var placing = '';           // what the next click on the map does: '', 'report' or 'home'
    var editingId = null;       // report being edited, null = a new report
    var draftLat = null;        // pin of the report form
    var draftLng = null;
    var draftMarker = null;
    var unreadBefore = -1;
    var geoPoints = [];         // drawn coverage area of an announcement: [[lat, lng], ...]
    var geoBackup = [];
    var drawing = false;        // true while the admin draws the area on the map


    // ---------- Map ----------
    var map = L.map('map').setView([10.6713, 122.9511], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
    }).addTo(map);

    var areaLayer = L.layerGroup().addTo(map);     // circles and drawn areas of announcements (geofencing)
    var markerCount = 0;                         // pins on the map right now (for the cluster colors)

    // Zoomed out: groups of pins. Zoomed in past level 16: every report is its own pin.
    var markerClusters = L.markerClusterGroup({
        maxClusterRadius: 60,
        disableClusteringAtZoom: 16,
        showCoverageOnHover: false,
        iconCreateFunction: clusterIcon
    });
    map.addLayer(markerClusters);
    var homeLayer = L.layerGroup().addTo(map);
    var hotspotLayer = L.layerGroup();
    var drawLayer = L.layerGroup().addTo(map);
    var meLayer = L.layerGroup().addTo(map);

    var homeIcon = L.icon({
        iconUrl: 'assets/images/HOMEMARKER.png',
        iconSize: [44, 44],
        iconAnchor: [22, 44]
    });

    window.addEventListener('resize', function () {
        map.invalidateSize();
    });


    // ---------- Small helpers ----------
    function isAdmin() {
        return user.role === 'admin';
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function typeLabel(type) {
        return TYPES[type] ? TYPES[type].label : type;
    }

    function colorOf(type) {
        return TYPES[type] ? TYPES[type].color : '#587079';
    }

    // MySQL gives dates like "2026-10-10 14:30:00"
    function toDate(s) {
        return new Date(String(s).replace(' ', 'T'));
    }

    function showDate(s) {
        if (!s) {
            return 'Not set';
        }
        return toDate(s).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    // value for a datetime-local box
    function toInput(s) {
        return s ? String(s).replace(' ', 'T').substring(0, 16) : '';
    }

    function ago(s) {
        var minutes = Math.round((Date.now() - toDate(s).getTime()) / 60000);
        if (minutes < 1) return 'just now';
        if (minutes < 60) return minutes + ' min ago';
        if (minutes < 1440) return Math.floor(minutes / 60) + ' h ago';
        return Math.floor(minutes / 1440) + ' d ago';
    }

    function toast(message, icon) {
        Swal.fire({
            toast: true,
            position: 'bottom',
            icon: icon || 'success',
            title: message,
            showConfirmButton: false,
            timer: 3000
        });
    }

    function confirmThen(title, text, button, done) {
        Swal.fire({
            title: title,
            text: text,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: button,
            confirmButtonColor: '#c9443b'
        }).then(function (result) {
            if (result.isConfirmed) {
                done();
            }
        });
    }

    // distance in meters between two points
    function distance(lat1, lng1, lat2, lng2) {
        var r = Math.PI / 180;
        var dLat = (lat2 - lat1) * r;
        var dLng = (lng2 - lng1) * r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * 6371000 * Math.asin(Math.sqrt(a));
    }

    // is the point inside the drawn area?
    function pointInPolygon(lat, lng, pts) {
        var inside = false;
        for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            var yi = pts[i][0], xi = pts[i][1];
            var yj = pts[j][0], xj = pts[j][1];
            if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    // size of a drawn area in square kilometers (roughly)
    function polyAreaKm2(pts) {
        var r = Math.PI / 180;
        var k = Math.cos(pts[0][0] * r) * 6371;
        var sum = 0;
        for (var i = 0; i < pts.length; i++) {
            var a = pts[i];
            var b = pts[(i + 1) % pts.length];
            sum += (a[1] * r * k) * (b[0] * r * 6371) - (b[1] * r * k) * (a[0] * r * 6371);
        }
        return Math.abs(sum / 2);
    }

    // does the report cover this spot? A drawn area if it has one, otherwise a circle.
    function covers(r, lat, lng) {
        if (r.poly) return pointInPolygon(lat, lng, r.poly);
        return distance(r.lat, r.lng, lat, lng) <= r.radius_m;
    }

    function coverageText(r) {
        if (r.poly) return 'Drawn area, ' + r.poly.length + ' points, about ' + polyAreaKm2(r.poly).toFixed(2) + ' km\u00b2';
        return r.radius_m + ' m around the pin';
    }

    function isOwn(r) {
        return r.author_id === user.role + '-' + user.id;
    }

    function canModify(r) {
        return isAdmin() || isOwn(r);
    }

    function getReport(id) {
        for (var i = 0; i < reports.length; i++) {
            if (reports[i].id === id) {
                return reports[i];
            }
        }
        return null;
    }

    // does this announcement / code red report cover the home of the resident?
    function affectsHome(r) {
        if (!home || user.role !== 'user') return false;
        var official = r.source === 'official' && (r.status === 'scheduled' || r.status === 'ongoing');
        var codeRed = r.code_red === 1 && r.status !== 'resolved';
        if (!official && !codeRed) return false;
        return covers(r, home.lat, home.lng) || (codeRed && distance(r.lat, r.lng, home.lat, home.lng) <= 1000);
    }


    // ---------- Talking to the PHP files ----------
    function problem(message, fail) {
        if (fail) {
            fail(message);
        } else {
            Swal.fire('Oops', message, 'error');
        }
    }

    function handle(response, done, fail) {
        var res;
        try {
            res = JSON.parse(response);
        } catch (e) {
            // PHP printed an error instead of JSON, show what it said
            problem(String(response).replace(/<[^>]*>/g, ' ').trim().slice(0, 200), fail);
            return;
        }

        if (res.status !== 'success') {
            if (res.code === 'login') {
                window.location.href = 'login.html';
                return;
            }
            problem(res.message, fail);
            return;
        }
        done(res);
    }

    function getData(url, done) {
        $.ajax({
            url: url,
            type: 'GET',
            success: function (response) {
                handle(response, done);
            },
            error: function () {
                problem('Cannot reach the server. Is Apache running?');
            }
        });
    }

    function send(url, data, done, fail) {
        $.ajax({
            url: url,
            type: 'POST',
            data: data,
            success: function (response) {
                handle(response, done, fail);
            },
            error: function () {
                problem('Cannot reach the server. Is Apache running?', fail);
            }
        });
    }


    // ---------- Start ----------
    getData('forms/get_user.php', function (res) {
        user = res.user;
        start();
    });

    function start() {
        buildDropdowns();

        $('#authArea').html(
            '<div class="user-chip"><strong>' + esc(user.name) + '</strong><span>' + (isAdmin() ? 'Administrator' : 'Resident') + '</span></div>' +
            '<button type="button" class="btn btn-ghost-light btn-small" id="btnLogout">Log out</button>'
        );

        if (isAdmin()) {
            $('#brandSub').text('Administrator console');
            $('#btnAnnounce').prop('hidden', false);
            $('#tabHistory').prop('hidden', false);
            $('#fScope').prop('hidden', true);
            $('#mapSearch').prop('hidden', false);
        } else {
            $('#btnSetHome').prop('hidden', false);
        }

        showView('dashboard');

        loadReports(function () {
            if (isAdmin()) {
                loadHomes();
                welcome();
            } else {
                loadNotes(function () {
                    loadHome(function () {
                        welcome();
                    });
                });
                setInterval(function () { loadNotes(); }, 30000);
            }
        });
    }

    function loadReports(done) {
        getData('forms/get_reports.php', function (res) {
            reports = res.data;
            reports.forEach(function (r) {
                r.id = Number(r.id);
                r.lat = parseFloat(r.lat);
                r.lng = parseFloat(r.lng);
                r.verified = Number(r.verified);
                r.code_red = Number(r.code_red);
                r.radius_m = Number(r.radius_m);

                // the drawn area is saved as text, turn it into a list of points
                r.poly = null;
                if (r.geofence) {
                    try {
                        var g = JSON.parse(r.geofence);
                        if (g.points && g.points.length >= 3) r.poly = g.points;
                    } catch (e) { }
                }
            });
            refresh();
            if (done) done();
        });
    }

    function loadNotes(done) {
        getData('forms/get_notifications.php', function (res) {
            notes = res.data;
            var unread = unreadCount();
            if (unreadBefore !== -1 && unread > unreadBefore) {
                toast('You have a new notice for your home.', 'info');
            }
            unreadBefore = unread;
            drawDashboard();
            if (done) done();
        });
    }

    function loadHome(done) {
        getData('forms/get_home.php', function (res) {
            home = res.data ? { lat: parseFloat(res.data.lat), lng: parseFloat(res.data.lng) } : null;
            drawHome();
            drawDashboard();
            if (home) {
                map.setView([home.lat, home.lng], 14);
            }
            if (done) done();
        });
    }

    function loadHomes() {
        getData('forms/get_home.php', function (res) {
            homes = res.data;
            homes.forEach(function (h) {
                h.lat = parseFloat(h.lat);
                h.lng = parseFloat(h.lng);
            });
            drawHome();
        });
    }

    function unreadCount() {
        var n = 0;
        notes.forEach(function (x) {
            if (Number(x.is_read) === 0) n++;
        });
        return n;
    }

    function welcome() {
        if (sessionStorage.getItem('welcomed')) return;
        sessionStorage.setItem('welcomed', '1');

        if (isAdmin()) {
            var waiting = 0;
            reports.forEach(function (r) {
                if (r.source === 'community' && r.verified === 0 && r.status !== 'resolved') waiting++;
            });
            Swal.fire('Welcome, administrator', waiting + ' report(s) waiting for verification.', 'success');
            return;
        }

        var unread = unreadCount();
        if (!home) {
            Swal.fire({
                title: 'Welcome, ' + user.name.split(' ')[0],
                text: 'Place a home marker on the map so we can tell you about interruptions near your home.',
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Set my home',
                cancelButtonText: 'Later'
            }).then(function (result) {
                if (result.isConfirmed) startPlacing('home');
            });
        } else {
            Swal.fire(
                'Welcome, ' + user.name.split(' ')[0],
                unread > 0 ? unread + ' notice(s) cover your home. Check your dashboard.' : 'No notices for your home right now.',
                unread > 0 ? 'warning' : 'success'
            );
        }
    }

    function refresh() {
        drawMarkers();
        drawList();
        drawDashboard();
        drawInsights();
        if (map.hasLayer(hotspotLayer)) drawHotspots();

        if (!$('#viewDetail').prop('hidden')) {
            if (getReport(selectedId)) {
                drawDetail();
            } else {
                showView('reports');
            }
        }
    }


    // ---------- Dropdowns ----------
    function buildDropdowns() {
        $('#fType').append('<option value="">All types</option>');
        $('#fStatus').append('<option value="">All statuses</option>');
        $('#rArea').append('<option value="">Select barangay</option>');

        for (var k in TYPES) {
            $('#fType').append($('<option>').val(k).text(TYPES[k].label));
            $('#rType').append($('<option>').val(k).text(TYPES[k].label));
        }
        for (var s in STATUSES) {
            $('#fStatus').append($('<option>').val(s).text(STATUSES[s]));
        }
        AREAS.forEach(function (name) {
            $('#rArea').append($('<option>').val(name).text(name));
        });
    }


    // ---------- Tabs ----------
    function showView(name) {
        $('.view').prop('hidden', true);
        $('#view' + name.charAt(0).toUpperCase() + name.slice(1)).prop('hidden', false);

        // the detail view belongs to the Reports tab
        var tab = name === 'detail' ? 'reports' : name;
        $('.tab').removeClass('is-active');
        $('.tab[data-view=' + tab + ']').addClass('is-active');

        if (name === 'history') {
            loadHistory();
        }
    }

    $('.tab').click(function () {
        showView($(this).data('view'));
    });


    // ---------- Pins on the map ----------
    function pinIcon(r) {
        var cls = r.verified ? 'is-verified' : 'is-unverified';
        var inner = r.verified ? CHECK : '<span class="pin-q">?</span>';

        if (r.id === selectedId) cls += ' is-selected';
        if (r.status === 'resolved') cls += ' st-resolved';
        if (r.code_red === 1) cls += ' is-codered';

        return L.divIcon({
            className: 'pin-wrap',
            html: '<div class="pin ' + cls + '" style="--c:' + colorOf(r.type) + '"><span>' + inner + '</span></div>',
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -28]
        });
    }

    // 1 = green (few) ... 5 = red (many). Change the numbers to tune it.
    function frequencyLevel(count) {
        var share = count / Math.max(markerCount, 1);
        if (share >= 0.50) return 5;
        if (share >= 0.30) return 4;
        if (share >= 0.15) return 3;
        if (share >= 0.05) return 2;
        return 1;
    }

    function clusterIcon(cluster) {
        var count = cluster.getChildCount();
        return L.divIcon({
            className: 'cluster-wrap',
            html: '<div class="cluster f' + frequencyLevel(count) + '"><span>' + count + '</span></div>',
            iconSize: [40, 40]
        });
    }

    function drawMarkers() {
        markerClusters.clearLayers();
        areaLayer.clearLayers();

        var shown = filtered(true);
        markerCount = shown.length;     // set before adding the pins so the cluster colors are right

        shown.forEach(function (r) {
            var marker = L.marker([r.lat, r.lng], { icon: pinIcon(r), title: r.title });

            marker.bindPopup(
                '<div class="popup-title">' + esc(r.title) + '</div>' +
                '<div class="popup-sub">' + esc(typeLabel(r.type)) + ' in ' + esc(r.area) + ', ' + STATUSES[r.status] + '</div>',
                { closeButton: false }
            );
            marker.on('click', function () {
                selectReport(r.id, false);
            });
            markerClusters.addLayer(marker);

            // official announcements also show the area they cover
            if (r.source === 'official' && r.status !== 'resolved') {
                var style = {
                    color: colorOf(r.type),
                    weight: 1.5,
                    dashArray: '4 6',
                    fillColor: colorOf(r.type),
                    fillOpacity: 0.07,
                    interactive: false
                };
                if (r.poly) {
                    L.polygon(r.poly, style).addTo(areaLayer);
                } else {
                    style.radius = r.radius_m;
                    L.circle([r.lat, r.lng], style).addTo(areaLayer);
                }
            }
        });
    }

    // red circles on the barangays with many reports
    function drawHotspots() {
        hotspotLayer.clearLayers();

        var areas = {};
        reports.forEach(function (r) {
            if (!areas[r.area]) {
                areas[r.area] = { n: 0, lat: 0, lng: 0 };
            }
            areas[r.area].n++;
            areas[r.area].lat += r.lat;
            areas[r.area].lng += r.lng;
        });

        for (var name in areas) {
            var a = areas[name];
            L.circle([a.lat / a.n, a.lng / a.n], {
                radius: 260 + a.n * 110,
                color: '#c9443b',
                weight: 1.5,
                fillColor: '#c9443b',
                fillOpacity: Math.min(0.12 + a.n * 0.06, 0.45)
            }).bindTooltip(name + ': ' + a.n + ' report(s)').addTo(hotspotLayer);
        }
    }

    $('#toggleHotspots').click(function () {
        if (map.hasLayer(hotspotLayer)) {
            map.removeLayer(hotspotLayer);
            $(this).attr('aria-pressed', 'false');
        } else {
            drawHotspots();
            hotspotLayer.addTo(map);
            $(this).attr('aria-pressed', 'true');
        }
    });

    function drawHome() {
        homeLayer.clearLayers();

        if (home) {
            L.marker([home.lat, home.lng], { icon: homeIcon }).bindPopup('Your home').addTo(homeLayer);
            L.circle([home.lat, home.lng], {
                radius: 1000,
                color: '#1b6f8f',
                weight: 1.5,
                dashArray: '4 6',
                fillOpacity: 0.04,
                interactive: false
            }).addTo(homeLayer);
        }

        // the admin sees the homes of all residents
        homes.forEach(function (h) {
            L.marker([h.lat, h.lng], { icon: homeIcon })
                .bindPopup('<div class="popup-title">' + esc(h.name) + '</div><div class="popup-sub">' + esc(h.address) + '</div>')
                .addTo(homeLayer);
        });
    }

    $('#btnPosts').click(function () {
        var points = filtered(true).map(function (r) {
            return [r.lat, r.lng];
        });
        if (home) points.push([home.lat, home.lng]);

        if (points.length === 0) {
            toast('There are no posts yet.', 'info');
            return;
        }
        map.fitBounds(L.latLngBounds(points).pad(0.15), { maxZoom: 16 });
    });

    $('#btnLocate').click(function () {
        if (!navigator.geolocation) {
            toast('This browser cannot share your location.', 'error');
            return;
        }
        navigator.geolocation.getCurrentPosition(function (p) {
            var loc = [p.coords.latitude, p.coords.longitude];

            meLayer.clearLayers();
            L.circleMarker(loc, { radius: 8, color: '#10303b', weight: 3, fillColor: '#5cc8d7', fillOpacity: 1}).addTo(meLayer).bindTooltip('You are here');

            map.flyTo(loc, 16);
        }, function () {
            toast('Could not get your location. Check your browser permissions.', 'error');
        });
    });


    // ---------- Search and filters ----------
    function filtered(forMap) {
        var q = $.trim($('#fSearch').val()).toLowerCase();
        var type = $('#fType').val();
        var status = $('#fStatus').val();
        var verify = $('#fVerify').val();
        var scope = $('#fScope').val();

        return reports.filter(function (r) {
            // resolved reports are not drawn on the map
            if (forMap && r.status === 'resolved' && r.id !== selectedId) return false;

            if (type && r.type !== type) return false;
            if (status && r.status !== status) return false;
            if (verify === 'verified' && !r.verified) return false;
            if (verify === 'unverified' && r.verified) return false;
            if (!isAdmin() && scope === 'mine' && !isOwn(r)) return false;
            if (!isAdmin() && scope === 'others' && isOwn(r)) return false;

            if (q) {
                var text = (r.title + ' ' + r.description + ' ' + r.area + ' ' + r.author).toLowerCase();
                if (text.indexOf(q) === -1) return false;
            }
            return true;
        });
    }

    $('#fSearch').on('input', function () {
        drawList();
        drawMarkers();
    });

    $('#fType, #fStatus, #fVerify, #fScope').on('change', function () {
        drawList();
        drawMarkers();
    });

    $('#clearFilters').click(function () {
        $('#fSearch').val('');
        $('#fType, #fStatus, #fVerify, #fScope').val('');
        drawList();
        drawMarkers();
    });

    function filtersActive() {
        return $('#fSearch').val() !== '' || $('#fType').val() || $('#fStatus').val() || $('#fVerify').val() || $('#fScope').val();
    }


    // ---------- Little labels ----------
    function pills(r) {
        var html = '';
        if (r.code_red === 1) html += '<span class="pill pill-codered">Code red</span>';
        html += '<span class="pill pill-status-' + r.status + '">' + STATUSES[r.status] + '</span>';
        html += r.verified ? '<span class="pill pill-verified">' + CHECK.replace('<svg', '<svg width="11" height="11"') + 'Verified</span>'
                           : '<span class="pill pill-unverified">Unverified</span>';
        if (r.source === 'official') html += '<span class="pill pill-official">Official announcement</span>';
        if (!isAdmin() && isOwn(r)) html += '<span class="pill pill-mine">Yours</span>';
        if (affectsHome(r)) html += '<span class="pill pill-affects">Affects your home</span>';
        return html;
    }


    // ---------- Report list ----------
    function drawList() {
        var items = filtered(false);

        $('#resultCount').text(items.length + ' of ' + reports.length + ' report(s)');
        $('#clearFilters').prop('hidden', !filtersActive());

        if (items.length === 0) {
            $('#reportList').html(
                '<li class="empty"><h3>' + (reports.length ? 'No reports match' : 'No reports yet') + '</h3>' +
                '<p>' + (reports.length ? 'Try a different search or clear the filters.' : 'Reports and announcements will show up here once they are posted.') + '</p></li>'
            );
            return;
        }

        var html = '';
        items.forEach(function (r) {
            html += '<li>' +
                '<button type="button" class="report-card' + (r.id === selectedId ? ' is-selected' : '') + '" data-id="' + r.id + '" style="--c:' + colorOf(r.type) + '">' +
                    '<h3>' + esc(r.title) + '</h3>' +
                    '<div class="where">' + esc(typeLabel(r.type)) + ' in ' + esc(r.area) + ' &middot; ' + showDate(r.created_at) + '</div>' +
                    '<div class="pills">' + pills(r) + '<span class="time-ago">' + ago(r.created_at) + '</span></div>' +
                '</button></li>';
        });
        $('#reportList').html(html);
    }

    $('#reportList').on('click', '.report-card', function () {
        backTo = 'reports';
        selectReport($(this).data('id'), true);
    });

    function selectReport(id, fly) {
        selectedId = id;
        var r = getReport(id);
        if (!r) return;

        drawDetail();
        showView('detail');

        if (fly) {
            drawMarkers();
            map.flyTo([r.lat, r.lng], Math.max(map.getZoom(), 16));
        }
    }


    // ---------- One report ----------
    function drawDetail() {
        var r = getReport(selectedId);
        if (!r) return;

        var admin = isAdmin();
        var canEdit = canModify(r);

        var backText = { dashboard: 'Back to dashboard', history: 'Back to history', reports: 'Back to all reports' }[backTo];
        var html = '<div class="detail">' +
            '<button type="button" class="back" data-action="back">' + backText + '</button>' +
            '<div class="detail-head" style="--c:' + colorOf(r.type) + '"><h2>' + esc(r.title) + '</h2><div class="pills">' + pills(r) + '</div></div>';

        if (affectsHome(r)) {
            html += '<p class="home-alert"><strong>This affects your home.</strong> Your home marker is inside the area of this announcement.</p>';
        }

        html += '<p class="detail-desc">' + (r.description ? esc(r.description) : 'No details were added to this report.') + '</p>';

        html += '<dl class="facts">' +
            '<dt>Type</dt><dd>' + esc(typeLabel(r.type)) + '</dd>' +
            '<dt>Barangay</dt><dd>' + esc(r.area) + '</dd>' +
            '<dt>Coordinates</dt><dd>' + r.lat.toFixed(5) + ', ' + r.lng.toFixed(5) + '</dd>' +
            '<dt>Posted by</dt><dd>' + esc(r.author || 'Anonymous resident') + '</dd>' +
            '<dt>Posted</dt><dd>' + showDate(r.created_at) + ' (' + ago(r.created_at) + ')</dd>' +
            '<dt>Verification</dt><dd>' + (r.verified ? 'Verified by an administrator' : 'Not yet verified') + '</dd>';

        if (r.source === 'official') {
            html += '<dt>Coverage</dt><dd>' + coverageText(r) + '</dd>';
        }
        if (r.starts_at || r.ends_at) {
            html += '<dt>Schedule</dt><dd>' + showDate(r.starts_at) + ' to ' + showDate(r.ends_at) + '</dd>';
        }
        if (r.status === 'resolved' && r.resolved_at) {
            html += '<dt>Resolved</dt><dd>' + showDate(r.resolved_at) + '</dd>';
        }
        if (admin && r.source === 'official') {
            html += '<dt>Residents in area</dt><dd>' + residentsInArea(r) + '</dd>';
        }
        html += '</dl>';

        if (admin) {
            var options = '';
            for (var s in STATUSES) {
                options += '<option value="' + s + '"' + (s === r.status ? ' selected' : '') + '>' + STATUSES[s] + '</option>';
            }
            html += '<div class="admin-box"><h3>Admin controls</h3><div class="row">' +
                '<select id="adminStatus">' + options + '</select>' +
                '<button type="button" class="btn btn-small" data-action="verify">' + (r.verified ? 'Mark as unverified' : 'Verify report') + '</button>' +
                '</div></div>';
        }

        html += '<div class="actions">' +
            '<button type="button" class="btn" data-action="focus">Show on map</button>';
        if (admin) {
            html += '<button type="button" class="btn" data-action="history">View history</button>';
            if ((r.source === 'official' && (r.status === 'scheduled' || r.status === 'ongoing')) || (r.code_red === 1 && r.status !== 'resolved')) {
                html += '<button type="button" class="btn" data-action="renotify">Send notice again</button>';
            }
        }
        if (canEdit) {
            html += '<button type="button" class="btn" data-action="edit">Edit</button>' +
                    '<button type="button" class="btn btn-danger" data-action="delete">Delete</button>';
        }
        html += '</div></div>';

        $('#viewDetail').html(html);
    }

    function residentsInArea(r) {
        var names = [];
        homes.forEach(function (h) {
            if (covers(r, h.lat, h.lng)) names.push(h.name);
        });
        if (names.length === 0) return 'None have a home marker inside this area.';
        return names.length + ': ' + esc(names.slice(0, 6).join(', ')) + (names.length > 6 ? ', and more' : '');
    }

    $('#viewDetail').on('click', '[data-action]', function () {
        var action = $(this).data('action');
        var r = getReport(selectedId);

        if (action === 'back') {
            showView(backTo);
        } else if (action === 'focus') {
            drawMarkers();
            map.flyTo([r.lat, r.lng], Math.max(map.getZoom(), 16));
        } else if (action === 'edit') {
            openEdit(r.id);
        } else if (action === 'delete') {
            removeReport(r.id);
        } else if (action === 'verify') {
            changeReport({ id: r.id, verified: r.verified ? 0 : 1 });
        } else if (action === 'history') {
            historyFor = r.id;
            backTo = 'reports';
            showView('history');
        } else if (action === 'renotify') {
            send('forms/resend_notice.php', { id: r.id }, function (res) {
                toast(res.message);
            });
        }
    });

    $('#viewDetail').on('change', '#adminStatus', function () {
        changeReport({ id: selectedId, status: $(this).val() });
    });

    // changes some fields of a report (status, verified...)
    function changeReport(data) {
        send('forms/edit_report.php', data, function (res) {
            toast(res.message);
            loadReports();
        });
    }

    function removeReport(id) {
        confirmThen('Delete this report?', 'This cannot be undone.', 'Delete', function () {
            send('forms/delete_report.php', { id: id }, function (res) {
                toast(res.message);
                if (selectedId === id) {
                    selectedId = null;
                    showView('reports');
                }
                loadReports();
            });
        });
    }


    // ---------- Dashboard tab ----------
    function reportRow(r, actions) {
        return '<div class="queue-item" style="--c:' + colorOf(r.type) + '">' +
            '<button type="button" class="queue-main" data-action="open" data-id="' + r.id + '">' +
                '<strong>' + esc(r.title) + '</strong>' +
                '<span>' + esc(typeLabel(r.type)) + ' in ' + esc(r.area) + ', ' + ago(r.created_at) + '</span>' +
            '</button>' +
            '<div class="pills">' + pills(r) + '</div>' +
            '<div class="queue-actions">' + (actions || '') + '</div>' +
        '</div>';
    }

    function statStrip(items, extraClass) {
        var html = '<div class="stat-strip ' + (extraClass || '') + '">';
        items.forEach(function (x) {
            html += '<div class="stat"><b>' + x[0] + '</b><span>' + x[1] + '</span></div>';
        });
        return html + '</div>';
    }

    function drawDashboard() {
        if (!user) return;
        $('#viewDashboard').html(isAdmin() ? adminDashboard() : residentDashboard());
    }

    function residentDashboard() {
        var mine = reports.filter(isOwn);
        var openMine = mine.filter(function (r) { return r.status !== 'resolved'; }).length;
        var announcements = reports.filter(function (r) { return r.source === 'official' && r.status !== 'resolved'; });
        var communityOpen = reports.filter(function (r) { return r.source !== 'official' && r.status !== 'resolved'; }).length;

        var nearHome = 0;
        if (home) {
            reports.forEach(function (r) {
                if (r.status !== 'resolved' && distance(r.lat, r.lng, home.lat, home.lng) <= 1000) nearHome++;
            });
        }

        var unread = unreadCount();

        var html = '<div class="insights">' +
            '<h2>Hello, ' + esc(user.name.split(' ')[0]) + '</h2>' +
            '<p class="lead">Signed in as ' + esc(user.email) + '. Here is what is happening with water service.</p>' +
            statStrip([[announcements.length, 'Announcements'], [communityOpen, 'Open reports'], [nearHome, 'Near my home'], [openMine, 'My open reports']]);

        // notices
        html += '<div class="block"><h3>Notifications for my home' + (unread ? ' <span class="badge">' + unread + ' new</span>' : '') + '</h3>';
        if (!home) {
            html += '<p class="empty-inline">You have not set your home yet. Place a home marker so you can get notices about interruptions near it.</p>' +
                    '<p style="margin:10px 0 0"><button type="button" class="btn btn-small btn-primary" data-action="change-home">Set my home</button></p>';
        } else if (notes.length === 0) {
            html += '<p class="empty-inline">No notices for your home. You will see one here, and get an email, when an announcement covers your home marker.</p>';
        } else {
            notes.slice(0, 5).forEach(function (n) {
                var isNew = Number(n.is_read) === 0;
                html += '<div class="notice-item' + (isNew ? ' is-unread' : '') + '">' +
                    '<button type="button" class="queue-main" data-action="note" data-nid="' + n.id + '" data-id="' + n.report_id + '">' +
                        '<strong>' + esc(n.message) + '</strong>' +
                        '<span>' + ago(n.created_at) + (isNew ? ' &middot; New' : '') + '</span>' +
                    '</button></div>';
            });
            if (unread) {
                html += '<p style="margin:10px 0 0"><button type="button" class="link-btn" data-action="read-all">Mark all as read</button></p>';
            }
        }
        html += '</div>';

        html += '<div class="block"><h3>Quick access</h3><div class="insight-actions">' +
            '<button type="button" class="btn" data-action="my-reports">My reports (' + mine.length + ')</button>' +
            '<button type="button" class="btn" data-action="all-reports">All reports</button>' +
            '<button type="button" class="btn btn-primary" data-action="new">Report an issue</button>' +
            '</div></div>';

        html += '<div class="block"><h3>Current announcements</h3>';
        if (announcements.length === 0) {
            html += '<p class="empty-inline">No active announcements from the water provider.</p>';
        }
        announcements.slice(0, 4).forEach(function (r) {
            html += reportRow(r);
        });
        html += '</div>';

        html += '<div class="block"><h3>My latest reports</h3>';
        if (mine.length === 0) {
            html += '<p class="empty-inline">You have not reported anything yet. Pin an issue on the map to start.</p>';
        }
        mine.slice(0, 3).forEach(function (r) {
            html += reportRow(r,
                '<button type="button" class="btn btn-small" data-action="edit" data-id="' + r.id + '">Edit</button>' +
                '<button type="button" class="btn btn-small btn-danger" data-action="delete" data-id="' + r.id + '">Delete</button>');
        });
        html += '</div>';

        if (home) {
            html += '<div class="insight-actions"><button type="button" class="btn" data-action="change-home">Change my home</button></div>';
        }
        return html + '</div>';
    }

    function adminDashboard() {
        var now = new Date();
        var pending = reports.filter(function (r) { return r.source === 'community' && !r.verified && r.status !== 'resolved'; });
        var verifiedN = reports.filter(function (r) { return r.verified; }).length;
        var resolvedN = reports.filter(function (r) { return r.status === 'resolved'; }).length;
        var active = reports.filter(function (r) { return r.status === 'ongoing' || r.status === 'reported'; }).length;
        var upcoming = reports.filter(function (r) {
            return r.status === 'scheduled' && !(r.ends_at && toDate(r.ends_at) < now);
        });
        var live = reports.filter(function (r) { return r.status === 'ongoing'; }).concat(upcoming);

        var html = '<div class="insights">' +
            '<h2>Admin dashboard</h2>' +
            '<p class="lead">Review resident reports and manage announcements.</p>' +
            statStrip([[reports.length, 'Total reports'], [pending.length, 'Pending verification'], [verifiedN, 'Verified reports'],
                       [resolvedN, 'Resolved reports'], [upcoming.length, 'Upcoming interruptions'], [active, 'Active now']], 'stat-strip-3');

        html += '<div class="block"><h3>Pending verification</h3>';
        if (pending.length === 0) {
            html += '<p class="empty-inline">Nothing to review. New community reports will show up here.</p>';
        }
        pending.forEach(function (r) {
            html += reportRow(r,
                '<button type="button" class="btn btn-small btn-primary" data-action="verify" data-id="' + r.id + '">Verify</button>' +
                '<button type="button" class="btn btn-small btn-danger" data-action="delete" data-id="' + r.id + '">Remove</button>');
        });
        html += '</div>';

        html += '<div class="block"><h3>Ongoing and upcoming interruptions</h3>';
        if (live.length === 0) {
            html += '<p class="empty-inline">No ongoing or upcoming interruptions right now.</p>';
        }
        live.forEach(function (r) {
            html += reportRow(r,
                '<button type="button" class="btn btn-small" data-action="resolve" data-id="' + r.id + '">Mark as resolved</button>' +
                '<button type="button" class="btn btn-small" data-action="edit" data-id="' + r.id + '">Edit</button>');
        });
        html += '</div>';

        html += '<div class="insight-actions">' +
            '<button type="button" class="btn btn-primary" data-action="announce">Post announcement</button>' +
            '<button type="button" class="btn" data-action="all-history">Report history</button>' +
            '<button type="button" class="btn" data-action="test-mail">Send test email</button>' +
            '<button type="button" class="btn" data-action="export">Download records (CSV)</button>' +
            '</div></div>';
        return html;
    }

    $('#viewDashboard').on('click', '[data-action]', function () {
        var action = $(this).data('action');
        var id = $(this).data('id');

        if (action === 'open') {
            backTo = 'dashboard';
            selectReport(id, true);
        } else if (action === 'note') {
            send('forms/read_notifications.php', { id: $(this).data('nid') }, function () {
                loadNotes();
            });
            backTo = 'dashboard';
            selectReport(id, true);
        } else if (action === 'read-all') {
            send('forms/read_notifications.php', {}, function () {
                loadNotes();
            });
        } else if (action === 'edit') {
            openEdit(id);
        } else if (action === 'delete') {
            removeReport(id);
        } else if (action === 'verify') {
            changeReport({ id: id, verified: 1 });
        } else if (action === 'resolve') {
            changeReport({ id: id, status: 'resolved' });
        } else if (action === 'my-reports') {
            $('#fSearch, #fType, #fStatus, #fVerify').val('');
            $('#fScope').val('mine');
            drawList();
            drawMarkers();
            showView('reports');
        } else if (action === 'all-reports') {
            $('#fSearch, #fType, #fStatus, #fVerify, #fScope').val('');
            drawList();
            drawMarkers();
            showView('reports');
        } else if (action === 'new') {
            newReport(false);
        } else if (action === 'announce') {
            newReport(true);
        } else if (action === 'test-mail') {
            testMail();
        } else if (action === 'export') {
            exportReports();
        } else if (action === 'all-history') {
            historyFor = null;
            showView('history');
        } else if (action === 'change-home') {
            startPlacing('home');
        }
    });


    // ---------- Insights tab ----------
    function drawInsights() {
        var total = reports.length;
        var active = reports.filter(function (r) { return r.status === 'ongoing' || r.status === 'reported'; }).length;
        var scheduled = reports.filter(function (r) { return r.status === 'scheduled'; }).length;
        var verified = reports.filter(function (r) { return r.verified; }).length;
        var percent = total ? Math.round(verified / total * 100) : 0;

        var html = '<div class="insights"><h2>Water service summary</h2>' +
            '<p class="lead">Based on all ' + total + ' records in the system.</p>' +
            statStrip([[total, 'Total reports'], [active, 'Active now'], [scheduled, 'Scheduled'], [percent + '%', 'Verified']]);

        // bars by type and by status
        var typeRows = [];
        for (var k in TYPES) {
            typeRows.push({ label: TYPES[k].label, color: TYPES[k].color, n: reports.filter(function (r) { return r.type === k; }).length });
        }
        var statusRows = [];
        for (var s in STATUSES) {
            statusRows.push({ label: STATUSES[s], color: 'var(--s-' + s + ')', n: reports.filter(function (r) { return r.status === s; }).length });
        }
        html += '<div class="block"><h3>Reports by type</h3>' + bars(typeRows) + '</div>';
        html += '<div class="block"><h3>Reports by status</h3>' + bars(statusRows) + '</div>';

        // barangays with the most reports
        var counts = {};
        reports.forEach(function (r) {
            counts[r.area] = (counts[r.area] || 0) + 1;
        });
        var ranked = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 8);

        html += '<div class="block"><h3>Areas with the most reports</h3>';
        if (ranked.length === 0) {
            html += '<p class="lead">No reports yet.</p>';
        }
        ranked.forEach(function (name) {
            var open = reports.filter(function (r) { return r.area === name && r.status !== 'resolved'; }).length;
            html += '<div class="area-row"><span class="area-name">' + esc(name) +
                (counts[name] >= 3 ? '<span class="flag">Frequently affected</span>' : '') + '</span>' +
                '<span class="area-count">' + counts[name] + '</span>' +
                '<span class="area-sub">' + open + ' still open.</span></div>';
        });
        html += '</div>';
        html += '<div class="insight-actions"><button type="button" class="btn" data-action="export">Download records (CSV)</button></div></div>';

        $('#viewInsights').html(html);
    }

    function bars(rows) {
        var max = 1;
        rows.forEach(function (x) {
            if (x.n > max) max = x.n;
        });

        var html = '';
        rows.forEach(function (x) {
            html += '<div class="bar-row"><span>' + esc(x.label) + '</span>' +
                '<div class="bar-track"><div class="bar-fill" style="width:' + (x.n / max * 100) + '%;--c:' + x.color + '"></div></div>' +
                '<span class="bar-num">' + x.n + '</span></div>';
        });
        return html;
    }


    // ---------- History tab (admin) ----------
    function loadHistory() {
        var url = 'forms/get_history.php';
        if (historyFor !== null) {
            url += '?report_id=' + historyFor;
        }
        getData(url, function (res) {
            logs = res.data;
            drawHistory();
        });
    }

    function logText(e) {
        var t = '"' + e.title + '"';
        if (e.action === 'created') return 'created ' + t + (e.to_value ? ' (' + e.to_value + ')' : '');
        if (e.action === 'status') return 'changed ' + t + ' from ' + e.from_value + ' to ' + e.to_value;
        if (e.action === 'verified') return 'verified ' + t;
        if (e.action === 'unverified') return 'removed the verification of ' + t;
        if (e.action === 'edited') return 'edited ' + t;
        if (e.action === 'deleted') return 'deleted ' + t;
        if (e.action === 'notified') return 'sent notices about ' + t + ' to ' + e.to_value + ' resident(s)';
        return e.action + ' ' + t;
    }

    function drawHistory() {
        var html = '<div class="insights"><h2>' + (historyFor !== null ? 'History of one report' : 'Report history') + '</h2>' +
            '<p class="lead">Everything that was created, changed or deleted.</p>';

        if (historyFor !== null) {
            html += '<p><button type="button" class="link-btn" id="showAllHistory">Show the history of all reports</button></p>';
        }
        if (logs.length === 0) {
            html += '<p class="empty-inline">Nothing here yet.</p>';
        } else {
            html += '<p><button type="button" class="btn btn-small" id="exportHistory">Download history (CSV)</button></p>';
        }
        logs.forEach(function (e) {
            html += '<div class="log-row"><div><strong>' + esc(e.actor) + '</strong> ' + esc(logText(e)) + '</div>' +
                '<div class="log-when">' + showDate(e.created_at) + '</div></div>';
        });
        $('#viewHistory').html(html + '</div>');
    }

    $('#viewHistory').on('click', '#showAllHistory', function () {
        historyFor = null;
        loadHistory();
    });


    // ---------- Pinning a spot on the map ----------
    function startPlacing(what) {
        placing = what;

        if (what === 'home') {
            $('#placingTitle').text('Tag your home');
            $('#placingText').text('Click the map where you live.');
        } else {
            $('#placingTitle').text('Tag the location');
            $('#placingText').text('Click the map where the issue is happening.');
        }

        $('#placingBanner').prop('hidden', false);
        $('#map').addClass('is-placing');
    }

    function stopPlacing() {
        placing = '';
        $('#placingBanner').prop('hidden', true);
        $('#map').removeClass('is-placing');
    }

    map.on('click', function (e) {
        meLayer.clearLayers();
        if (placing) {
            picked(e.latlng.lat, e.latlng.lng);
        } else if (drawing) {
            addPoint(e.latlng.lat, e.latlng.lng);
        } else if (Date.now() - popupClosedAt > 300) {
            reportAt(e.latlng.lat, e.latlng.lng);
        }
    });

    var popupClosedAt = 0;
    map.on('popupclose', function () {
        popupClosedAt = Date.now();
    });
 
    function reportAt(lat, lng) {
        editingId = null;
        fillForm(null, false);
        setDraft(lat, lng);
        $('#reportDialog')[0].showModal();
    }

    function picked(lat, lng) {
        var what = placing;
        stopPlacing();

        if (what === 'report') {
            setDraft(lat, lng);
            $('#reportDialog')[0].showModal();
        } else if (what === 'home') {
            askHome(lat, lng);
        }
    }

    $('#placeUseMyLocation').click(function () {
        if (!navigator.geolocation) {
            toast('This browser cannot share your location.', 'error');
            return;
        }
        navigator.geolocation.getCurrentPosition(function (p) {
            picked(p.coords.latitude, p.coords.longitude);
        }, function () {
            toast('Could not get your location. Click the map instead.', 'error');
        });
    });

    $('#placeCancel').click(function () {
        var what = placing;
        stopPlacing();
        // cancelled while changing the pin of a report: bring the form back
        if (what === 'report' && draftLat !== null) {
            $('#reportDialog')[0].showModal();
        }
    });

    function setDraft(lat, lng) {
        draftLat = lat;
        draftLng = lng;
        $('#locText').text(lat.toFixed(5) + ', ' + lng.toFixed(5));

        if (draftMarker) {
            map.removeLayer(draftMarker);
        }
        draftMarker = L.marker([lat, lng], {
            icon: L.divIcon({ className: 'pin-wrap', html: '<div class="draft-pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
            interactive: false
        }).addTo(map);
    }

    function clearDraft() {
        draftLat = null;
        draftLng = null;
        if (draftMarker) {
            map.removeLayer(draftMarker);
            draftMarker = null;
        }
    }


    // ---------- Home marker (residents) ----------
    $('#btnSetHome').click(function () {
        startPlacing('home');
    });

    function askHome(lat, lng) {
        Swal.fire({
            title: 'Use this spot as your home?',
            text: 'You will get notices (and emails) about interruptions near it.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, save it'
        }).then(function (result) {
            if (!result.isConfirmed) return;

            send('forms/save_home.php', { lat: lat, lng: lng }, function (res) {
                home = { lat: res.home.lat, lng: res.home.lng };
                drawHome();
                map.flyTo([home.lat, home.lng], 15);
                toast('Home saved. ' + res.notified + ' notice(s) cover it.');
                loadNotes();
                refresh();
            });
        });
    }


    // ---------- Report form ----------
    $('#btnNewReport').click(function () {
        newReport(false);
    });

    $('#btnAnnounce').click(function () {
        newReport(true);
    });

    // a new report: first pin the spot on the map, then fill in the form
    function newReport(official) {
        editingId = null;
        clearDraft();
        fillForm(null, official);
        showView('reports');
        startPlacing('report');
    }

    function openEdit(id) {
        var r = getReport(id);
        editingId = id;
        fillForm(r, false);
        setDraft(r.lat, r.lng);
        $('#reportDialog')[0].showModal();
    }

    function fillForm(r, official) {
        $('#reportTitle').text(r ? 'Edit report' : (official ? 'Post announcement' : 'Report an issue'));
        $('#reportSubmit').text(r ? 'Save changes' : 'Submit report');
        $('#locText').text('No pin yet');

        $('#rType').val(r ? r.type : 'interruption');
        $('#rArea').val(r ? r.area : '');
        $('#rTitleInput').val(r ? r.title : '');
        $('#rDesc').val(r && r.description ? r.description : '');
        $('#reportError').prop('hidden', true);

        // status: the admin can always choose it, a resident only when editing
        $('#rStatus').empty();
        for (var s in STATUSES) {
            if (isAdmin() || s !== 'scheduled') {
                $('#rStatus').append($('<option>').val(s).text(STATUSES[s]));
            }
        }
        $('#rStatus').val(r ? r.status : (official ? 'scheduled' : 'reported'));
        $('#rStatusField').prop('hidden', !(isAdmin() || r));

        // only the admin has code red and official announcements
        $('#codeRedField').prop('hidden', !isAdmin());
        $('#officialBox').prop('hidden', !isAdmin());
        $('#rCodeRed').prop('checked', r ? r.code_red === 1 : false);
        $('#rOfficial').prop('checked', r ? r.source === 'official' : official);
        $('#rStarts').val(r ? toInput(r.starts_at) : '');
        $('#rEnds').val(r ? toInput(r.ends_at) : '');
        $('#rRadius').val(r ? r.radius_m : 1000);
        $('#officialFields').prop('hidden', !$('#rOfficial').prop('checked'));

        geoPoints = (r && r.poly) ? r.poly.slice() : [];
        $('#rGeoPolygon').prop('checked', geoPoints.length >= 3);
        $('#rGeoCircle').prop('checked', geoPoints.length < 3);
        toggleGeoRows();
    }

    // ---------- Drawing a coverage area ----------
    function geoSummaryText() {
        if (geoPoints.length < 3) return 'No area drawn yet.';
        return 'Drawn area, ' + geoPoints.length + ' points, about ' + polyAreaKm2(geoPoints).toFixed(2) + ' km\u00b2';
    }

    // circle: show the radius box. custom area: show the draw button.
    function toggleGeoRows() {
        var polygon = $('#rGeoPolygon').prop('checked');
        $('#circleRow').prop('hidden', polygon);
        $('#polygonRow').prop('hidden', !polygon);
        $('#geoSummary').text(geoSummaryText());
    }

    $('#rGeoCircle, #rGeoPolygon').change(toggleGeoRows);

    $('#btnDrawArea').click(function () {
        geoBackup = geoPoints.slice();
        $('#reportDialog')[0].close();
        drawing = true;
        $('#drawBanner').prop('hidden', false);
        $('#map').addClass('is-placing');
        redrawGeo();
    });

    function addPoint(lat, lng) {
        geoPoints.push([Math.round(lat * 1000000) / 1000000, Math.round(lng * 1000000) / 1000000]);
        redrawGeo();
    }

    // do the lines of the drawn shape cross each other?
    function turn(p, q, r) {
        var v = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
        return v > 0 ? 1 : (v < 0 ? -1 : 0);
    }

    function linesCross(a, b, c, d) {
        var o1 = turn(a, b, c), o2 = turn(a, b, d), o3 = turn(c, d, a), o4 = turn(c, d, b);
        return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
    }

    function selfCrossing(pts) {
        var n = pts.length;
        for (var i = 0; i < n; i++) {
            for (var j = i + 1; j < n; j++) {
                // lines that touch each other at a corner do not count
                if (j === i + 1 || (i === 0 && j === n - 1)) continue;
                if (linesCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
            }
        }
        return false;
    }

    // the shape itself, and the message in the banner
    var shapeLayer = L.layerGroup().addTo(map);

    function drawShape() {
        shapeLayer.clearLayers();

        if (geoPoints.length >= 3) {
            L.polygon(geoPoints, { color: '#1b6f8f', weight: 2, fillOpacity: 0.15, interactive: false }).addTo(shapeLayer);
        } else if (geoPoints.length === 2) {
            L.polyline(geoPoints, { color: '#1b6f8f', weight: 2, interactive: false }).addTo(shapeLayer);
        }

        var crossing = geoPoints.length >= 4 && selfCrossing(geoPoints);
        $('#drawDone').prop('disabled', geoPoints.length < 3 || crossing);

        if (crossing) {
            $('#drawCount').text('The lines cross each other. Drag a point or undo the last one.');
        } else if (geoPoints.length >= 3) {
            $('#drawCount').text(geoPoints.length + ' points. Drag a point to move it, or click Done.');
        } else {
            $('#drawCount').text(geoPoints.length + ' point(s). Click the map to add points (at least 3).');
        }
    }

    // one round handle for every point. They can be dragged.
    function redrawGeo() {
        drawLayer.clearLayers();

        geoPoints.forEach(function (point, i) {
            var handle = L.marker(point, {
                draggable: true,
                icon: L.divIcon({ className: 'geo-handle', html: '<span></span>', iconSize: [16, 16], iconAnchor: [8, 8] })
            });

            handle.on('drag', function (e) {
                var spot = e.target.getLatLng();
                geoPoints[i] = [Math.round(spot.lat * 1000000) / 1000000, Math.round(spot.lng * 1000000) / 1000000];
                drawShape();
            });
            handle.addTo(drawLayer);
        });

        drawShape();
    }

    // leaves the drawing mode and brings the form back
    function stopDrawing() {
        drawing = false;
        $('#drawBanner').prop('hidden', true);
        $('#map').removeClass('is-placing');
        drawLayer.clearLayers();
        shapeLayer.clearLayers();
        $('#reportDialog')[0].showModal();
        toggleGeoRows();
    }

    $('#drawUndo').click(function () {
        geoPoints.pop();
        redrawGeo();
    });

    $('#drawClear').click(function () {
        geoPoints = [];
        redrawGeo();
    });

    $('#drawDone').click(function () {
        if (geoPoints.length < 3) {
            toast('Add at least 3 points.', 'error');
            return;
        }
        if (selfCrossing(geoPoints)) {
            toast('The lines of the area cross each other. Move a point.', 'error');
            return;
        }
        stopDrawing();
    });

    $('#drawCancel').click(function () {
        geoPoints = geoBackup;
        stopDrawing();
    });


    $('#rOfficial').change(function () {
        $('#officialFields').prop('hidden', !this.checked);
    });

    $('#changePin').click(function () {
        $('#reportDialog')[0].close();
        startPlacing('report');
    });

    function closeForm() {
        $('#reportDialog')[0].close();
        clearDraft();
        editingId = null;
        geoPoints = [];
    }

    $('#cancelDialog, #closeDialog').click(closeForm);

    function formError(message) {
        $('#reportError').text(message).prop('hidden', false);
    }

    $('#reportForm').submit(function (e) {
        e.preventDefault();

        var data = {
            type: $('#rType').val(),
            area: $('#rArea').val(),
            title: $.trim($('#rTitleInput').val()),
            desc: $.trim($('#rDesc').val()),
            lat: draftLat,
            lng: draftLng
        };

        if (draftLat === null) {
            formError('Pin the location on the map first (Change pin).');
            return;
        }
        if (data.title === '') {
            formError('Add a short title so others know what is happening.');
            return;
        }
        if (data.area === '') {
            formError('Choose the barangay.');
            return;
        }

        if (isAdmin() || editingId !== null) {
            data.status = $('#rStatus').val();
        }
        if (isAdmin()) {
            data.code_red = $('#rCodeRed').prop('checked') ? 1 : 0;
            data.official = $('#rOfficial').prop('checked') ? 1 : 0;
            data.starts_at = $('#rStarts').val();
            data.ends_at = $('#rEnds').val();
            data.radius = $('#rRadius').val();

            data.geofence = '';
            if ($('#rOfficial').prop('checked') && $('#rGeoPolygon').prop('checked')) {
                if (geoPoints.length < 3) {
                    formError('Draw the coverage area on the map (at least 3 points), or choose the circle.');
                    return;
                }
                if (selfCrossing(geoPoints)) {
                    formError('The lines of the drawn area cross each other. Draw it again.');
                    return;
                }
                data.geofence = JSON.stringify({ type: 'polygon', points: geoPoints });
            }
        }

        var url = 'forms/add_report.php';
        if (editingId !== null) {
            url = 'forms/edit_report.php';
            data.id = editingId;
        }

        $('#reportSubmit').prop('disabled', true);
        send(url, data, function (res) {
            $('#reportSubmit').prop('disabled', false);
            closeForm();
            toast(res.message);
            loadReports();
        }, function (message) {
            $('#reportSubmit').prop('disabled', false);
            formError(message);
        });
    });


    // ---------- Download as CSV (opens in Excel) ----------
    function downloadCSV(filename, rows) {
        var lines = rows.map(function (row) {
            return row.map(function (value) {
                var text = String(value == null ? '' : value);
                return '"' + text.replace(/"/g, '""') + '"';
            }).join(',');
        });

        var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function exportReports() {
        var rows = [['ID', 'Type', 'Status', 'Title', 'Details', 'Barangay', 'Latitude', 'Longitude', 'Source',
                     'Verified', 'Code red', 'Posted by', 'Posted', 'Starts', 'Ends', 'Resolved']];
        reports.forEach(function (r) {
            rows.push([r.id, typeLabel(r.type), STATUSES[r.status], r.title, r.description, r.area, r.lat, r.lng, r.source,
                       r.verified ? 'yes' : 'no', r.code_red ? 'yes' : 'no', r.author, r.created_at, r.starts_at, r.ends_at, r.resolved_at]);
        });
        downloadCSV('pipesense-reports.csv', rows);
    }

    function exportHistory() {
        var rows = [['When', 'Who', 'What happened', 'Report ID']];
        logs.forEach(function (e) {
            rows.push([e.created_at, e.actor, logText(e), e.report_id]);
        });
        downloadCSV('pipesense-history.csv', rows);
    }

    $('#viewInsights').on('click', '[data-action=export]', exportReports);
    $('#viewHistory').on('click', '#exportHistory', exportHistory);


    // ---------- Search for a resident (admin) ----------
    var found = [];
    var searchTimer = null;

    $('#userSearch').on('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(searchUsers, 250);
    });

    function searchUsers() {
        var q = $.trim($('#userSearch').val());
        if (q === '') {
            $('#userSuggest').prop('hidden', true);
            return;
        }

        getData('forms/search_users.php?q=' + encodeURIComponent(q), function (res) {
            found = res.data;

            var html = '';
            if (found.length === 0) {
                html = '<li class="suggest-empty">No residents found.</li>';
            }
            found.forEach(function (u, i) {
                var noHome = u.lat === null;
                html += '<li data-i="' + i + '"' + (noHome ? ' class="no-home"' : '') + '>' +
                    '<strong>' + esc(u.name) + '</strong>' +
                    '<span>@' + esc(u.username) + ' &middot; ' + esc(u.address) + '</span>' +
                    (noHome ? '<em>No home set yet</em>' : '') + '</li>';
            });
            $('#userSuggest').html(html).prop('hidden', false);
        });
    }

    // go to the home of the chosen resident
    function chooseUser(u) {
        $('#userSearch').val(u.name);
        $('#userSuggest').prop('hidden', true);

        if (u.lat === null) {
            toast(u.name + ' has not set a home yet.', 'info');
            return;
        }

        var lat = parseFloat(u.lat);
        var lng = parseFloat(u.lng);
        map.flyTo([lat, lng], 17);
        L.popup()
            .setLatLng([lat, lng])
            .setContent('<div class="popup-title">' + esc(u.name) + '</div><div class="popup-sub">' + esc(u.address) + '</div>')
            .openOn(map);
    }

    $('#userSuggest').on('mousedown', 'li[data-i]', function (e) {
        e.preventDefault();
        chooseUser(found[$(this).data('i')]);
    });

    $('#userSearch').on('keydown', function (e) {
        if (e.key === 'Escape') {
            $('#userSuggest').prop('hidden', true);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (found.length) chooseUser(found[0]);
        }
    });

    $(document).on('click', function (e) {
        if (!$(e.target).closest('#mapSearch').length) {
            $('#userSuggest').prop('hidden', true);
        }
    });


    // ---------- Test email (admin) ----------
    function testMail() {
        Swal.fire({
            title: 'Send a test email',
            text: 'Checks that the Gmail settings in forms/mail_config.php work.',
            input: 'email',
            inputPlaceholder: 'name@example.com',
            showCancelButton: true,
            confirmButtonText: 'Send'
        }).then(function (result) {
            if (!result.isConfirmed) return;

            toast('Sending...', 'info');
            send('forms/test_mail.php', { to: result.value }, function (res) {
                Swal.fire('Done', res.message, 'success');
            });
        });
    }


    // ---------- Log out ----------
    $('#authArea').on('click', '#btnLogout', function () {
        $.ajax({
            url: 'forms/logout.php',
            type: 'GET',
            success: function () {
                sessionStorage.removeItem('welcomed');
                window.location.href = 'index.html';
            }
        });
    });

});