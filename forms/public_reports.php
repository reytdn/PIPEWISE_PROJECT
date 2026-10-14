<?php

    require __DIR__ . '/common.php';

    require __DIR__ . '/db_config.php';

    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

    try {
        $conn = new mysqli($host, $user, $pass, $db);
        $conn->set_charset("utf8mb4");
    } catch (mysqli_sql_exception $e) {
        die(json_encode([
            "status"  => "error",
            "message" => "DB connection failed: " . $e->getMessage()
        ]));
    }

    prepareTables($conn);

    try {
        $reports = [];

        $result = $conn->query(
            "SELECT id, type, status, title, description, lat, lng, source, verified,
                    radius_m, geofence, photo,
                    UNIX_TIMESTAMP(created_at) * 1000 AS created_ms,
                    UNIX_TIMESTAMP(starts_at)  * 1000 AS starts_ms,
                    UNIX_TIMESTAMP(ends_at)    * 1000 AS ends_ms
             FROM reports
             WHERE source = 'official' OR verified = 1
             ORDER BY created_at DESC, id DESC
             LIMIT 200"
        );

        while ($r = $result->fetch_assoc()) {
            $reports[] = [
                "id"        => "r" . $r['id'],
                "type"      => $r['type'],
                "status"    => $r['status'],
                "title"     => $r['title'],
                "desc"      => $r['description'] !== null ? $r['description'] : '',
                "lat"       => (float) $r['lat'],
                "lng"       => (float) $r['lng'],
                "source"    => $r['source'],
                "verified"  => (int) $r['verified'] === 1,
                "radius"    => (int) $r['radius_m'],
                "geofence"  => geofenceOf($r),
                "photo"     => $r['photo'] !== null && $r['photo'] !== '' ? $r['photo'] : null,
                "createdAt" => (int) $r['created_ms'],
                "startsAt"  => $r['starts_ms'] !== null ? (int) $r['starts_ms'] : null,
                "endsAt"    => $r['ends_ms']   !== null ? (int) $r['ends_ms']   : null
            ];
        }

        $all   = (int) $conn->query("SELECT COUNT(*) FROM reports WHERE source = 'official' OR verified = 1")->fetch_row()[0];
        $today = (int) $conn->query("SELECT COUNT(*) FROM reports WHERE source = 'official' AND DATE(starts_at) = CURDATE()")->fetch_row()[0];

        echo json_encode([
            "status"  => "success",
            "reports" => $reports,
            "totals"  => ["all" => $all, "scheduledToday" => $today]
        ]);
        exit;

    } catch (mysqli_sql_exception $e) {
        dbError($e, "public_reports.php");
    }

?>
