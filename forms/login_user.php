<?php

    // ==================================================
    // login_user.php
    // Resident (user) login for PipeSense
    //
    // Receives:  POST username (or email), password
    // Returns:   JSON  { status, message, code?, user? }
    //
    // Signing up is handled by add_user.php
    // ==================================================


    // --------------------------------------------------
    // RESPONSE SETTINGS
    // --------------------------------------------------
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    session_start();


    // --------------------------------------------------
    // SETTINGS
    // --------------------------------------------------
    $host = "localhost";
    $user = "root";
    $pass = "";
    $db   = "pipesense";

    // Keep true while building so the exact database problem is shown
    $debug = true;


    // --------------------------------------------------
    // HELPER: SEND JSON AND STOP
    // --------------------------------------------------
    function respond($payload, $httpCode = 200)
    {
        http_response_code($httpCode);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
        exit;
    }


    // --------------------------------------------------
    // HELPER: HOW MANY CHARACTERS A COLUMN CAN HOLD
    // --------------------------------------------------
    function columnLength($conn, $table, $column)
    {
        $stmt = $conn->prepare(
            "SELECT CHARACTER_MAXIMUM_LENGTH
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND COLUMN_NAME = ?"
        );
        $stmt->bind_param("ss", $table, $column);
        $stmt->execute();
        $stmt->bind_result($length);
        $stmt->fetch();
        $stmt->close();

        return (int) $length;
    }


    // --------------------------------------------------
    // ONLY ACCEPT POST REQUESTS
    // --------------------------------------------------
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(["status" => "error", "message" => "Invalid request."], 405);
    }


    // --------------------------------------------------
    // GET AND CHECK THE DATA SENT FROM JAVASCRIPT
    // --------------------------------------------------

    // The person can type either their username or their email
    $identifier = isset($_POST['username']) ? trim($_POST['username']) : '';
    $password   = isset($_POST['password']) ? $_POST['password'] : '';

    if ($identifier === '' || $password === '') {
        respond([
            "status"  => "error",
            "message" => "Enter your username (or email) and your password."
        ]);
    }


    // --------------------------------------------------
    // CONNECT TO THE DATABASE
    // --------------------------------------------------
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

    try {

        $conn = new mysqli($host, $user, $pass, $db);
        $conn->set_charset("utf8mb4");


        // ----------------------------------------------
        // STEP 1: DOES AN ACCOUNT EXIST?
        // ----------------------------------------------

        // Prepared statement: the ? marks are filled in safely,
        // which protects against SQL injection
        $stmt = $conn->prepare(
            "SELECT id, username, password, name, address, email
             FROM user_login
             WHERE username = ? OR email = ?
             LIMIT 1"
        );
        $stmt->bind_param("ss", $identifier, $identifier);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$row) {
            respond([
                "status"  => "error",
                "code"    => "no_account",
                "message" => "No account was found for that username or email. Sign up to create one."
            ]);
        }


        // ----------------------------------------------
        // STEP 2: IS THE PASSWORD CORRECT?
        // ----------------------------------------------
        if (!password_verify($password, $row['password'])) {

            usleep(400000);   // short pause slows down password guessing

            respond([
                "status"  => "error",
                "code"    => "wrong_password",
                "message" => "Incorrect password. Try again."
            ]);
        }


        // ----------------------------------------------
        // Re-hash if PHP now recommends a stronger setting
        // ----------------------------------------------
        if (password_needs_rehash($row['password'], PASSWORD_DEFAULT)
            && columnLength($conn, 'user_login', 'password') >= 60) {

            $newHash = password_hash($password, PASSWORD_DEFAULT);
            $upd = $conn->prepare("UPDATE user_login SET password = ? WHERE id = ?");
            $upd->bind_param("si", $newHash, $row['id']);
            $upd->execute();
            $upd->close();
        }


        // ----------------------------------------------
        // LOGIN SUCCESSFUL: the page will open the User Dashboard
        // ----------------------------------------------

        // New session id after login prevents session fixation
        session_regenerate_id(true);
        $_SESSION['pipesense_role']    = 'resident';
        $_SESSION['pipesense_user_id'] = (int) $row['id'];

        // Send safe details back (never the password)
        respond([
            "status"  => "success",
            "message" => "Login successful.",
            "user"    => [
                "id"       => "user-" . $row['id'],
                "username" => $row['username'],
                "name"     => $row['name'],
                "address"  => $row['address'],
                "email"    => $row['email'],
                "role"     => "resident"
            ]
        ]);

    } catch (mysqli_sql_exception $e) {

        error_log("login_user.php: " . $e->getMessage());

        $reply = [
            "status"  => "error",
            "message" => "Server error. Check that MySQL is running and the pipesense database exists."
        ];
        if ($debug) {
            $reply["detail"] = $e->getMessage();
        }
        respond($reply, 500);
    }

?>
