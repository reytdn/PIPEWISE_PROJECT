<?php

    require __DIR__ . '/common.php';

    try {

        $conn = db();
        requireAdmin();

        $q = input('q');

        if ($q === '') {
            respond(["status" => "success", "results" => []]);
        }

        if (textLen($q) > 60) {
            $q = function_exists('mb_substr') ? mb_substr($q, 0, 60) : substr($q, 0, 60);
        }

        $like = '%' . addcslashes($q, '%_\\') . '%';

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
