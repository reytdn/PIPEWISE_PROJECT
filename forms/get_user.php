<?php

    include "db.php";

    if (!isset($_SESSION['role'])) {
        echo json_encode(["status" => "error", "message" => "Not logged in.", "code" => "login"]);
        exit;
    }

    echo json_encode([
        "status" => "success",
        "user" => [
            "id"    => $_SESSION['id'],
            "role"  => $_SESSION['role'],
            "name"  => $_SESSION['name'],
            "email" => $_SESSION['email']
        ]
    ]);

?>
