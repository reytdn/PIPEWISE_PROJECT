<?php

    require __DIR__ . '/common.php';

    require __DIR__ . '/db_config.php';

    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

    try {
        $conn = new mysqli($host, $user, $pass, $db);
        $conn->set_charset("utf8mb4");
    } catch (mysqli_sql_exception $e) {
        die(json_encode([
            "status"  => "error",
            "message" => "DB connection failed: " . $e->getMessage()
        ]));
    }

    prepareTables($conn);

    $action      = isset($_POST['action']) ? trim((string) $_POST['action']) : '';
    $type        = isset($_POST['type']) ? trim((string) $_POST['type']) : '';
    $title       = isset($_POST['title']) ? trim((string) $_POST['title']) : '';
    $desc        = isset($_POST['desc']) ? trim((string) $_POST['desc']) : '';
    $lat         = isset($_POST['lat']) ? trim((string) $_POST['lat']) : '';
    $lng         = isset($_POST['lng']) ? trim((string) $_POST['lng']) : '';
    $radius      = isset($_POST['radius']) ? trim((string) $_POST['radius']) : '';
    $geofence    = isset($_POST['geofence']) ? trim((string) $_POST['geofence']) : '';
    $status      = isset($_POST['status']) ? trim((string) $_POST['status']) : '';
    $official    = isset($_POST['official']) ? trim((string) $_POST['official']) : '';
    $startsAt    = isset($_POST['startsAt']) ? trim((string) $_POST['startsAt']) : '';
    $endsAt      = isset($_POST['endsAt']) ? trim((string) $_POST['endsAt']) : '';
    $id          = isset($_POST['id']) ? trim((string) $_POST['id']) : '';
    $removePhoto = isset($_POST['removePhoto']) ? trim((string) $_POST['removePhoto']) : '';
    $verified    = isset($_POST['verified']) ? trim((string) $_POST['verified']) : '';
    $area        = isset($_POST['area']) ? trim((string) $_POST['area']) : '';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(["status" => "error", "message" => "Invalid request."]);
        exit;
    }

    const REPORT_SELECT =
        "SELECT id, type, status, title, description, area, lat, lng, source, verified,
                author_id, author, radius_m, geofence, photo,
                UNIX_TIMESTAMP(created_at) * 1000 AS created_ms,
                UNIX_TIMESTAMP(resolved_at) * 1000 AS resolved_ms,
                UNIX_TIMESTAMP(starts_at)  * 1000 AS starts_ms,
                UNIX_TIMESTAMP(ends_at)    * 1000 AS ends_ms
         FROM reports";

    function reportOut($r)
    {
        return [
            "id"        => "r" . $r['id'],
            "type"      => $r['type'],
            "status"    => $r['status'],
            "title"     => $r['title'],
            "desc"      => $r['description'] !== null ? $r['description'] : '',
            "area"      => (string) $r['area'],
            "lat"       => (float) $r['lat'],
            "lng"       => (float) $r['lng'],
            "source"    => $r['source'],
            "verified"  => (int) $r['verified'] === 1,
            "authorId"  => $r['author_id'],
            "author"    => $r['author'],
            "radius"    => (int) $r['radius_m'],
            "geofence"  => geofenceOf($r),
            "photo"     => $r['photo'] !== null && $r['photo'] !== '' ? $r['photo'] : null,
            "resolvedAt" => $r['resolved_ms'] !== null ? (int) $r['resolved_ms'] : null,
            "createdAt" => (int) $r['created_ms'],
            "startsAt"  => $r['starts_ms'] !== null ? (int) $r['starts_ms'] : null,
            "endsAt"    => $r['ends_ms']   !== null ? (int) $r['ends_ms']   : null
        ];
    }

    function fetchReport($conn, $id)
    {
        $stmt = $conn->prepare(REPORT_SELECT . " WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        return $row ? $row : null;
    }

    function msToSeconds($value)
    {
        if ($value === '' || $value === null) return null;
        if (!is_numeric($value)) return false;
        return (int) round(((float) $value) / 1000);
    }

    function logChanges($conn, $old, $new, $me)
    {
        $id    = (int) $old['id'];
        $title = $new['title'];
        $who   = $me['name'];
        $key   = $me['key'];

        if ($old['status'] !== $new['status']) {
            logReport($conn, $id, $title, 'status', $old['status'], $new['status'], $who, $key);

            if ($new['status'] === 'resolved') {
                $stmt = $conn->prepare("UPDATE reports SET resolved_at = NOW() WHERE id = ?");
            } elseif ($old['status'] === 'resolved') {
                $stmt = $conn->prepare("UPDATE reports SET resolved_at = NULL WHERE id = ?");
            } else {
                $stmt = null;
            }
            if ($stmt) {
                $stmt->bind_param("i", $id);
                $stmt->execute();
                $stmt->close();
            }
        }

        if ((int) $old['verified'] !== (int) $new['verified']) {
            logReport($conn, $id, $title, (int) $new['verified'] === 1 ? 'verified' : 'unverified', null, null, $who, $key);
        }

        if ($old['source'] !== $new['source']) {
            logReport($conn, $id, $title, 'official', $old['source'], $new['source'], $who, $key);
        }

        if (coverageText($old) !== coverageText($new) || $old['geofence'] !== $new['geofence']) {
            logReport($conn, $id, $title, 'geofence', coverageText($old), coverageText($new), $who, $key);
        }

        foreach (['type', 'title', 'description', 'lat', 'lng'] as $col) {
            if ((string) $old[$col] !== (string) $new[$col]) {
                logReport($conn, $id, $title, 'edited', null, null, $who, $key);
                break;
            }
        }
    }

    try {
        $me     = actor($conn);
        $admin  = $me['role'] === 'admin';

        if ($action === 'list') {

            $reports = [];

            if ($admin) {
                $result = $conn->query(REPORT_SELECT . " ORDER BY created_at DESC, id DESC");
            } else {
                // Residents never receive other people's unverified reports:
                // only official announcements, verified reports, and their own.
                $stmt = $conn->prepare(
                    REPORT_SELECT . " WHERE source = 'official' OR verified = 1 OR author_id = ?
                     ORDER BY created_at DESC, id DESC"
                );
                $stmt->bind_param("s", $me['key']);
                $stmt->execute();
                $result = $stmt->get_result();
            }

            while ($row = $result->fetch_assoc()) {
                $reports[] = reportOut($row);
            }

            echo json_encode(["status" => "success", "reports" => $reports]);
            exit;
        }

        if ($action === 'create') {

            $errors = [];

            if (!in_array($type, REPORT_TYPES, true))   $errors[] = "Choose what is happening.";
            if ($title === '')                          $errors[] = "Add a short title so others know what is happening.";
            if (textLen($title) > 90)                   $errors[] = "The title is too long (90 characters at most).";
            if (textLen($desc) > 500)                   $errors[] = "The details are too long (500 characters at most).";
            if (!validPoint($lat, $lng))                $errors[] = "The pinned location must be inside Bacolod City.";
            if (!in_array($area, BARANGAYS, true)) $errors[] = "Choose the barangay this report is for.";

            $status   = 'reported';
            $official = false;
            $radius   = typeDefaultRadius($type);
            $geofence = null;
            $photo    = savePhotoUpload($errors);
            $startsAt = null;
            $endsAt   = null;

            if ($admin) {
                $radius   = parseRadius($radius, $errors, $type);
                $geofence = parseGeofence($geofence, $errors);
                $status = ($status !== '' ? $status : 'reported');
                if (!in_array($status, REPORT_STATUSES, true)) $errors[] = "Choose a valid status.";

                $official = $official === '1';
                if ($official) {
                    $startsAt = msToSeconds($startsAt);
                    $endsAt   = msToSeconds($endsAt);
                    if ($startsAt === false || $endsAt === false) {
                        $errors[] = "The schedule is not a valid date.";
                    } elseif ($startsAt !== null && $endsAt !== null && $endsAt < $startsAt) {
                        $errors[] = "The end time is before the start time. Check the schedule.";
                    }
                }
            }

            if ($errors) {
                if (is_string($photo)) deletePhotoFile($photo);
                echo json_encode(["status" => "error", "message" => $errors[0], "errors" => $errors]);
                exit;
            }

            $photo      = is_string($photo) ? $photo : null;
            $latF       = round((float) $lat, 6);
            $lngF       = round((float) $lng, 6);
            $source     = $official ? 'official' : 'community';
            $verified   = $official ? 1 : 0;
            $authorKey  = $me['key'];
            $authorName = $me['name'];

            $stmt = $conn->prepare(
                "INSERT INTO reports
                    (type, status, title, description, area, lat, lng,
                     source, verified, author_id, author, starts_at, ends_at, radius_m, geofence, photo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?), ?, ?, ?)"
            );

            $stmt->bind_param(
                "sssssddsissiiiss",
                $type, $status, $title, $desc, $area, $latF, $lngF,
                $source, $verified, $authorKey, $authorName, $startsAt, $endsAt, $radius, $geofence, $photo
            );
            $stmt->execute();
            $newId = $conn->insert_id;
            $notified = $official ? notifyAffected($conn, $newId) : 0;
            logReport($conn, $newId, $title, 'created', null, $official ? 'official, ' . $status : $status, $authorName, $authorKey);
            $stmt->close();

            echo json_encode([
                "status"  => "success",
                "message" => $official ? "Announcement posted." . notifySummary($notified) : "Report submitted. An admin can verify it.",
                "notified" => $notified,
                "report"  => reportOut(fetchReport($conn, $newId))
            ]);
            exit;
        }

        if ($action === 'update') {

            $id  = reportId($id);
            $row = fetchReport($conn, $id);

            if (!$row) {
                echo json_encode(["status" => "error", "message" => "That report no longer exists."]);
                exit;
            }

            $isOwner = $row['author_id'] === $me['key'];
            if (!$admin && !$isOwner) {
                echo json_encode(["status" => "error", "message" => "You can only change your own reports."]);
                exit;
            }

            $set            = [];
            $errors         = [];
            $contentChanged = false;

            if (isset($_POST['type'])) {
                $v = $type;
                if (!in_array($v, REPORT_TYPES, true)) { $errors[] = "Choose what is happening."; }
                else { $set[] = ["type = ?", "s", $v]; $contentChanged = true; }
            }

            if (isset($_POST['title'])) {
                $v = $title;
                if ($v === '')            { $errors[] = "Add a short title so others know what is happening."; }
                elseif (textLen($v) > 90) { $errors[] = "The title is too long (90 characters at most)."; }
                else { $set[] = ["title = ?", "s", $v]; $contentChanged = true; }
            }

            if (isset($_POST['desc'])) {
                $v = $desc;
                if (textLen($v) > 500) { $errors[] = "The details are too long (500 characters at most)."; }
                else { $set[] = ["description = ?", "s", $v]; $contentChanged = true; }
            }

            if (isset($_POST['area'])) {
                if (!in_array($area, BARANGAYS, true)) { $errors[] = "Choose the barangay this report is for."; }
                else { $set[] = ["area = ?", "s", $area]; $contentChanged = true; }
            }

            if (isset($_POST['lat']) || isset($_POST['lng'])) {
                if (!validPoint($lat, $lng)) {
                    $errors[] = "The pinned location must be inside Bacolod City.";
                } else {
                    $set[] = ["lat = ?", "d", round((float) $lat, 6)];
                    $set[] = ["lng = ?", "d", round((float) $lng, 6)];
                    $contentChanged = true;
                }
            }

            if (isset($_POST['status'])) {
                $v       = $status;
                $allowed = $admin ? REPORT_STATUSES : ['reported', 'ongoing', 'resolved'];
                if (!in_array($v, $allowed, true)) { $errors[] = "That status is not allowed."; }
                else { $set[] = ["status = ?", "s", $v]; }
            }

            $typeNow = isset($_POST['type']) ? $type : $row['type'];

            if ($admin && isset($_POST['radius'])) {
                $set[] = ["radius_m = ?", "i", parseRadius($radius, $errors, $typeNow)];
            }

            if ($admin && isset($_POST['geofence'])) {
                $set[] = ["geofence = ?", "s", parseGeofence($geofence, $errors)];
            }

            $newPhoto = savePhotoUpload($errors);
            if (is_string($newPhoto)) {
                $set[] = ["photo = ?", "s", $newPhoto];
                $contentChanged = true;
            } elseif ($newPhoto === null && $removePhoto === '1') {
                $set[] = ["photo = ?", "s", null];
                $contentChanged = true;
            }

            $verifiedSent = isset($_POST['verified']);
            if ($verifiedSent) {
                if (!$admin){
                    echo json_encode(["status" => "error", "message" => "Only the administrator can verify reports."]);
                    exit;
                }
                $set[] = ["verified = ?", "i", $verified === '1' ? 1 : 0];
            }

            if ($admin && isset($_POST['official'])) {

                $official = $official === '1';
                $startsAt = $official ? msToSeconds($startsAt) : null;
                $endsAt   = $official ? msToSeconds($endsAt)   : null;

                if ($startsAt === false || $endsAt === false) {
                    $errors[] = "The schedule is not a valid date.";
                } elseif ($startsAt !== null && $endsAt !== null && $endsAt < $startsAt) {
                    $errors[] = "The end time is before the start time. Check the schedule.";
                } else {
                    $set[] = ["source = ?", "s", $official ? 'official' : 'community'];
                    $set[] = ["starts_at = FROM_UNIXTIME(?)", "i", $startsAt];
                    $set[] = ["ends_at = FROM_UNIXTIME(?)", "i", $endsAt];
                    if ($official && !$verifiedSent) {
                        $set[] = ["verified = ?", "i", 1];
                    }
                }

            } elseif (!$admin && $contentChanged && $row['source'] === 'community') {
                $set[] = ["verified = ?", "i", 0];
            }

            if ($errors) {
                if (isset($newPhoto) && is_string($newPhoto)) deletePhotoFile($newPhoto);
                echo json_encode(["status" => "error", "message" => $errors[0], "errors" => $errors]);
                exit;
            }
            if (!$set) {
                echo json_encode(["status" => "error", "message" => "Nothing to change."]);
                exit;
            }

            $sql    = "UPDATE reports SET " . implode(", ", array_column($set, 0)) . " WHERE id = ?";
            $types  = implode("", array_column($set, 1)) . "i";
            $values = array_column($set, 2);
            $values[] = $id;

            $stmt = $conn->prepare($sql);
            $stmt->bind_param($types, ...$values);
            $stmt->execute();
            $stmt->close();

            $after = fetchReport($conn, $id);
            if ($row['photo'] && $after['photo'] !== $row['photo']) deletePhotoFile($row['photo']);
            logChanges($conn, $row, $after, $me);
            $justResolved = $row['status'] !== 'resolved' && $after['status'] === 'resolved';
            if ($row['status'] === 'resolved' && $after['status'] !== 'resolved') {
                forgetResolvedEmails($conn, $id);
            }

            $notified = $admin && !$justResolved ? notifyAffected($conn, $id) : 0;
            $resolvedMailed = $admin && $justResolved ? notifyResolved($conn, $id) : 0;

            $justVerified = $admin && (int) $row['verified'] === 0 && (int) $after['verified'] === 1;

            if ($resolvedMailed > 0) {
                $text = "Marked as resolved. " . $resolvedMailed . " resident" . ($resolvedMailed === 1 ? "" : "s")
                      . " with a home in the area " . ($resolvedMailed === 1 ? "was" : "were") . " emailed."
                      . notifySummary(0);
            } else {
                $text = ($justResolved ? "Marked as resolved." : ($justVerified ? "Report verified." : "Changes saved."))
                      . notifySummary($notified);
            }

            echo json_encode([
                "status"  => "success",
                "message" => $text,
                "report"  => reportOut(fetchReport($conn, $id))
            ]);
            exit;
        }

        if ($action === 'notify') {

            requireAdmin($conn);
            $id  = reportId($id);
            $row = fetchReport($conn, $id);

            if (!$row) {
                echo json_encode(["status" => "error", "message" => "That report no longer exists."]);
                exit;
            }
            if (!reportIsAlerting($row)) {
                echo json_encode(["status" => "error", "message" => "Only open verified reports send notices."]);
                exit;
            }

            $notified = notifyAffected($conn, $id, null, true);
            logReport($conn, $id, $row['title'], 'notified', null, (string) $notified, $me['name'], $me['key']);

            echo json_encode([
                "status"   => "success",
                "message"  => $notified > 0 ? "Notice sent." . notifySummary($notified) : "No resident has a home inside this area.",
                "notified" => $notified
            ]);
            exit;
        }

        if ($action === 'email_verified') {

            requireAdmin($conn);
            $id  = reportId($id);
            $row = fetchReport($conn, $id);

            if (!$row) {
                echo json_encode(["status" => "error", "message" => "That report no longer exists."]);
                exit;
            }
            if (!reportIsAlerting($row)) {
                echo json_encode(["status" => "error", "message" => "Only open, verified reports send emails."]);
                exit;
            }

            $sent = notifyAffected($conn, $id, null, true);
            logReport($conn, $id, $row['title'], 'notified', null, (string) $sent, $me['name'], $me['key']);

            echo json_encode([
                "status"  => "success",
                "message" => $sent > 0 ? "Emails sent." . notifySummary($sent) : "No resident has a home inside this area.",
                "emailed" => $sent
            ]);
            exit;
        }

        echo json_encode(["status" => "error", "message" => "Unknown action."]);
        exit;

    } catch (mysqli_sql_exception $e) {
        dbError($e, "reports.php");
    }

?>
