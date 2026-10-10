<?php

    require __DIR__ . '/common.php';

    try {

        $conn    = db();
        $reports = [];

        $result = $conn->query(
            "SELECT id, type, status, title, description, area, lat, lng, source, verified,
                    radius_m, geofence, photo,
                    UNIX_TIMESTAMP(created_at) * 1000 AS created_ms,
                    UNIX_TIMESTAMP(starts_at)  * 1000 AS starts_ms,
                    UNIX_TIMESTAMP(ends_at)    * 1000 AS ends_ms
             FROM reports
             WHERE status <> 'resolved'
               AND (source = 'official' OR verified = 1)
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
                "area"      => $r['area'],
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

        respond(["status" => "success", "reports" => $reports]);

    } catch (mysqli_sql_exception $e) {
        dbError($e, "public_reports.php");
    }

?>
