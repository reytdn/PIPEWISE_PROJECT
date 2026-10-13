<?php

    // Helpers for telling residents about reports near their home.
    // A resident "has a home" when they placed a home marker on the map.

    include_once "send_email.php";

    // distance in meters between two points on the map
    function distanceM($lat1, $lng1, $lat2, $lng2)
    {
        $r = M_PI / 180;
        $dLat = ($lat2 - $lat1) * $r;
        $dLng = ($lng2 - $lng1) * $r;
        $a = sin($dLat / 2) * sin($dLat / 2)
           + cos($lat1 * $r) * cos($lat2 * $r) * sin($dLng / 2) * sin($dLng / 2);
        return 2 * 6371000 * asin(sqrt($a));
    }

    // is the point inside the drawn area? (points is a list of [lat, lng])
    function pointInPolygon($lat, $lng, $points)
    {
        $inside = false;
        $n = count($points);
        for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
            $yi = $points[$i][0];
            $xi = $points[$i][1];
            $yj = $points[$j][0];
            $xj = $points[$j][1];
            if ((($yi > $lat) != ($yj > $lat)) && ($lng < ($xj - $xi) * ($lat - $yi) / ($yj - $yi) + $xi)) {
                $inside = !$inside;
            }
        }
        return $inside;
    }

    // does the report cover this spot? A drawn area if it has one, otherwise a circle.
    function covers($rep, $lat, $lng)
    {
        if ($rep['geofence'] != "") {
            $g = json_decode($rep['geofence'], true);
            if (is_array($g) && isset($g['points']) && count($g['points']) >= 3) {
                return pointInPolygon($lat, $lng, $g['points']);
            }
        }
        return distanceM($rep['lat'], $rep['lng'], $lat, $lng) <= $rep['radius_m'];
    }

    // Gives a notification (and an email) to every resident whose home is inside
    // the report's radius. Only for official announcements that are scheduled or
    // ongoing, and for code red reports that are not resolved.
    // $force = true sends again to people who already got it.
    // $onlyUser = 0 means everybody, otherwise only that resident.
    // Returns how many residents were notified.
    function notifyResidents($conn, $reportId, $force = false, $onlyUser = 0)
    {
        set_time_limit(120);

        $result = $conn->query("SELECT * FROM reports WHERE id = $reportId");
        $rep = $result->fetch_assoc();
        if (!$rep) {
            return 0;
        }

        $official = $rep['source'] == "official" && ($rep['status'] == "scheduled" || $rep['status'] == "ongoing");
        $codeRed  = $rep['code_red'] == 1 && $rep['status'] != "resolved";
        if (!$official && !$codeRed) {
            return 0;
        }

        if ($codeRed) {
            $message = "CODE RED: " . $rep['title'] . " (" . $rep['area'] . "). This report is close to your home.";
        } else {
            $message = ucfirst($rep['status']) . ": " . $rep['title'] . " (" . $rep['area'] . ")";
            if ($rep['starts_at'] != "") {
                $message .= ", starts " . date("M j, g:i A", strtotime($rep['starts_at']));
            }
            if ($rep['ends_at'] != "") {
                $message .= ", ends " . date("M j, g:i A", strtotime($rep['ends_at']));
            }
            $message .= ". Your home is inside the affected area.";
        }
        $safeMessage = $conn->real_escape_string($message);

        $sql = "SELECT h.user_id, h.lat, h.lng, u.name, u.email
                FROM user_homes h JOIN user_login u ON u.id = h.user_id";
        if ($onlyUser > 0) {
            $sql .= " WHERE h.user_id = $onlyUser";
        }
        $homes = $conn->query($sql);

        $count = 0;
        while ($h = $homes->fetch_assoc()) {

            // inside the area, or (code red) within 1 km of the report
            $inside = covers($rep, $h['lat'], $h['lng']);
            if ($codeRed && distanceM($rep['lat'], $rep['lng'], $h['lat'], $h['lng']) <= 1000) {
                $inside = true;
            }
            if (!$inside) {
                continue;
            }

            $uid = $h['user_id'];
            $old = $conn->query("SELECT id FROM notifications WHERE user_id = $uid AND report_id = $reportId");

            if ($old->num_rows > 0) {
                if (!$force) {
                    continue;
                }
                $conn->query("UPDATE notifications SET message = '$safeMessage', is_read = 0, created_at = NOW()
                              WHERE user_id = $uid AND report_id = $reportId");
            } else {
                $conn->query("INSERT INTO notifications (user_id, report_id, message)
                              VALUES ($uid, $reportId, '$safeMessage')");
            }

            $text = "Hello " . $h['name'] . ",\n\n" . $message . "\n\nOpen PipeSense to see it on the map.\n";
            sendEmail($h['email'], "PipeSense: " . ($codeRed ? "CODE RED " : "") . $rep['title'], $text);

            $count++;
        }

        return $count;
    }

    // When the admin verifies a community report, email the residents
    // who live within 1 km of it (not the person who wrote it).
    function emailNearbyResidents($conn, $reportId)
    {
        set_time_limit(120);

        $result = $conn->query("SELECT * FROM reports WHERE id = $reportId");
        $rep = $result->fetch_assoc();
        if (!$rep || $rep['status'] == "resolved") {
            return 0;
        }

        $homes = $conn->query("SELECT h.user_id, h.lat, h.lng, u.name, u.email
                               FROM user_homes h JOIN user_login u ON u.id = h.user_id");

        $count = 0;
        while ($h = $homes->fetch_assoc()) {

            if ($rep['author_id'] == "user-" . $h['user_id']) {
                continue;
            }
            if (distanceM($rep['lat'], $rep['lng'], $h['lat'], $h['lng']) > 1000) {
                continue;
            }

            $text = "Hello " . $h['name'] . ",\n\n"
                  . "A report near your home was verified by the PipeSense administrator.\n\n"
                  . "Title: " . $rep['title'] . "\n"
                  . "Barangay: " . $rep['area'] . "\n"
                  . "Status: " . ucfirst($rep['status']) . "\n\n"
                  . ($rep['description'] != "" ? $rep['description'] : "No details were added.") . "\n\n"
                  . "Open PipeSense to see it on the map.\n";

            if (sendEmail($h['email'], "PipeSense: " . $rep['title'] . " (" . $rep['area'] . ")", $text)) {
                $count++;
            }
        }

        return $count;
    }

?>
