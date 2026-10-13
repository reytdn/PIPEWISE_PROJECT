<?php

    require __DIR__ . '/common.php';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        fail("Invalid request.", 405);
    }

    try {

        $conn   = db();
        $me     = actor();
        $action = input('action');

        if ($action === 'save') {

            if ($me['role'] !== 'resident') {
                fail("Only residents set a home marker.", 403);
            }

            $lat = input('lat');
            $lng = input('lng');

            if (!validPoint($lat, $lng)) {
                fail("Pick a spot inside Bacolod City.");
            }

            $barangay = input('barangay');
            if (!in_array($barangay, BARANGAYS, true)) {
                fail("Choose your barangay.");
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

            respond([
                "status"  => "success",
                "message" => "Home saved.",
            "notified" => notifyUserForActiveAdvisories($conn, $userId, $latF, $lngF),
                "home"    => ["lat" => $latF, "lng" => $lngF, "barangay" => $barangay]
            ]);
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

            respond(["status" => "success", "home" => $home]);
        }

        if ($action === 'list') {

            requireAdmin();

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

            respond(["status" => "success", "homes" => $homes]);
        }

        fail("Unknown action.");

    } catch (mysqli_sql_exception $e) {
        dbError($e, "save_home.php");
    }

?>
