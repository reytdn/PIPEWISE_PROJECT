<?php

    // ==================================================
    // login_admin.php
    // Administrator login for PipeSense
    //
    // Receives:  POST username, password
    // Returns:   JSON  { status, message, user? }
    //
    // The administrator account already exists in the
    // "admin_login" table of the "pipesense" database.
    // ==================================================


    // --------------------------------------------------
    // RESPONSE SETTINGS
    // --------------------------------------------------

    // Everything this file prints is JSON, so the
    // JavaScript (fetch) code can read it easily
    header('Content-Type: application/json; charset=utf-8');

    // Never let the browser cache a login response
    header('Cache-Control: no-store');

    // Sessions let PHP remember who logged in
    session_start();


    // --------------------------------------------------
    // DATABASE CONNECTION SETTINGS
    // --------------------------------------------------

    $host = "localhost";    // database runs on this computer
    $user = "root";         // MySQL username
    $pass = "";             // MySQL password (empty for default XAMPP)
    $db   = "pipesense";    // database that holds admin_login and user_login


    // --------------------------------------------------
    // SMALL HELPER: SEND JSON AND STOP
    // --------------------------------------------------
    function respond($payload, $httpCode = 200)
    {
        http_response_code($httpCode);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
        exit;
    }


    // --------------------------------------------------
    // ONLY ACCEPT POST REQUESTS
    // --------------------------------------------------
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            "status"  => "error",
            "message" => "Invalid request."
        ], 405);
    }


    // --------------------------------------------------
    // GET AND CHECK THE DATA SENT FROM JAVASCRIPT
    // --------------------------------------------------

    // trim() removes accidental spaces around the username.
    // The password is NOT trimmed, spaces can be part of it.
    $username = isset($_POST['username']) ? trim($_POST['username']) : '';
    $password = isset($_POST['password']) ? $_POST['password'] : '';

    if ($username === '' || $password === '') {
        respond([
            "status"  => "error",
            "message" => "Enter the administrator username and password."
        ]);
    }


    // --------------------------------------------------
    // CREATE DATABASE CONNECTION
    // --------------------------------------------------

    // Make MySQLi throw exceptions so we can catch problems
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

    try {

        $conn = new mysqli($host, $user, $pass, $db);
        $conn->set_charset("utf8mb4");


        // ----------------------------------------------
        // FIND THE ADMINISTRATOR BY USERNAME
        // ----------------------------------------------

        // Prepared statement: the ? is filled in safely later,
        // which protects against SQL injection
        $stmt = $conn->prepare(
            "SELECT id, username, password, email
             FROM admin_login
             WHERE username = ?
             LIMIT 1"
        );

        // "s" = the value is a string
        $stmt->bind_param("s", $username);
        $stmt->execute();

        // Fetch the matching row (or null if none)
        $admin = $stmt->get_result()->fetch_assoc();
        $stmt->close();


        // ----------------------------------------------
        // CHECK THE PASSWORD
        // ----------------------------------------------

        $valid        = false;   // did the password match?
        $needsUpgrade = false;   // is the stored password still plain text?

        if ($admin) {

            $stored = $admin['password'];

            // password_get_info() tells us if the stored value
            // is a real password_hash() result
            $info   = password_get_info($stored);
            $isHash = !empty($info['algo']);

            if ($isHash) {

                // Normal case: compare against the secure hash
                $valid = password_verify($password, $stored);

                // Re-hash if PHP now recommends a stronger setting
                $needsUpgrade = $valid && password_needs_rehash($stored, PASSWORD_DEFAULT);

            } else {

                // The admin password was saved as plain text
                // (as in the original table). Compare it safely,
                // then convert it to a hash below.
                $valid        = hash_equals($stored, $password);
                $needsUpgrade = $valid;
            }

        } else {

            // Username not found. Still run a hash check so a
            // wrong username takes as long as a wrong password.
            password_verify($password, password_hash("dummy", PASSWORD_DEFAULT));
        }


        // ----------------------------------------------
        // WRONG USERNAME OR PASSWORD
        // ----------------------------------------------
        if (!$valid) {

            // Short pause slows down password guessing
            usleep(400000);

            // Same message for both cases, so attackers cannot
            // tell whether the username exists
            respond([
                "status"  => "error",
                "message" => "Incorrect username or password."
            ]);
        }


        // ----------------------------------------------
        // UPGRADE PLAIN-TEXT PASSWORD TO A SECURE HASH
        // ----------------------------------------------
        if ($needsUpgrade) {

            // A bcrypt hash is 60 characters. If the column is shorter,
            // saving the hash would cut it off and lock the admin out,
            // so only upgrade when the column is wide enough.
            $lenStmt = $conn->prepare(
                "SELECT CHARACTER_MAXIMUM_LENGTH
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'admin_login'
                   AND COLUMN_NAME = 'password'"
            );
            $lenStmt->execute();
            $lenStmt->bind_result($columnLength);
            $lenStmt->fetch();
            $lenStmt->close();

            if ((int) $columnLength >= 60) {

                $newHash = password_hash($password, PASSWORD_DEFAULT);

                $upd = $conn->prepare("UPDATE admin_login SET password = ? WHERE id = ?");
                $upd->bind_param("si", $newHash, $admin['id']);
                $upd->execute();
                $upd->close();
            }
        }


        // ----------------------------------------------
        // LOGIN SUCCESSFUL
        // ----------------------------------------------

        // New session id after login prevents session fixation
        session_regenerate_id(true);

        $_SESSION['pipesense_role']    = 'admin';
        $_SESSION['pipesense_user_id'] = (int) $admin['id'];

        // Send safe details back (never the password)
        respond([
            "status"  => "success",
            "message" => "Login successful.",
            "user"    => [
                "id"       => "admin-" . $admin['id'],
                "username" => $admin['username'],
                "name"     => "PipeSense Admin",
                "email"    => $admin['email'],
                "role"     => "admin"
            ]
        ]);

    } catch (mysqli_sql_exception $e) {

        // Log the technical details on the server only
        error_log("login_admin.php: " . $e->getMessage());

        respond([
            "status"  => "error",
            "message" => "Server error. Check that MySQL is running and the database is set up."
        ], 500);
    }

?>
