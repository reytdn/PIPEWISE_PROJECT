<?php

    header('Content-Type: application/json; charset=utf-8');

    header('Cache-Control: no-store');

    session_start();

    $host = "localhost";
    $user = "root";
    $pass = "";
    $db   = "pipesense";

    function respond($payload, $httpCode = 200)
    {
        http_response_code($httpCode);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            "status"  => "error",
            "message" => "Invalid request."
        ], 405);
    }

    $username = isset($_POST['username']) ? trim($_POST['username']) : '';
    $password = isset($_POST['password']) ? $_POST['password'] : '';

    if ($username === '' || $password === '') {
        respond([
            "status"  => "error",
            "message" => "Enter the administrator username and password."
        ]);
    }

    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

    try {

        $conn = new mysqli($host, $user, $pass, $db);
        $conn->set_charset("utf8mb4");

        $stmt = $conn->prepare(
            "SELECT id, username, password, email
             FROM admin_login
             WHERE username = ?
             LIMIT 1"
        );

        $stmt->bind_param("s", $username);
        $stmt->execute();

        $admin = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        $valid        = false;
        $needsUpgrade = false;

        if ($admin) {

            $stored = $admin['password'];

            $info   = password_get_info($stored);
            $isHash = !empty($info['algo']);

            if ($isHash) {

                $valid = password_verify($password, $stored);

                $needsUpgrade = $valid && password_needs_rehash($stored, PASSWORD_DEFAULT);

            } else {

                $valid        = hash_equals($stored, $password);
                $needsUpgrade = $valid;
            }

        } else {

            password_verify($password, password_hash("dummy", PASSWORD_DEFAULT));
        }

        if (!$valid) {

            usleep(400000);

            respond([
                "status"  => "error",
                "message" => "Incorrect username or password."
            ]);
        }

        if ($needsUpgrade) {

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

        session_regenerate_id(true);

        $_SESSION['pipesense_role']    = 'admin';
        $_SESSION['pipesense_user_id'] = (int) $admin['id'];

        $token = bin2hex(random_bytes(16));
        if (!isset($_SESSION['pipesense_tokens']) || !is_array($_SESSION['pipesense_tokens'])) {
            $_SESSION['pipesense_tokens'] = [];
        }
        $_SESSION['pipesense_tokens'][$token] = ['role' => 'admin', 'id' => (int) $admin['id']];
        if (count($_SESSION['pipesense_tokens']) > 20) {
            $_SESSION['pipesense_tokens'] = array_slice($_SESSION['pipesense_tokens'], -20, null, true);
        }

        respond([
            "status"  => "success",
            "message" => "Login successful.",
            "user"    => [
                "id"       => "admin-" . $admin['id'],
                "username" => $admin['username'],
                "name"     => "PipeSense Admin",
                "email"    => $admin['email'],
                "role"     => "admin",
                "token"    => $token
            ]
        ]);

    } catch (mysqli_sql_exception $e) {

        error_log("login_admin.php: " . $e->getMessage());

        respond([
            "status"  => "error",
            "message" => "Server error. Check that MySQL is running and the database is set up."
        ], 500);
    }

?>
