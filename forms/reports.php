<?php

    require __DIR__ . '/common.php';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        fail("Invalid request.", 405);
    }

    const REPORT_SELECT =
        "SELECT id, type, status, title, description, area, lat, lng, source, verified,
                author_id, author, radius_m, geofence, code_red, photo,
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
            "area"      => $r['area'],
            "lat"       => (float) $r['lat'],
            "lng"       => (float) $r['lng'],
            "source"    => $r['source'],
            "verified"  => (int) $r['verified'] === 1,
            "authorId"  => $r['author_id'],
            "author"    => $r['author'],
            "radius"    => (int) $r['radius_m'],
            "geofence"  => geofenceOf($r),
            "codeRed"   => (int) $r['code_red'] === 1,
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

        if ((int) $old['code_red'] !== (int) $new['code_red']) {
            logReport($conn, $id, $title, 'codered', null, (string) (int) $new['code_red'], $who, $key);
        }

        foreach (['type', 'title', 'description', 'area', 'lat', 'lng'] as $col) {
            if ((string) $old[$col] !== (string) $new[$col]) {
                logReport($conn, $id, $title, 'edited', null, null, $who, $key);
                break;
            }
        }
    }

    try {

        $conn   = db();
        $me     = actor();
        $admin  = $me['role'] === 'admin';
        $action = input('action');

        if ($action === 'list') {

            $reports = [];
            $result  = $conn->query(REPORT_SELECT . " ORDER BY created_at DESC, id DESC");
            while ($row = $result->fetch_assoc()) {
                $reports[] = reportOut($row);
            }

            respond(["status" => "success", "reports" => $reports]);
        }

        if ($action === 'create') {

            $type  = input('type');
            $title = input('title');
            $desc  = input('desc');
            $area  = input('area');
            $lat   = input('lat');
            $lng   = input('lng');

            $errors = [];

            if (!in_array($type, REPORT_TYPES, true))   $errors[] = "Choose what is happening.";
            if ($title === '')                          $errors[] = "Add a short title so others know what is happening.";
            if (textLen($title) > 90)                   $errors[] = "The title is too long (90 characters at most).";
            if (textLen($desc) > 500)                   $errors[] = "The details are too long (500 characters at most).";
            if ($area === '' || textLen($area) > 60)    $errors[] = "Choose the barangay.";
            if (!validPoint($lat, $lng))                $errors[] = "The pinned location must be inside Bacolod City.";

            $status   = 'reported';
            $official = false;
            $radius   = typeDefaultRadius($type);
            $geofence = null;
            $photo    = savePhotoUpload($errors);
            $codeRed  = ($admin && input('codeRed') === '1') ? 1 : 0;
            $startsAt = null;
            $endsAt   = null;

            if ($admin) {
                $radius   = parseRadius(input('radius'), $errors, $type);
                $geofence = parseGeofence(input('geofence'), $errors);
                $status = input('status', 'reported');
                if (!in_array($status, REPORT_STATUSES, true)) $errors[] = "Choose a valid status.";

                $official = input('official') === '1';
                if ($official) {
                    $startsAt = msToSeconds(input('startsAt'));
                    $endsAt   = msToSeconds(input('endsAt'));
                    if ($startsAt === false || $endsAt === false) {
                        $errors[] = "The schedule is not a valid date.";
                    } elseif ($startsAt !== null && $endsAt !== null && $endsAt < $startsAt) {
                        $errors[] = "The end time is before the start time. Check the schedule.";
                    }
                }
            }

            if ($errors) {
                if (is_string($photo)) deletePhotoFile($photo);
                fail($errors[0], 400, ["errors" => $errors]);
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
                     source, verified, author_id, author, starts_at, ends_at, radius_m, geofence, code_red, photo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?), ?, ?, ?, ?)"
            );

            $stmt->bind_param(
                "sssssddsissiiisis",
                $type, $status, $title, $desc, $area, $latF, $lngF,
                $source, $verified, $authorKey, $authorName, $startsAt, $endsAt, $radius, $geofence, $codeRed, $photo
            );
            $stmt->execute();
            $newId = $conn->insert_id;
            $notified = ($official || $codeRed === 1) ? notifyAffected($conn, $newId) : 0;
            logReport($conn, $newId, $title, 'created', null, $official ? 'official, ' . $status : $status, $authorName, $authorKey);
            $stmt->close();

            respond([
                "status"  => "success",
                "message" => $official ? "Announcement posted." . notifySummary($notified)
                          : ($codeRed === 1 ? "Code red report posted." . notifySummary($notified) : "Report submitted. An admin can verify it."),
                "notified" => $notified,
                "report"  => reportOut(fetchReport($conn, $newId))
            ]);
        }

        if ($action === 'update') {

            $id  = reportId(input('id'));
            $row = fetchReport($conn, $id);

            if (!$row) {
                fail("That report no longer exists.", 404);
            }

            $isOwner = $row['author_id'] === $me['key'];
            if (!$admin && !$isOwner) {
                fail("You can only change your own reports.", 403);
            }

            $set            = [];
            $errors         = [];
            $contentChanged = false;

            if (hasInput('type')) {
                $v = input('type');
                if (!in_array($v, REPORT_TYPES, true)) { $errors[] = "Choose what is happening."; }
                else { $set[] = ["type = ?", "s", $v]; $contentChanged = true; }
            }

            if (hasInput('title')) {
                $v = input('title');
                if ($v === '')            { $errors[] = "Add a short title so others know what is happening."; }
                elseif (textLen($v) > 90) { $errors[] = "The title is too long (90 characters at most)."; }
                else { $set[] = ["title = ?", "s", $v]; $contentChanged = true; }
            }

            if (hasInput('desc')) {
                $v = input('desc');
                if (textLen($v) > 500) { $errors[] = "The details are too long (500 characters at most)."; }
                else { $set[] = ["description = ?", "s", $v]; $contentChanged = true; }
            }

            if (hasInput('area')) {
                $v = input('area');
                if ($v === '' || textLen($v) > 60) { $errors[] = "Choose the barangay."; }
                else { $set[] = ["area = ?", "s", $v]; $contentChanged = true; }
            }

            if (hasInput('lat') || hasInput('lng')) {
                if (!validPoint(input('lat'), input('lng'))) {
                    $errors[] = "The pinned location must be inside Bacolod City.";
                } else {
                    $set[] = ["lat = ?", "d", round((float) input('lat'), 6)];
                    $set[] = ["lng = ?", "d", round((float) input('lng'), 6)];
                    $contentChanged = true;
                }
            }

            if (hasInput('status')) {
                $v       = input('status');
                $allowed = $admin ? REPORT_STATUSES : ['reported', 'ongoing', 'resolved'];
                if (!in_array($v, $allowed, true)) { $errors[] = "That status is not allowed."; }
                else { $set[] = ["status = ?", "s", $v]; }
            }

            if ($admin && hasInput('codeRed')) {
                $set[] = ["code_red = ?", "i", input('codeRed') === '1' ? 1 : 0];
            }

            $typeNow = hasInput('type') ? input('type') : $row['type'];

            if ($admin && hasInput('radius')) {
                $set[] = ["radius_m = ?", "i", parseRadius(input('radius'), $errors, $typeNow)];
            }

            if ($admin && hasInput('geofence')) {
                $set[] = ["geofence = ?", "s", parseGeofence(input('geofence'), $errors)];
            }

            $newPhoto = savePhotoUpload($errors);
            if (is_string($newPhoto)) {
                $set[] = ["photo = ?", "s", $newPhoto];
                $contentChanged = true;
            } elseif ($newPhoto === null && input('removePhoto') === '1') {
                $set[] = ["photo = ?", "s", null];
                $contentChanged = true;
            }

            $verifiedSent = hasInput('verified');
            if ($verifiedSent) {
                if (!$admin) fail("Only the administrator can verify reports.", 403);
                $set[] = ["verified = ?", "i", input('verified') === '1' ? 1 : 0];
            }

            if ($admin && hasInput('official')) {

                $official = input('official') === '1';
                $startsAt = $official ? msToSeconds(input('startsAt')) : null;
                $endsAt   = $official ? msToSeconds(input('endsAt'))   : null;

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
                fail($errors[0], 400, ["errors" => $errors]);
            }
            if (!$set) {
                fail("Nothing to change.");
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
            $notified = $admin ? notifyAffected($conn, $id) : 0;

            $justVerified = $admin && (int) $row['verified'] === 0 && (int) $after['verified'] === 1;

            respond([
                "status"  => "success",
                "message" => ($justVerified ? "Report verified." : "Changes saved.") . notifySummary($notified),
                "report"  => reportOut(fetchReport($conn, $id))
            ]);
        }

        if ($action === 'notify') {

            requireAdmin();
            $id  = reportId(input('id'));
            $row = fetchReport($conn, $id);

            if (!$row) {
                fail("That report no longer exists.", 404);
            }
            if (!reportIsAlerting($row)) {
                fail("Only open verified reports and open code red reports send notices.");
            }

            $notified = notifyAffected($conn, $id, null, true);
            logReport($conn, $id, $row['title'], 'notified', null, (string) $notified, $me['name'], $me['key']);

            respond([
                "status"   => "success",
                "message"  => $notified > 0 ? "Notice sent." . notifySummary($notified) : "No resident has a home inside this area.",
                "notified" => $notified
            ]);
        }

        if ($action === 'email_verified') {

            requireAdmin();
            $id  = reportId(input('id'));
            $row = fetchReport($conn, $id);

            if (!$row) {
                fail("That report no longer exists.", 404);
            }
            if (!reportIsAlerting($row)) {
                fail("Only open, verified reports send emails.");
            }

            $sent = notifyAffected($conn, $id, null, true);
            logReport($conn, $id, $row['title'], 'notified', null, (string) $sent, $me['name'], $me['key']);

            respond([
                "status"  => "success",
                "message" => $sent > 0 ? "Emails sent." . notifySummary($sent) : "No resident has a home inside this area.",
                "emailed" => $sent
            ]);
        }

        fail("Unknown action.");

    } catch (mysqli_sql_exception $e) {
        dbError($e, "reports.php");
    }

?>
