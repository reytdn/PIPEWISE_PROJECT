<?php

    include "db.php";
    needLogin();

    $id = (int) $_POST['id'];

    $result = $conn->query("SELECT * FROM reports WHERE id = $id");
    $report = $result->fetch_assoc();

    if (!$report) {
        stop("That report no longer exists.");
    }
    if ($_SESSION['role'] != "admin" && $report['author_id'] != myKey()) {
        stop("You can only delete your own reports.");
    }

    $conn->query("DELETE FROM notifications WHERE report_id = $id");
    $conn->query("DELETE FROM reports WHERE id = $id");

    addLog($conn, $id, $report['title'], "deleted");

    echo json_encode(["status" => "success", "message" => "Report deleted."]);

    $conn->close();

?>
