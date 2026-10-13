<?php

    include "db.php";

    $username = $_POST['username'];
    $password = $_POST['password'];

    if ($username == "" || $password == "") {
        stop("Enter the administrator username and password.");
    }

    $name = $conn->real_escape_string($username);
    $sql = "SELECT * FROM admin_login WHERE username = '$name'";
    $result = $conn->query($sql);

    if (!$result) {
        stop("Database problem: " . $conn->error);
    }

    if ($result->num_rows == 0) {
        stop("Incorrect username or password.");
    }

    $row = $result->fetch_assoc();

    // the admin password may be plain text or hashed, so accept both
    if (password_verify($password, $row['password']) || $password == $row['password']) {

        $_SESSION['role']  = "admin";
        $_SESSION['id']    = $row['id'];
        $_SESSION['name']  = "PipeSense Admin";
        $_SESSION['email'] = $row['email'];

        echo json_encode([
            "status" => "success",
            "user" => [
                "id"   => $row['id'],
                "name" => "PipeSense Admin",
                "role" => "admin"
            ]
        ]);

    } else {
        stop("Incorrect username or password.");
    }

    $conn->close();

?>
