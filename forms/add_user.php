<?php
    // saves a new resident (the Sign Up form in login.html)

    include "db.php";

    $username = trim($_POST['username']);
    $password = $_POST['password'];
    $name     = trim($_POST['name']);
    $address  = trim($_POST['address']);
    $email    = strtolower(trim($_POST['email']));

    if ($username == "" || $password == "" || $name == "" || $address == "" || $email == "") {
        stop("Every field is required.");
    }

    if (!preg_match('/^[A-Za-z0-9_.-]{3,30}$/', $username)) {
        stop("Username must be 3 to 30 letters, numbers, dots, dashes or underscores.");
    }

    if (strlen($password) < 8) {
        stop("Password must be at least 8 characters.");
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        stop("Enter a valid email address.");
    }

    // username or email already used?
    $u = $conn->real_escape_string($username);
    $e = $conn->real_escape_string($email);

    $check = $conn->query("SELECT id FROM user_login WHERE username = '$u' OR email = '$e'");
    if ($check->num_rows > 0) {
        stop("That username or email address is already registered.");
    }

    $check = $conn->query("SELECT id FROM admin_login WHERE username = '$u' OR email = '$e'");
    if ($check->num_rows > 0) {
        stop("That username or email address is already registered.");
    }

    // never save the real password, save the scrambled version
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $n = $conn->real_escape_string($name);
    $a = $conn->real_escape_string($address . ", Bacolod City");

    $sql = "INSERT INTO user_login (username, password, name, address, email)
            VALUES ('$u', '$hash', '$n', '$a', '$e')";

    if ($conn->query($sql)) {
        echo json_encode([
            "status" => "success",
            "message" => "Your account has been created. You can now log in."
        ]);
    } else {
        stop("Could not save your account: " . $conn->error);
    }

    $conn->close();

?>
