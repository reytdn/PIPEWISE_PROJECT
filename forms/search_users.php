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

    $q = isset($_POST['q']) ? trim((string) $_POST['q']) : '';

    try {
        requireAdmin($conn);

        if ($q === '') {
            echo json_encode(["status" => "success", "results" => []]);
            exit;
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

        echo json_encode(["status" => "success", "results" => $results]);
        exit;

    } catch (mysqli_sql_exception $e) {
        dbError($e, "search_users.php");
    }

?>
