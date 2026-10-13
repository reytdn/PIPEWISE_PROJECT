<?php

    // every report, for the dashboards (dashboard.html)
    // login needed

    include "db.php";
    needLogin();

    $result = $conn->query("SELECT * FROM reports ORDER BY created_at DESC, id DESC");

    $reports = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $reports[] = $row;
        }
    }

    echo json_encode([
        "status" => "success",
        "data" => $reports
    ]);

    $conn->close();
?>
