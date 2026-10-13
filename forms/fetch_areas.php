<?php
    include "db.php";

    $from = $_GET['from']; // from = first day of the period
    $to   = $_GET['to']; // to = first day AFTER the period
    // example: October 2026 is from 2026-10-01 to 2026-11-01

    // reports without a start or end time (most resident reports) use the day they were posted.
    // official/verified reports only
    $sql = "SELECT area, COUNT(area) AS report_count FROM reports WHERE (source = 'official' OR verified = 1)
              AND COALESCE(starts_at, created_at) < ?
              AND COALESCE(ends_at, starts_at, created_at) >= ?
            GROUP BY area
            ORDER BY report_count DESC, area ASC
            LIMIT 10";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param("ss", $to, $from);
    $stmt->execute();
    $result = $stmt->get_result();

    $areas = [];
    while ($row = $result->fetch_assoc()) {
        $areas[] = $row;
    }

    echo json_encode([
        "status" => "success",
        "data" => $areas
    ]);

    $conn->close();
?>