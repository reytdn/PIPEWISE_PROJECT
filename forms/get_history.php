<?php

    // admin only: the history of the reports (everything that was created, changed or deleted)

    include "db.php";
    needAdmin();

    $sql = "SELECT id, report_id, title, action, from_value, to_value, actor, created_at FROM report_log";

    // only one report if report_id is sent
    if (isset($_GET['report_id'])) {
        $sql .= " WHERE report_id = " . (int) $_GET['report_id'];
    }

    $sql .= " ORDER BY created_at DESC, id DESC LIMIT 200";
    $result = $conn->query($sql);

    $log = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $log[] = $row;
        }
    }

    echo json_encode(["status" => "success", "data" => $log]);

    $conn->close();
?>
