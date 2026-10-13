<?php

    // the notices of the logged in resident

    include "db.php";
    needLogin();

    $uid = (int) $_SESSION['id'];

    $sql = "SELECT n.id, n.report_id, n.message, n.is_read, n.created_at
            FROM notifications n JOIN reports r ON r.id = n.report_id
            WHERE n.user_id = $uid
            ORDER BY n.created_at DESC
            LIMIT 30";
    $result = $conn->query($sql);

    $notes = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $notes[] = $row;
        }
    }

    echo json_encode(["status" => "success", "data" => $notes]);

    $conn->close();
?>
