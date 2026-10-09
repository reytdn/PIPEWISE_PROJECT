<?php

    // ==================================================
    // search_users.php
    // Search box for the administrator: finds residents by
    // name, username, email or barangay, and returns where
    // their home marker is. Feeds the suggestion box on the map.
    //
    // Receives:  POST (or GET) q
    // Returns:   JSON  { status, results: [ { id, name, username,
    //                    address, hasHome, lat, lng } ] }
    //
    // Administrator only.
    // ==================================================

    require __DIR__ . '/common.php';

    try {

        $conn = db();
        requireAdmin();

        $q = input('q');

        // Nothing typed yet, nothing to suggest
        if ($q === '') {
            respond(["status" => "success", "results" => []]);
        }

        if (textLen($q) > 60) {
            $q = function_exists('mb_substr') ? mb_substr($q, 0, 60) : substr($q, 0, 60);
        }

        // Typed % and _ must be treated as normal letters, not wildcards
        $like = '%' . addcslashes($q, '%_\\') . '%';

        // People who already set a home are listed first
        $stmt = $conn->prepare(
            "SELECT u.id, u.name, u.username, u.address, h.lat, h.lng
             FROM user_login u
             LEFT JOIN user_homes h ON h.user_id = u.id
             WHERE u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.address LIKE ?
             ORDER BY (h.lat IS NULL), u.name
             LIMIT 8"
        );
        $stmt->bind_param("ssss", $like, $like, $like, $like);
        $stmt->execute();
        $result = $stmt->get_result();

        $results = [];
        while ($row = $result->fetch_assoc()) {
            $hasHome = $row['lat'] !== null;
            $results[] = [
                "id"       => (int) $row['id'],
                "name"     => $row['name'],
                "username" => $row['username'],
                "address"  => $row['address'],
                "hasHome"  => $hasHome,
                "lat"      => $hasHome ? (float) $row['lat'] : null,
                "lng"      => $hasHome ? (float) $row['lng'] : null
            ];
        }
        $stmt->close();

        respond(["status" => "success", "results" => $results]);

    } catch (mysqli_sql_exception $e) {
        dbError($e, "search_users.php");
    }

?>
