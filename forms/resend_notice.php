<?php

    // admin only: send the notice about an announcement / code red report again

    include "db.php";
    include "notify.php";
    needAdmin();

    $id = (int) $_POST['id'];

    $result = $conn->query("SELECT title FROM reports WHERE id = $id");
    $report = $result->fetch_assoc();

    if (!$report) {
        stop("That report no longer exists.");
    }

    $count = notifyResidents($conn, $id, true);
    addLog($conn, $id, $report['title'], "notified", "", $count);

    if ($count > 0) {
        $message = "Notice sent to " . $count . " resident(s).";
    } else {
        $message = "No resident has a home inside this area (or the report is not active).";
    }

    echo json_encode(["status" => "success", "message" => $message]);

    $conn->close();

?>
