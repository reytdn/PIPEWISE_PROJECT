<?php

    // ==================================================
    // save_home.php
    // The home marker each resident chooses on the map.
    //
    // Receives:  POST action = save | get | list
    //   save:  lat, lng      (resident only, saves or replaces their home)
    //   get:   nothing       (resident: returns their own home, or null)
    //   list:  nothing       (administrator only: every resident's home)
    // Returns:   JSON  { status, message?, home? | homes? }
    //
    // Table: user_homes (one row per resident)
    // ==================================================

    require __DIR__ . '/common.php';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        fail("Invalid request.", 405);
    }

    try {

        $conn   = db();
        $me     = actor();
        $action = input('action');


        // ==============================================
        // SAVE (insert, or replace the old home)
        // ==============================================
        if ($action === 'save') {

            if ($me['role'] !== 'resident') {
                fail("Only residents set a home marker.", 403);
            }

            $lat = input('lat');
            $lng = input('lng');

            if (!validPoint($lat, $lng)) {
                fail("Pick a spot inside Bacolod City.");
            }

            $latF   = round((float) $lat, 6);
            $lngF   = round((float) $lng, 6);
            $userId = $me['id'];

            // One home per resident: a second save replaces the first
            $stmt = $conn->prepare(
                "INSERT INTO user_homes (user_id, lat, lng)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE lat = ?, lng = ?"
            );
            $stmt->bind_param("idddd", $userId, $latF, $lngF, $latF, $lngF);
            $stmt->execute();
            $stmt->close();

            respond([
                "status"  => "success",
                "message" => "Home saved.",
                "home"    => ["lat" => $latF, "lng" => $lngF]
            ]);
        }


        // ==============================================
        // GET: the logged in resident's own home
        // ==============================================
        if ($action === 'get') {

            $home = null;

            if ($me['role'] === 'resident') {
                $userId = $me['id'];
                $stmt = $conn->prepare("SELECT lat, lng FROM user_homes WHERE user_id = ?");
                $stmt->bind_param("i", $userId);
                $stmt->execute();
                $row = $stmt->get_result()->fetch_assoc();
                $stmt->close();

                if ($row) {
                    $home = ["lat" => (float) $row['lat'], "lng" => (float) $row['lng']];
                }
            }

            respond(["status" => "success", "home" => $home]);
        }


        // ==============================================
        // LIST: every resident's home (administrator only)
        // ==============================================
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
