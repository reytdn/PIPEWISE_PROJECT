<?php

    // ==================================================
    // add_user.php
    // Saves a new resident (user) account to the database.
    //
    // Receives:  POST username, password, name, address, email
    // Returns:   JSON  { status, message, errors?, detail? }
    //
    // Used by the "Sign Up" form in login.html
    // ==================================================


    // --------------------------------------------------
    // RESPONSE SETTINGS
    // --------------------------------------------------
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');


    // --------------------------------------------------
    // SETTINGS
    // --------------------------------------------------

    // Database connection (Laragon defaults)
    $host = "localhost";
    $user = "root";
    $pass = "";
    $db   = "pipesense";

    // While you are building the project, keep this true so the
    // exact database problem is shown in the error popup.
    // Set it to false before showing the system to real users.
    $debug = true;

    // The 61 barangays of Bacolod City, in alphabetical order.
    // The server only accepts an address from this list.
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
    // HELPER: LENGTH OF TEXT IN CHARACTERS
    // --------------------------------------------------
    function textLength($text)
    {
        return function_exists('mb_strlen') ? mb_strlen($text) : strlen($text);
    }


    // --------------------------------------------------
    // HELPER: READ ONE VALUE FROM THE TABLE DEFINITION
    // --------------------------------------------------
    // $field is a fixed column name written below, never user input
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


    // --------------------------------------------------
    // ONLY ACCEPT POST REQUESTS
    // --------------------------------------------------
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(["status" => "error", "message" => "Invalid request."], 405);
    }


    // --------------------------------------------------
    // GET THE DATA SENT FROM JAVASCRIPT
    // --------------------------------------------------
    $username = isset($_POST['username']) ? trim($_POST['username']) : '';
    $password = isset($_POST['password']) ? $_POST['password'] : '';
    $name     = isset($_POST['name'])     ? trim($_POST['name'])     : '';
    $address  = isset($_POST['address'])  ? trim($_POST['address'])  : '';
    $email    = isset($_POST['email'])    ? strtolower(trim($_POST['email'])) : '';


    // --------------------------------------------------
    // VALIDATE THE DATA (server side)
    // JavaScript already checked, but never trust the browser alone
    // --------------------------------------------------
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


    // --------------------------------------------------
    // CONNECT TO THE DATABASE
    // --------------------------------------------------

    // Make MySQLi throw exceptions so we can catch problems
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

    try {

        $conn = new mysqli($host, $user, $pass, $db);
        $conn->set_charset("utf8mb4");


        // ----------------------------------------------
        // MAKE SURE THE user_login TABLE CAN SAVE ACCOUNTS
        // ----------------------------------------------

        // 0) Create the table / missing columns if they are not there yet
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
            // $col and $definition are fixed values written above, never user input
            if (columnInfo($conn, 'user_login', $col, 'COLUMN_NAME') === null) {
                $conn->query("ALTER TABLE user_login ADD COLUMN $col $definition");
            }
        }

        // 1) A password_hash() result is about 60 characters. If the
        //    password column is shorter, MySQL cuts the hash off and
        //    nobody could log in afterwards.
        if ((int) columnInfo($conn, 'user_login', 'password', 'CHARACTER_MAXIMUM_LENGTH') < 60) {
            $conn->query("ALTER TABLE user_login MODIFY password VARCHAR(255) NOT NULL");
        }

        // 2) The id column must number new rows by itself
        $extra = (string) columnInfo($conn, 'user_login', 'id', 'EXTRA');
        if (stripos($extra, 'auto_increment') === false) {
            $conn->query("ALTER TABLE user_login MODIFY id INT NOT NULL AUTO_INCREMENT");
        }


        // ----------------------------------------------
        // CHECK THAT USERNAME, EMAIL AND PASSWORD ARE UNIQUE
        // ----------------------------------------------

        // 1) Username or email already used by a resident or the admin?
        foreach (['user_login', 'admin_login'] as $table) {

            // $table comes from the fixed list above, never from the user
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

        // 2) Password already used by another resident?
        // Passwords are stored as salted hashes, so two equal passwords
        // look different in the database. The only way to compare is
        // to test the new password against each stored hash.
        $result = $conn->query("SELECT password FROM user_login");
        while ($existing = $result->fetch_assoc()) {
            if (password_verify($password, $existing['password'])) {
                $errors['password'] = "That password is already in use. Choose a different password.";
                break;
            }
        }

        if ($errors) {
            $errors = array_values($errors);
            respond([
                "status"  => "error",
                "message" => implode(" ", $errors),
                "errors"  => $errors
            ]);
        }


        // ----------------------------------------------
        // SAVE THE NEW RESIDENT
        // ----------------------------------------------

        // password_hash() turns the password into a secure, salted
        // hash. The real password is never stored.
        $hash = password_hash($password, PASSWORD_DEFAULT);

        // Keep the city with the barangay so the address is complete
        $fullAddress = $address . ", Bacolod City";

        try {

            $stmt = $conn->prepare(
                "INSERT INTO user_login (username, password, name, address, email)
                 VALUES (?, ?, ?, ?, ?)"
            );

            // "sssss" = five strings
            $stmt->bind_param("sssss", $username, $hash, $name, $fullAddress, $email);
            $stmt->execute();
            $stmt->close();

        } catch (mysqli_sql_exception $e) {

            // 1062 = duplicate key. Happens if two people sign up with the
            // same username or email at the exact same moment.
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

        // Log the technical details on the server
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
