<?php

    // changes a report. Only the person who posted it, or the admin, can do this.
    // Only the fields that were sent are changed.

    include "db.php";
    include "notify.php";
    needLogin();

    $isAdmin = $_SESSION['role'] == "admin";
    $id = (int) $_POST['id'];

    $result = $conn->query("SELECT * FROM reports WHERE id = $id");
    $old = $result->fetch_assoc();

    if (!$old) {
        stop("That report no longer exists.");
    }
    if (!$isAdmin && $old['author_id'] != myKey()) {
        stop("You can only change your own reports.");
    }

    // these boxes only exist in the admin form
    $radiusBox = isset($_POST['radius']) ? $_POST['radius'] : "1000";
    $geofenceBox = isset($_POST['geofence']) ? $_POST['geofence'] : "";
    $startsBox = isset($_POST['starts_at']) ? $_POST['starts_at'] : "";
    $endsBox = isset($_POST['ends_at']) ? $_POST['ends_at'] : "";

    $changes = [];      // pieces of the UPDATE, like "title = 'abc'"
    $contentChanged = false;

    if (isset($_POST['type'])) {
        $type = $_POST['type'];
        if ($type != "interruption" && $type != "maintenance" && $type != "pressure" && $type != "quality") {
            stop("Choose what is happening.");
        }
        $changes[] = "type = '$type'";
        $contentChanged = true;
    }

    if (isset($_POST['title'])) {
        $title = trim($_POST['title']);
        if ($title == "") {
            stop("Add a short title so others know what is happening.");
        }
        if (strlen($title) > 90) {
            stop("The title is too long (90 characters at most).");
        }
        $changes[] = "title = '" . $conn->real_escape_string($title) . "'";
        $contentChanged = true;
    }

    if (isset($_POST['desc'])) {
        $desc = trim($_POST['desc']);
        if (strlen($desc) > 500) {
            stop("The details are too long (500 characters at most).");
        }
        $changes[] = "description = '" . $conn->real_escape_string($desc) . "'";
        $contentChanged = true;
    }

    if (isset($_POST['area'])) {
        $area = trim($_POST['area']);
        if ($area == "") {
            stop("Choose the barangay.");
        }
        $changes[] = "area = '" . $conn->real_escape_string($area) . "'";
        $contentChanged = true;
    }

    if (isset($_POST['lat']) && isset($_POST['lng'])) {
        if (!insideBacolod($_POST['lat'], $_POST['lng'])) {
            stop("The pinned location must be inside Bacolod City.");
        }
        $changes[] = "lat = " . round((float) $_POST['lat'], 6);
        $changes[] = "lng = " . round((float) $_POST['lng'], 6);
        $contentChanged = true;
    }

    $newStatus = $old['status'];
    if (isset($_POST['status'])) {
        $newStatus = $_POST['status'];
        $allowed = $isAdmin ? ["reported", "scheduled", "ongoing", "resolved"] : ["reported", "ongoing", "resolved"];
        if (!in_array($newStatus, $allowed)) {
            stop("That status is not allowed.");
        }
        $changes[] = "status = '$newStatus'";
        if ($newStatus != $old['status']) {
            if ($newStatus == "resolved") {
                $changes[] = "resolved_at = NOW()";
            } else {
                $changes[] = "resolved_at = NULL";
            }
        }
    }

    // these can only be changed by the admin
    $newVerified = $old['verified'];
    if ($isAdmin) {

        if (isset($_POST['verified'])) {
            $newVerified = $_POST['verified'] == "1" ? 1 : 0;
            $changes[] = "verified = $newVerified";
        }

        if (isset($_POST['code_red'])) {
            $codeRed = $_POST['code_red'] == "1" ? 1 : 0;
            $changes[] = "code_red = $codeRed";
        }

        if (isset($_POST['official'])) {
            if ($_POST['official'] == "1") {
                $radius = (int) $radiusBox;
                if ($radius < 100 || $radius > 10000) {
                    stop("The coverage radius must be 100 to 10000 meters.");
                }
                if ($startsBox != "" && $endsBox != "" && $endsBox < $startsBox) {
                    stop("The end time is before the start time.");
                }
                $changes[] = "source = 'official'";
                $changes[] = "radius_m = $radius";
                $drawn = parseGeofence($geofenceBox);
                if ($drawn != "") {
                    $changes[] = "geofence = '" . $conn->real_escape_string($drawn) . "'";
                } else {
                    $changes[] = "geofence = NULL";
                }
                $changes[] = "starts_at = " . dateOrNull($conn, $startsBox);
                $changes[] = "ends_at = " . dateOrNull($conn, $endsBox);
                if (!isset($_POST['verified'])) {
                    $newVerified = 1;
                    $changes[] = "verified = 1";
                }
            } else {
                $changes[] = "source = 'community'";
                $changes[] = "geofence = NULL";
                $changes[] = "starts_at = NULL";
                $changes[] = "ends_at = NULL";
            }
        }

    } elseif ($contentChanged && $old['source'] == "community") {
        // a resident edited the text, so the admin has to check it again
        $changes[] = "verified = 0";
    }

    if (count($changes) == 0) {
        stop("Nothing to change.");
    }

    $sql = "UPDATE reports SET " . implode(", ", $changes) . " WHERE id = $id";
    if (!$conn->query($sql)) {
        stop("Could not save the changes: " . $conn->error);
    }

    // write what happened in the history
    $logTitle = isset($title) ? $title : $old['title'];
    if ($newStatus != $old['status']) {
        addLog($conn, $id, $logTitle, "status", $old['status'], $newStatus);
    }
    if ($newVerified != $old['verified']) {
        addLog($conn, $id, $logTitle, $newVerified == 1 ? "verified" : "unverified");
    }
    if ($contentChanged) {
        addLog($conn, $id, $logTitle, "edited");
    }

    $message = "Changes saved.";

    if ($isAdmin) {
        // announcements and code red reports tell the residents nearby
        $count = notifyResidents($conn, $id);
        if ($count > 0) {
            $message .= " " . $count . " resident(s) were notified.";
        }

        // a community report that was just verified: email the neighbors
        if ($old['verified'] == 0 && $newVerified == 1 && $old['source'] == "community" && !isset($_POST['official'])) {
            $count = emailNearbyResidents($conn, $id);
            if ($count > 0) {
                $message .= " " . $count . " resident(s) nearby were emailed.";
            }
        }
    }

    echo json_encode(["status" => "success", "message" => $message]);

    $conn->close();

?>
