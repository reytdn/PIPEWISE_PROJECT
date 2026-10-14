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

    $action   = isset($_POST['action']) ? trim((string) $_POST['action']) : '';
    $lat      = isset($_POST['lat']) ? trim((string) $_POST['lat']) : '';
    $lng      = isset($_POST['lng']) ? trim((string) $_POST['lng']) : '';
    $barangay = isset($_POST['barangay']) ? trim((string) $_POST['barangay']) : '';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(["status" => "error", "message" => "Invalid request."]);
        exit;
    }

    try {
        $me     = actor($conn);

        if ($action === 'save') {

            if ($me['role'] !== 'resident') {
                echo json_encode(["status" => "error", "message" => "Only residents set a home marker."]);
                exit;
            }

            if (!validPoint($lat, $lng)) {
                echo json_encode(["status" => "error", "message" => "Pick a spot inside Bacolod City."]);
                exit;
            }

            if (!in_array($barangay, BARANGAYS, true)) {
                echo json_encode(["status" => "error", "message" => "Choose your barangay."]);
                exit;
            }

            $latF   = round((float) $lat, 6);
            $lngF   = round((float) $lng, 6);
            $userId = $me['id'];

            $stmt = $conn->prepare(
                "INSERT INTO user_homes (user_id, lat, lng, barangay)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE lat = ?, lng = ?, barangay = ?"
            );
            $stmt->bind_param("iddsdds", $userId, $latF, $lngF, $barangay, $latF, $lngF, $barangay);
            $stmt->execute();
            $stmt->close();

            $stmt = $conn->prepare("UPDATE user_login SET address = ? WHERE id = ?");
            $stmt->bind_param("si", $barangay, $userId);
            $stmt->execute();
            $stmt->close();

            echo json_encode([
                "status"  => "success",
                "message" => "Home saved.",
            "notified" => notifyUserForActiveAdvisories($conn, $userId, $latF, $lngF),
                "home"    => ["lat" => $latF, "lng" => $lngF, "barangay" => $barangay]
            ]);
            exit;
        }

        if ($action === 'get') {

            $home = null;

            if ($me['role'] === 'resident') {
                $userId = $me['id'];
                $stmt = $conn->prepare("SELECT lat, lng, barangay FROM user_homes WHERE user_id = ?");
                $stmt->bind_param("i", $userId);
                $stmt->execute();
                $row = $stmt->get_result()->fetch_assoc();
                $stmt->close();

                if ($row) {
                    $home = ["lat" => (float) $row['lat'], "lng" => (float) $row['lng'], "barangay" => $row['barangay']];
                }
            }

            echo json_encode(["status" => "success", "home" => $home]);
            exit;
        }

        if ($action === 'list') {

            requireAdmin($conn);

            $homes  = [];
            $result = $conn->query(
                "SELECT u.id, u.username, u.name, u.address, h.lat, h.lng
                 FROM user_homes h
                 JOIN user_login u ON u.id = h.user_id
                 ORDER BY u.name"
            );
            while ($row = $result->fetch_assoc()) {
                $homes[] = [
                    "id"       => (int) $row['id'],
                    "username" => $row['username'],
                    "name"     => $row['name'],
                    "address"  => $row['address'],
                    "lat"      => (float) $row['lat'],
                    "lng"      => (float) $row['lng']
                ];
            }

            echo json_encode(["status" => "success", "homes" => $homes]);
            exit;
        }

        echo json_encode(["status" => "error", "message" => "Unknown action."]);
        exit;

    } catch (mysqli_sql_exception $e) {
        dbError($e, "save_home.php");
    }

?>
