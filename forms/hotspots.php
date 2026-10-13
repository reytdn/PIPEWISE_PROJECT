<?php

    require __DIR__ . '/common.php';

    // Frequently affected areas.
    // Basis: every VERIFIED report, resolved or still open.
    // Only the ground where the areas of two or more of those reports overlap is returned.

    const HOT_MAX_REPORTS = 2000;
    const HOT_MIN_STEP_M  = 30;
    const HOT_GRID_SIDE   = 70;

    function reportBox($r)
    {
        $g = geofenceOf($r);

        if ($g && $g['type'] === 'rectangle') {
            return [(float) $g['bounds'][0][0], (float) $g['bounds'][0][1],
                    (float) $g['bounds'][1][0], (float) $g['bounds'][1][1]];
        }
        if ($g) {
            $lats = array_column($g['points'], 0);
            $lngs = array_column($g['points'], 1);
            return [(float) min($lats), (float) min($lngs), (float) max($lats), (float) max($lngs)];
        }

        $radius = (int) $r['radius_m'] > 0 ? (int) $r['radius_m'] : DEFAULT_COVERAGE_M;
        $lat    = (float) $r['lat'];
        $lng    = (float) $r['lng'];
        $dLat   = $radius / 111320;
        $dLng   = $radius / (111320 * cos($lat * M_PI / 180));
        return [$lat - $dLat, $lng - $dLng, $lat + $dLat, $lng + $dLng];
    }

    try {

        $conn = db();
        actor();

        $result = $conn->query(
            "SELECT id, lat, lng, radius_m, geofence
             FROM reports
             WHERE verified = 1
             ORDER BY id DESC
             LIMIT " . HOT_MAX_REPORTS
        );

        $reports = [];
        $south = 90; $west = 180; $north = -90; $east = -180;

        while ($r = $result->fetch_assoc()) {
            $box = reportBox($r);
            $r['box'] = $box;
            $reports[] = $r;

            $south = min($south, $box[0]);
            $west  = min($west,  $box[1]);
            $north = max($north, $box[2]);
            $east  = max($east,  $box[3]);
        }

        if (count($reports) < 2) {
            respond(["status" => "success", "cells" => [], "max" => 0, "reports" => count($reports)]);
        }

        $midLat = ($south + $north) / 2;
        $spanM  = max(($north - $south) * 111320, ($east - $west) * 111320 * cos($midLat * M_PI / 180));
        $stepM  = max(HOT_MIN_STEP_M, $spanM / HOT_GRID_SIDE);
        $stepLat = $stepM / 111320;
        $stepLng = $stepM / (111320 * cos($midLat * M_PI / 180));

        $counts = [];

        foreach ($reports as $r) {
            $b  = $r['box'];
            $i0 = (int) floor(($b[0] - $south) / $stepLat);
            $i1 = (int) floor(($b[2] - $south) / $stepLat);
            $j0 = (int) floor(($b[1] - $west)  / $stepLng);
            $j1 = (int) floor(($b[3] - $west)  / $stepLng);

            for ($i = $i0; $i <= $i1; $i++) {
                $cLat = $south + ($i + 0.5) * $stepLat;
                for ($j = $j0; $j <= $j1; $j++) {
                    $cLng = $west + ($j + 0.5) * $stepLng;
                    if (reportCovers($r, $cLat, $cLng)) {
                        $key = $i . ':' . $j;
                        $counts[$key] = isset($counts[$key]) ? $counts[$key] + 1 : 1;
                    }
                }
            }
        }

        $cells = [];
        $max   = 0;
        foreach ($counts as $key => $n) {
            if ($n < 2) continue;
            list($i, $j) = explode(':', $key);
            $cells[] = [
                round($south + $i * $stepLat, 6),
                round($west  + $j * $stepLng, 6),
                $n
            ];
            if ($n > $max) $max = $n;
        }

        respond([
            "status"  => "success",
            "cells"   => $cells,
            "max"     => $max,
            "south"   => round($south, 6),
            "west"    => round($west, 6),
            "stepLat" => round($stepLat, 7),
            "stepLng" => round($stepLng, 7),
            "reports" => count($reports)
        ]);

    } catch (mysqli_sql_exception $e) {
        dbError($e, "hotspots.php");
    }

?>
