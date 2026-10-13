$(document).ready(function () {
    var map = L.map('map').setView([10.675594, 122.951431], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Same report types as the main map (colors live in overview.css)
    var TYPES = {
        interruption: 'Water interruption',
        maintenance:  'Maintenance',
        pressure:     'Low pressure',
        quality:      'Water quality'
    };

    var totalReports = 0;

    // Zoomed out: groups of markers. Zoomed in past this level: every report shows as its own pin.
    var markerClusters = L.markerClusterGroup({
        maxClusterRadius: 60,
        disableClusteringAtZoom: 16,
        showCoverageOnHover: false,
        iconCreateFunction: clusterIcon
    });
    map.addLayer(markerClusters);
    var markers = [];
    var latlngs = [];

    refreshLocations();

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // Cluster color depends only on how many reports it holds compared with all reports, not on report type.
    // 1 = green (few) ... 5 = red (many). Change the numbers to tune it.
    function frequencyLevel(count) {
        var share = count / Math.max(totalReports, 1);
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

    function pinIcon(type) {
        var cls = TYPES[type] ? ' t-' + type : '';
        return L.divIcon({
            className: 'pin-wrap',
            html: '<div class="pin' + cls + '"><span>!</span></div>',
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -28]
        });
    }

    function refreshLocations() {
        markerClusters.clearLayers();
        markers = [];
        latlngs = [];

        $.ajax({
            url: "forms/fetch_reports.php",
            type: "GET",
            success: function (response) {
                var res = JSON.parse(response);
                if (res.status === "success") {
                    // set before adding markers so the cluster colors are right
                    totalReports = res.data.length;
                    $('#statTotal').text(totalReports);

                    // official announcements that start today
                    var t = new Date();
                    var today = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
                    var scheduledToday = 0;
                    res.data.forEach(function (report) {
                        if (report.source === 'official' && report.starts_at && report.starts_at.substring(0, 10) === today) {
                            scheduledToday++;
                        }
                    });
                    $('#statScheduled').text(scheduledToday);

                    res.data.forEach(function (report) {
                        let lat = parseFloat(report.lat);
                        let lng = parseFloat(report.lng);
                        let type = report.type;
                        let locname = report.area;
                        let date = report.created_at;
                        let id = report.id;

                        var marker = L.marker([lat, lng], { icon: pinIcon(type) });

                        marker.bindPopup(
                            '<div class="popup-title">' + esc(TYPES[type] || type) + '</div>' +
                            '<div class="popup-sub">' + esc(report.title) + '<br>' + esc(locname) + '<br>' + esc(date) + '</div>',
                            { autoClose: false, closeOnClick: false, closeButton: false }
                        );

                        markerClusters.addLayer(marker);
                        markers.push(marker);
                        latlngs.push([lat, lng]);
                    });
                } else {
                    alert("No reports found.");
                }
            },
            error: function () {
                alert("Error fetching reports.");
            }
        });
    }

    // ---------- Sort by: month / day / year ----------
    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                  'August', 'September', 'October', 'November', 'December'];
    var YEARS_BACK = 5;   // how many years before this one show in the list
    var now = new Date();

    MONTHS.forEach(function (name, i) {
        $('#selMonth').append($('<option>').val(i).text(name));
    });
    for (var y = now.getFullYear(); y >= now.getFullYear() - YEARS_BACK; y--) {
        $('#selYear').append($('<option>').val(y).text(y));
    }

    // start on today's month / date / year
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function resetToToday() {
        now = new Date();
        $('#selMonth').val(now.getMonth());
        $('#selYear').val(now.getFullYear());
        $('#selDay').val(now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()));
    }

    resetToToday();

    function updatePeriod() {
        var mode = $('#sortBy').val();
        var text = '';

        // only the control that matches "Sort by" is shown
        $('#fieldMonth').prop('hidden', mode !== 'month');
        $('#fieldDay').prop('hidden', mode !== 'day');
        $('#fieldYear').prop('hidden', mode !== 'year');

        if (mode === 'month') {
            text = MONTHS[$('#selMonth').val()] + ' ' + now.getFullYear();
        } else if (mode === 'year') {
            text = $('#selYear').val();
        } else {
            var parts = $('#selDay').val().split('-');   // yyyy-mm-dd
            if (parts.length === 3) {
                text = MONTHS[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
            } else {
                text = '';
            }
        }

        $('#periodLabel').text(text.toUpperCase());
        $('#freqPeriod').text(text === '' ? '' : 'Reports during ' + text + '.');

        loadFrequentAreas();
    }

    // yyyy-mm-dd, format compatible with sql
    function ymd(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function periodRange() {
        var mode = $('#sortBy').val();
        var from, to;

        if (mode === 'month') {
            var y = now.getFullYear();
            var m = parseInt($('#selMonth').val(), 10);
            from = new Date(y, m, 1);
            to = new Date(y, m + 1, 1);
        } else if (mode === 'year') {
            var yr = parseInt($('#selYear').val(), 10);
            from = new Date(yr, 0, 1);
            to = new Date(yr + 1, 0, 1);
        } else {
            var parts = $('#selDay').val().split('-');
            if (parts.length !== 3) {
                return null;
            }
            from = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
        }

        return { from: ymd(from), to: ymd(to) };
    }

    // fills Frequently Affected Areas table for the chosen period
    function loadFrequentAreas() {
        var range = periodRange();
        if (range === null) {
            $('#freqBody').html('<tr><td colspan="3" class="freq-empty">Pick a date to see the areas.</td></tr>');
            return;
        }

        $.ajax({
            url: "forms/fetch_areas.php",
            type: "GET",
            data: { from: range.from, to: range.to },
            success: function (response) {
                var res = JSON.parse(response);
                var html = '';

                if (res.status === "success" && res.data.length > 0) {
                    res.data.forEach(function (row, i) {
                        html += '<tr><td>' + (i + 1) + '</td><td>' + esc(row.area) + '</td><td>' + row.report_count + '</td></tr>';
                    });
                } else {
                    html = '<tr><td colspan="3" class="freq-empty">No reports for this period.</td></tr>';
                }
                $('#freqBody').html(html);
            },
            error: function () {
                $('#freqBody').html('<tr><td colspan="3" class="freq-empty">Could not load the areas.</td></tr>');
            }
        });
    }

    updatePeriod();

    $('#selMonth, #selDay, #selYear').on('change', updatePeriod);
    $('#sortBy').on('change', function () {
        resetToToday();
        updatePeriod();
    });
    
    window.addEventListener('resize', () => {
        map.invalidateSize();
    });
});