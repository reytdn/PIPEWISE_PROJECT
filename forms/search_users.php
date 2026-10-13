<?php

    // admin only: finds residents by name, username, email or barangay

    include "db.php";
    needAdmin();

    $q = trim($_GET['q']);

    if ($q == "") {
        echo json_encode(["status" => "success", "data" => []]);
        exit;
    }

    $like = "%" . $conn->real_escape_string($q) . "%";

    // residents with a home marker come first
    $sql = "SELECT u.id, u.name, u.username, u.address, h.lat, h.lng
            FROM user_login u LEFT JOIN user_homes h ON h.user_id = u.id
            WHERE u.name LIKE '$like' OR u.username LIKE '$like' OR u.email LIKE '$like' OR u.address LIKE '$like'
            ORDER BY (h.lat IS NULL), u.name
            LIMIT 8";
    $result = $conn->query($sql);

    $found = [];
    while ($row = $result->fetch_assoc()) {
        $found[] = $row;
    }

    echo json_encode(["status" => "success", "data" => $found]);

    $conn->close();
?>
