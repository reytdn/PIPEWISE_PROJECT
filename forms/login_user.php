<?php

    include "db.php";

    $username = $_POST['username'];
    $password = $_POST['password'];

    if ($username == "" || $password == "") {
        stop("Enter your username (or email) and your password.");
    }

    // the person can type the username or the email
    $name = $conn->real_escape_string($username);
    $sql = "SELECT * FROM user_login WHERE username = '$name' OR email = '$name'";
    $result = $conn->query($sql);

    if (!$result) {
        stop("Database problem: " . $conn->error);
    }

    if ($result->num_rows == 0) {
        stop("Incorrect username or password.");
    }

    $row = $result->fetch_assoc();

    // Accounts made with the Sign Up form have a scrambled (hashed) password.
    // Accounts typed by hand into phpMyAdmin have a plain one. Accept both.
    if (password_verify($password, $row['password']) || $password == $row['password']) {

        $_SESSION['role']  = "user";
        $_SESSION['id']    = $row['id'];
        $_SESSION['name']  = $row['name'];
        $_SESSION['email'] = $row['email'];

        echo json_encode([
            "status" => "success",
            "user" => [
                "id"   => $row['id'],
                "name" => $row['name'],
                "role" => "user"
            ]
        ]);

    } else {
        stop("Incorrect username or password.");
    }

    $conn->close();

?>
