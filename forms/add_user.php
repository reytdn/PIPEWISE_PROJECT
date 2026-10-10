<?php

    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');

    $host = "localhost";
    $user = "root";
    $pass = "";
    $db   = "pipesense";

    $debug = true;

    $barangays = [
        "Alangilan",
        "Alijis",
        "Banago",
        "Barangay 1",
        "Barangay 2",
        "Barangay 3",
        "Barangay 4",
        "Barangay 5",
        "Barangay 6",
        "Barangay 7",
        "Barangay 8",
        "Barangay 9",
        "Barangay 10",
        "Barangay 11",
        "Barangay 12",
        "Barangay 13",
        "Barangay 14",
        "Barangay 15",
        "Barangay 16",
        "Barangay 17",
        "Barangay 18",
        "Barangay 19",
        "Barangay 20",
        "Barangay 21",
        "Barangay 22",
        "Barangay 23",
        "Barangay 24",
        "Barangay 25",
        "Barangay 26",
        "Barangay 27",
        "Barangay 28",
        "Barangay 29",
        "Barangay 30",
        "Barangay 31",
        "Barangay 32",
        "Barangay 33",
        "Barangay 34",
        "Barangay 35",
        "Barangay 36",
        "Barangay 37",
        "Barangay 38",
        "Barangay 39",
        "Barangay 40",
        "Barangay 41",
        "Bata",
        "Cabug",
        "Estefania",
        "Felisa",
        "Granada",
        "Handumanan",
        "Mandalagan",
        "Mansilingan",
        "Montevista",
        "Pahanocoy",
        "Punta Taytay",
        "Singcang-Airport",
        "Sum-ag",
        "Taculing",
        "Tangub",
        "Villamonte",
        "Vista Alegre"
    ];

    function respond($payload, $httpCode = 200)
    {
        http_response_code($httpCode);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
        exit;
    }

    function textLength($text)
    {
        return function_exists('mb_strlen') ? mb_strlen($text) : strlen($text);
    }

    function columnInfo($conn, $table, $column, $field)
    {
        $stmt = $conn->prepare(
            "SELECT $field
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND COLUMN_NAME = ?"
        );
        $stmt->bind_param("ss", $table, $column);
        $stmt->execute();
        $stmt->bind_result($value);
        $stmt->fetch();
        $stmt->close();

        return $value;
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(["status" => "error", "message" => "Invalid request."], 405);
    }

    $username = isset($_POST['username']) ? trim($_POST['username']) : '';
    $password = isset($_POST['password']) ? $_POST['password'] : '';
    $name     = isset($_POST['name'])     ? trim($_POST['name'])     : '';
    $address  = isset($_POST['address'])  ? trim($_POST['address'])  : '';
    $email    = isset($_POST['email'])    ? strtolower(trim($_POST['email'])) : '';

    if ($username === '' || $password === '' || $name === '' || $address === '' || $email === '') {
        respond([
            "status"  => "error",
            "message" => "Every field is required."
        ]);
    }

    $errors = [];

    if (!preg_match('/^[A-Za-z0-9_.-]{3,30}$/', $username)) {
        $errors[] = "Username must be 3 to 30 letters, numbers, dots, dashes or underscores.";
    }
    if (strlen($password) < 8) {
        $errors[] = "Password must be at least 8 characters.";
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100) {
        $errors[] = "Enter a valid email address.";
    }
    if (textLength($name) > 100) {
        $errors[] = "Full name is too long.";
    }
    if (!in_array($address, $barangays, true)) {
        $errors[] = "Select your barangay from the list.";
    }

    if ($errors) {
        respond([
            "status"  => "error",
            "message" => $errors[0],
            "errors"  => $errors
        ]);
    }

    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

    try {

        $conn = new mysqli($host, $user, $pass, $db);
        $conn->set_charset("utf8mb4");

        $conn->query(
            "CREATE TABLE IF NOT EXISTS user_login (
                id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(30) NOT NULL,
                password VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL DEFAULT '',
                address VARCHAR(255) NOT NULL DEFAULT '',
                email VARCHAR(100) NOT NULL DEFAULT ''
            ) CHARACTER SET utf8mb4"
        );
        $needed = [
            'name'    => "VARCHAR(100) NOT NULL DEFAULT ''",
            'address' => "VARCHAR(255) NOT NULL DEFAULT ''",
            'email'   => "VARCHAR(100) NOT NULL DEFAULT ''"
        ];
        foreach ($needed as $col => $definition) {
            if (columnInfo($conn, 'user_login', $col, 'COLUMN_NAME') === null) {
                $conn->query("ALTER TABLE user_login ADD COLUMN $col $definition");
            }
        }

        if ((int) columnInfo($conn, 'user_login', 'password', 'CHARACTER_MAXIMUM_LENGTH') < 60) {
            $conn->query("ALTER TABLE user_login MODIFY password VARCHAR(255) NOT NULL");
        }

        $extra = (string) columnInfo($conn, 'user_login', 'id', 'EXTRA');
        if (stripos($extra, 'auto_increment') === false) {
            $conn->query("ALTER TABLE user_login MODIFY id INT NOT NULL AUTO_INCREMENT");
        }

        foreach (['user_login', 'admin_login'] as $table) {

            $stmt = $conn->prepare("SELECT username, email FROM $table WHERE username = ? OR email = ?");
            $stmt->bind_param("ss", $username, $email);
            $stmt->execute();
            $result = $stmt->get_result();

            while ($existing = $result->fetch_assoc()) {
                if (strcasecmp($existing['username'], $username) === 0) {
                    $errors['username'] = "That username is already taken.";
                }
                if (strcasecmp($existing['email'], $email) === 0) {
                    $errors['email'] = "That email address is already registered.";
                }
            }
            $stmt->close();
        }

        if ($errors) {
            $errors = array_values($errors);
            respond([
                "status"  => "error",
                "message" => implode(" ", $errors),
                "errors"  => $errors
            ]);
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);

        $fullAddress = $address . ", Bacolod City";

        try {

            $stmt = $conn->prepare(
                "INSERT INTO user_login (username, password, name, address, email)
                 VALUES (?, ?, ?, ?, ?)"
            );

            $stmt->bind_param("sssss", $username, $hash, $name, $fullAddress, $email);
            $stmt->execute();
            $stmt->close();

        } catch (mysqli_sql_exception $e) {

            if ((int) $e->getCode() === 1062) {
                respond([
                    "status"  => "error",
                    "message" => "That username or email address is already registered."
                ]);
            }
            throw $e;
        }

        respond([
            "status"  => "success",
            "message" => "Your account has been created. You can now log in."
        ]);

    } catch (mysqli_sql_exception $e) {

        error_log("add_user.php: " . $e->getMessage());

        $reply = [
            "status"  => "error",
            "message" => "Could not save your account. Check that MySQL is running and the pipesense database has a user_login table."
        ];
        if ($debug) {
            $reply["detail"] = $e->getMessage();
        }
        respond($reply, 500);
    }

?>
