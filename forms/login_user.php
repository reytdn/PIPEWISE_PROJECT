<?php

    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    session_start();

    $host = "localhost";
    $user = "root";
    $pass = "";
    $db   = "pipesense";

    $debug = true;

    function respond($payload, $httpCode = 200)
    {
        http_response_code($httpCode);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
        exit;
    }

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

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(["status" => "error", "message" => "Invalid request."], 405);
    }

    $identifier = isset($_POST['username']) ? trim($_POST['username']) : '';
    $password   = isset($_POST['password']) ? $_POST['password'] : '';

    if ($identifier === '' || $password === '') {
        respond([
            "status"  => "error",
            "message" => "Enter your username (or email) and your password."
        ]);
    }

    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

    try {

        $conn = new mysqli($host, $user, $pass, $db);
        $conn->set_charset("utf8mb4");

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
            password_verify($password, password_hash("dummy", PASSWORD_DEFAULT));
            usleep(400000);
            respond([
                "status"  => "error",
                "code"    => "bad_login",
                "message" => "Incorrect username or password."
            ]);
        }

        if (!password_verify($password, $row['password'])) {

            usleep(400000);

            respond([
                "status"  => "error",
                "code"    => "bad_login",
                "message" => "Incorrect username or password."
            ]);
        }

        if (password_needs_rehash($row['password'], PASSWORD_DEFAULT)
            && columnLength($conn, 'user_login', 'password') >= 60) {

            $newHash = password_hash($password, PASSWORD_DEFAULT);
            $upd = $conn->prepare("UPDATE user_login SET password = ? WHERE id = ?");
            $upd->bind_param("si", $newHash, $row['id']);
            $upd->execute();
            $upd->close();
        }

        session_regenerate_id(true);
        $_SESSION['pipesense_role']    = 'resident';
        $_SESSION['pipesense_user_id'] = (int) $row['id'];

        $token = bin2hex(random_bytes(16));
        if (!isset($_SESSION['pipesense_tokens']) || !is_array($_SESSION['pipesense_tokens'])) {
            $_SESSION['pipesense_tokens'] = [];
        }
        $_SESSION['pipesense_tokens'][$token] = ['role' => 'resident', 'id' => (int) $row['id']];
        if (count($_SESSION['pipesense_tokens']) > 20) {
            $_SESSION['pipesense_tokens'] = array_slice($_SESSION['pipesense_tokens'], -20, null, true);
        }

        respond([
            "status"  => "success",
            "message" => "Login successful.",
            "user"    => [
                "id"       => "user-" . $row['id'],
                "username" => $row['username'],
                "name"     => $row['name'],
                "address"  => $row['address'],
                "email"    => $row['email'],
                "role"     => "resident",
                "token"    => $token
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
