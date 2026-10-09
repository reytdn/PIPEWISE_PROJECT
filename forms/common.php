<?php

    // ==================================================
    // common.php
    // Shared by reports.php, delete_report.php, save_home.php
    // and search_users.php.
    //
    // Keeps the database settings, the login check and the
    // JSON helpers in one place. Not called directly.
    // ==================================================


    // --------------------------------------------------
    // RESPONSE SETTINGS
    // --------------------------------------------------
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');

    // The login files (login_user.php / login_admin.php) store who is
    // logged in inside the PHP session. These files read it from there.
    session_start();


    // --------------------------------------------------
    // SETTINGS
    // --------------------------------------------------

    // Database connection (Laragon defaults)
    $DB_HOST = "localhost";
    $DB_USER = "root";
    $DB_PASS = "";
    $DB_NAME = "pipesense";

    // While you are building the project, keep this true so the exact
    // database problem is shown in the error popup.
    // Set it to false before showing the system to real users.
    $DEBUG = true;

    const REPORT_TYPES    = ['interruption', 'maintenance', 'pressure', 'quality'];
    const REPORT_STATUSES = ['reported', 'scheduled', 'ongoing', 'resolved'];

    // Rough box around Bacolod City. Anything outside it is rejected.
    const BOX_LAT_MIN = 10.55;
    const BOX_LAT_MAX = 10.80;
    const BOX_LNG_MIN = 122.84;
    const BOX_LNG_MAX = 123.04;


    // --------------------------------------------------
    // HELPER: SEND JSON AND STOP
    // --------------------------------------------------
    function respond($payload, $httpCode = 200)
    {
        http_response_code($httpCode);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
        exit;
    }

    function fail($message, $httpCode = 400, $extra = [])
    {
        respond(array_merge(["status" => "error", "message" => $message], $extra), $httpCode);
    }


    // --------------------------------------------------
    // HELPER: READ ONE VALUE SENT FROM JAVASCRIPT
    // --------------------------------------------------
    function input($key, $default = '')
    {
        if (isset($_POST[$key])) return trim((string) $_POST[$key]);
        if (isset($_GET[$key]))  return trim((string) $_GET[$key]);
        return $default;
    }

    function hasInput($key)
    {
        return isset($_POST[$key]);
    }

    function textLen($text)
    {
        return function_exists('mb_strlen') ? mb_strlen($text) : strlen($text);
    }

    // Is this latitude / longitude a real point inside Bacolod City?
    function validPoint($lat, $lng)
    {
        if (!is_numeric($lat) || !is_numeric($lng)) return false;
        $lat = (float) $lat;
        $lng = (float) $lng;
        return $lat >= BOX_LAT_MIN && $lat <= BOX_LAT_MAX
            && $lng >= BOX_LNG_MIN && $lng <= BOX_LNG_MAX;
    }

    // "r12" or "12" -> 12
    function reportId($raw)
    {
        if (!preg_match('/^r?(\d+)$/', (string) $raw, $m)) {
            fail("Invalid report id.");
        }
        return (int) $m[1];
    }


    // --------------------------------------------------
    // DATABASE
    // --------------------------------------------------
    function db()
    {
        global $DB_HOST, $DB_USER, $DB_PASS, $DB_NAME;
        static $conn = null;

        if ($conn !== null) return $conn;

        // Make MySQLi throw exceptions so we can catch problems
        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

        $conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
        $conn->set_charset("utf8mb4");

        ensureTables($conn);
        return $conn;
    }

    // Creates the two tables if they do not exist yet.
    // Same definitions as pipesense_tables.sql
    function ensureTables($conn)
    {
        $conn->query(
            "CREATE TABLE IF NOT EXISTS reports (
                id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                type        VARCHAR(20)  NOT NULL,
                status      VARCHAR(20)  NOT NULL DEFAULT 'reported',
                title       VARCHAR(90)  NOT NULL,
                description TEXT NULL,
                area        VARCHAR(60)  NOT NULL,
                lat         DECIMAL(9,6) NOT NULL,
                lng         DECIMAL(9,6) NOT NULL,
                source      VARCHAR(20)  NOT NULL DEFAULT 'community',
                verified    TINYINT(1)   NOT NULL DEFAULT 0,
                author_id   VARCHAR(30)  NULL,
                author      VARCHAR(100) NULL,
                starts_at   DATETIME NULL,
                ends_at     DATETIME NULL,
                created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_reports_status (status),
                INDEX idx_reports_area (area),
                INDEX idx_reports_author (author_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );

        $conn->query(
            "CREATE TABLE IF NOT EXISTS user_homes (
                user_id    INT NOT NULL PRIMARY KEY,
                lat        DECIMAL(9,6) NOT NULL,
                lng        DECIMAL(9,6) NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    }

    function dbError($e, $file)
    {
        global $DEBUG;

        // Log the technical details on the server
        error_log($file . ": " . $e->getMessage());

        $reply = [
            "status"  => "error",
            "message" => "Database error. Check that MySQL is running and the tables from pipesense_tables.sql exist."
        ];
        if ($DEBUG) {
            $reply["detail"] = $e->getMessage();
        }
        respond($reply, 500);
    }


    // --------------------------------------------------
    // WHO IS LOGGED IN?
    // Read from the PHP session, never from what the browser sends.
    // Returns: role (admin | resident), id, key (admin-1 / user-5), name
    // --------------------------------------------------
    function actor()
    {
        $role = isset($_SESSION['pipesense_role']) ? $_SESSION['pipesense_role'] : null;
        $id   = isset($_SESSION['pipesense_user_id']) ? (int) $_SESSION['pipesense_user_id'] : 0;

        if (($role !== 'admin' && $role !== 'resident') || $id <= 0) {
            fail("Your session has expired. Log in again.", 401, ["code" => "not_logged_in"]);
        }

        if ($role === 'admin') {
            return ["role" => "admin", "id" => $id, "key" => "admin-" . $id, "name" => "PipeSense Admin"];
        }

        $name = '';
        $stmt = db()->prepare("SELECT name FROM user_login WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->bind_result($name);
        $stmt->fetch();
        $stmt->close();

        return ["role" => "resident", "id" => $id, "key" => "user-" . $id, "name" => $name ? $name : "Resident"];
    }

    function requireAdmin()
    {
        $me = actor();
        if ($me['role'] !== 'admin') {
            fail("Administrators only.", 403);
        }
        return $me;
    }

?>
