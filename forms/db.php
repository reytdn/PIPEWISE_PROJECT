<?php
    // Database settings. This is the ONLY place they are written,
    // so change $db here to the name of YOUR database.
    $host = "localhost";
    $user = "root";
    $pass = "";
    $db   = "pipesense";

    // lets us handle a connection problem ourselves (newer PHP stops the page instead)
    mysqli_report(MYSQLI_REPORT_OFF);

    $conn = new mysqli($host, $user, $pass, $db);

    if ($conn->connect_error) {
        die(json_encode([
            "status" => "error",
            "message" => "DB connection failed: " . $conn->connect_error
        ]));
    }

    // the session remembers who is logged in
    session_start();

    // stops the page and sends an error message back to the javascript
    function stop($message, $code = "") {
        echo json_encode(["status" => "error", "message" => $message, "code" => $code]);
        exit;
    }

    // stops the page unless somebody is logged in
    function needLogin() {
        if (!isset($_SESSION['role'])) {
            stop("Your session has ended. Please log in again.", "login");
        }
    }

    // stops the page unless the logged in person is the admin
    function needAdmin() {
        needLogin();
        if ($_SESSION['role'] != "admin") {
            stop("Administrators only.");
        }
    }

    // "user-5" or "admin-1", saved in the reports table to know who posted it
    function myKey() {
        return $_SESSION['role'] . "-" . $_SESSION['id'];
    }

    // turns the value of a datetime-local box into something MySQL accepts
    function dateOrNull($conn, $value) {
        if ($value == "") {
            return "NULL";
        }
        $value = str_replace("T", " ", $value);
        return "'" . $conn->real_escape_string($value) . "'";
    }

    // inside the box that covers Bacolod City?
    function insideBacolod($lat, $lng) {
        return is_numeric($lat) && is_numeric($lng)
            && $lat >= 10.55 && $lat <= 10.80
            && $lng >= 122.84 && $lng <= 123.04;
    }

    // checks the drawn area sent by the javascript, like {"type":"polygon","points":[[lat,lng],...]}
    // returns it as clean text for the database, or "" when no area was drawn
    function parseGeofence($raw) {
        if ($raw == "") {
            return "";
        }

        $g = json_decode($raw, true);
        if (!is_array($g) || !isset($g['points']) || !is_array($g['points'])) {
            stop("The drawn coverage area is not valid.");
        }

        $count = count($g['points']);
        if ($count < 3 || $count > 200) {
            stop("The coverage area needs 3 to 200 points.");
        }

        $clean = [];
        foreach ($g['points'] as $p) {
            if (!is_array($p) || count($p) < 2 || !insideBacolod($p[0], $p[1])) {
                stop("Every point of the coverage area must be inside Bacolod City.");
            }
            $clean[] = [round((float) $p[0], 6), round((float) $p[1], 6)];
        }

        return json_encode(["type" => "polygon", "points" => $clean]);
    }

    // saves one line in the history of a report (the admin can read it)
    function addLog($conn, $reportId, $title, $action, $from = "", $to = "") {
        $title  = $conn->real_escape_string($title);
        $action = $conn->real_escape_string($action);
        $from   = $conn->real_escape_string($from);
        $to     = $conn->real_escape_string($to);
        $who    = $conn->real_escape_string($_SESSION['name']);
        $key    = myKey();

        $conn->query("INSERT INTO report_log (report_id, title, action, from_value, to_value, actor, actor_key) VALUES ($reportId, '$title', '$action', '$from', '$to', '$who', '$key')");
    }
?>