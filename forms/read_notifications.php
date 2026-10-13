<?php

    // marks the notices of the logged in resident as read
    // (one notice if an id is sent, otherwise all of them)

    include "db.php";
    needLogin();

    $uid = (int) $_SESSION['id'];

    if (isset($_POST['id'])) {
        $id = (int) $_POST['id'];
        $conn->query("UPDATE notifications SET is_read = 1 WHERE id = $id AND user_id = $uid");
    } else {
        $conn->query("UPDATE notifications SET is_read = 1 WHERE user_id = $uid");
    }

    echo json_encode(["status" => "success"]);

    $conn->close();
?>
