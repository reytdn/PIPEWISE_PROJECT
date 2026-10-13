<?php

    // saves the home marker of the logged in resident

    include "db.php";
    include "notify.php";
    needLogin();

    if ($_SESSION['role'] != "user") {
        stop("Only residents set a home marker.");
    }

    $lat = $_POST['lat'];
    $lng = $_POST['lng'];

    if (!insideBacolod($lat, $lng)) {
        stop("Pick a spot inside Bacolod City.");
    }

    $uid = (int) $_SESSION['id'];
    $lat = round((float) $lat, 6);
    $lng = round((float) $lng, 6);

    $conn->query("INSERT INTO user_homes (user_id, lat, lng) VALUES ($uid, $lat, $lng)
                  ON DUPLICATE KEY UPDATE lat = $lat, lng = $lng");

    // the old notices were for the old home, so start again
    $conn->query("DELETE FROM notifications WHERE user_id = $uid");

    $count = 0;
    $result = $conn->query("SELECT id FROM reports
                            WHERE (source = 'official' AND status IN ('scheduled', 'ongoing'))
                               OR (code_red = 1 AND status <> 'resolved')");
    while ($row = $result->fetch_assoc()) {
        $count += notifyResidents($conn, $row['id'], false, $uid);
    }

    echo json_encode([
        "status" => "success",
        "message" => "Home saved.",
        "notified" => $count,
        "home" => ["lat" => $lat, "lng" => $lng]
    ]);

    $conn->close();

?>
