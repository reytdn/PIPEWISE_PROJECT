<?php

    // saves a new report. The admin can also post an official announcement
    // (with a schedule and a radius) or mark the report as code red.

    include "db.php";
    include "notify.php";
    needLogin();

    $isAdmin = $_SESSION['role'] == "admin";

    $type  = trim($_POST['type']);
    $title = trim($_POST['title']);
    $desc  = trim($_POST['desc']);
    $area  = trim($_POST['area']);
    $lat   = $_POST['lat'];
    $lng   = $_POST['lng'];

    if ($type != "interruption" && $type != "maintenance" && $type != "pressure" && $type != "quality") {
        stop("Choose what is happening.");
    }
    if ($title == "") {
        stop("Add a short title so others know what is happening.");
    }
    if (strlen($title) > 90) {
        stop("The title is too long (90 characters at most).");
    }
    if (strlen($desc) > 500) {
        stop("The details are too long (500 characters at most).");
    }
    if ($area == "") {
        stop("Choose the barangay.");
    }
    if (!insideBacolod($lat, $lng)) {
        stop("The pinned location must be inside Bacolod City.");
    }

    // these boxes only exist in the admin form
    $official = isset($_POST['official']) ? $_POST['official'] : "";
    $codeRedBox = isset($_POST['code_red']) ? $_POST['code_red'] : "";
    $radiusBox = isset($_POST['radius']) ? $_POST['radius'] : "1000";
    $geofenceBox = isset($_POST['geofence']) ? $_POST['geofence'] : "";
    $startsBox = isset($_POST['starts_at']) ? $_POST['starts_at'] : "";
    $endsBox = isset($_POST['ends_at']) ? $_POST['ends_at'] : "";

    // residents always start with "reported". Only the admin can change these.
    $status   = "reported";
    $source   = "community";
    $verified = 0;
    $codeRed  = 0;
    $radius   = 1000;
    $starts   = "NULL";
    $ends     = "NULL";
    $geofence = "NULL";

    if ($isAdmin) {
        $status = isset($_POST['status']) ? $_POST['status'] : "reported";
        if ($status != "reported" && $status != "scheduled" && $status != "ongoing" && $status != "resolved") {
            stop("Choose a valid status.");
        }

        if ($codeRedBox == "1") {
            $codeRed = 1;
        }

        if ($official == "1") {
            $source   = "official";
            $verified = 1;
            $radius   = (int) $radiusBox;
            if ($radius < 100 || $radius > 10000) {
                stop("The coverage radius must be 100 to 10000 meters.");
            }
            $drawn = parseGeofence($geofenceBox);
            if ($drawn != "") {
                $geofence = "'" . $conn->real_escape_string($drawn) . "'";
            }
            $starts = dateOrNull($conn, $startsBox);
            $ends   = dateOrNull($conn, $endsBox);
            if ($startsBox != "" && $endsBox != "" && $endsBox < $startsBox) {
                stop("The end time is before the start time.");
            }
        }
    }

    $t = $conn->real_escape_string($type);
    $ti = $conn->real_escape_string($title);
    $d = $conn->real_escape_string($desc);
    $a = $conn->real_escape_string($area);
    $key = myKey();
    $author = $conn->real_escape_string($_SESSION['name']);
    $lat = round((float) $lat, 6);
    $lng = round((float) $lng, 6);

    $sql = "INSERT INTO reports
            (type, status, title, description, area, lat, lng, source, verified, author_id, author, radius_m, geofence, code_red, starts_at, ends_at)
            VALUES
            ('$t', '$status', '$ti', '$d', '$a', $lat, $lng, '$source', $verified, '$key', '$author', $radius, $geofence, $codeRed, $starts, $ends)";

    if (!$conn->query($sql)) {
        stop("Could not save the report: " . $conn->error);
    }

    $newId = $conn->insert_id;
    addLog($conn, $newId, $title, "created", "", $source == "official" ? "official, " . $status : $status);

    $message = "Report submitted. An admin can verify it.";
    if ($source == "official" || $codeRed == 1) {
        $count = notifyResidents($conn, $newId);
        $message = "Posted. " . $count . " resident(s) with a home in the affected area were notified.";
        addLog($conn, $newId, $title, "notified", "", $count);
    }

    echo json_encode(["status" => "success", "message" => $message]);

    $conn->close();

?>
