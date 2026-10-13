<?php

    // resident: their own home marker. admin: the home markers of all residents.

    include "db.php";
    needLogin();

    if ($_SESSION['role'] == "admin") {

        $sql = "SELECT u.id, u.name, u.address, h.lat, h.lng
                FROM user_homes h JOIN user_login u ON u.id = h.user_id
                ORDER BY u.name";
        $result = $conn->query($sql);

        $homes = [];
        while ($row = $result->fetch_assoc()) {
            $homes[] = $row;
        }

        echo json_encode(["status" => "success", "data" => $homes]);

    } else {

        $uid = (int) $_SESSION['id'];
        $result = $conn->query("SELECT lat, lng FROM user_homes WHERE user_id = $uid");
        $row = $result->fetch_assoc();

        echo json_encode(["status" => "success", "data" => $row ? $row : null]);
    }

    $conn->close();
?>
