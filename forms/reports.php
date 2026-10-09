<?php

    // ==================================================
    // reports.php
    // Lists, creates and updates water service reports.
    // (Deleting is done by delete_report.php)
    //
    // Receives:  POST action = list | create | update
    //   create:  type, area, title, desc, lat, lng
    //            admin only: status, official, startsAt, endsAt
    //   update:  id + any of the fields above, or verified (admin only)
    // Returns:   JSON  { status, message?, report? | reports? }
    //
    // Rules (checked here, not only in the browser):
    //   - every logged in user can list all reports
    //   - a resident can only create "community" reports and
    //     can only change their own
    //   - only the administrator can verify, post official
    //     announcements, or change any report
    // ==================================================

    require __DIR__ . '/common.php';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        fail("Invalid request.", 405);
    }


    // --------------------------------------------------
    // HOW A REPORT IS READ FROM THE DATABASE
    // Dates are sent to JavaScript as milliseconds
    // --------------------------------------------------
    const REPORT_SELECT =
        "SELECT id, type, status, title, description, area, lat, lng, source, verified,
                author_id, author,
                UNIX_TIMESTAMP(created_at) * 1000 AS created_ms,
                UNIX_TIMESTAMP(starts_at)  * 1000 AS starts_ms,
                UNIX_TIMESTAMP(ends_at)    * 1000 AS ends_ms
         FROM reports";

    // One database row -> the object map.js expects
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

    // Milliseconds from JavaScript -> whole seconds. '' = no date (NULL).
    // Returns false when the value is not a number.
    function msToSeconds($value)
    {
        if ($value === '' || $value === null) return null;
        if (!is_numeric($value)) return false;
        return (int) round(((float) $value) / 1000);
    }


    try {

        $conn   = db();
        $me     = actor();
        $admin  = $me['role'] === 'admin';
        $action = input('action');


        // ==============================================
        // LIST: every report, newest first
        // ==============================================
        if ($action === 'list') {

            $reports = [];
            $result  = $conn->query(REPORT_SELECT . " ORDER BY created_at DESC, id DESC");
            while ($row = $result->fetch_assoc()) {
                $reports[] = reportOut($row);
            }

            respond(["status" => "success", "reports" => $reports]);
        }


        // ==============================================
        // CREATE
        // ==============================================
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

            // Residents always start as "reported". Only the admin picks a status
            // and can post an official announcement.
            $status   = 'reported';
            $official = false;
            $startsAt = null;
            $endsAt   = null;

            if ($admin) {
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
                fail($errors[0], 400, ["errors" => $errors]);
            }

            $latF       = round((float) $lat, 6);
            $lngF       = round((float) $lng, 6);
            $source     = $official ? 'official' : 'community';
            $verified   = $official ? 1 : 0;
            $authorKey  = $me['key'];
            $authorName = $me['name'];

            $stmt = $conn->prepare(
                "INSERT INTO reports
                    (type, status, title, description, area, lat, lng,
                     source, verified, author_id, author, starts_at, ends_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?))"
            );

            // s = string, d = decimal number, i = whole number
            $stmt->bind_param(
                "sssssddsissii",
                $type, $status, $title, $desc, $area, $latF, $lngF,
                $source, $verified, $authorKey, $authorName, $startsAt, $endsAt
            );
            $stmt->execute();
            $newId = $conn->insert_id;
            $stmt->close();

            respond([
                "status"  => "success",
                "message" => $official ? "Announcement posted." : "Report submitted. An admin can verify it.",
                "report"  => reportOut(fetchReport($conn, $newId))
            ]);
        }


        // ==============================================
        // UPDATE
        // Only the fields that are sent get changed.
        // ==============================================
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

            $set            = [];      // each item: [ "column = ?", "type letter", value ]
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
                // A resident who edits a report needs the admin to verify it again
                $set[] = ["verified = ?", "i", 0];
            }

            if ($errors) {
                fail($errors[0], 400, ["errors" => $errors]);
            }
            if (!$set) {
                fail("Nothing to change.");
            }

            // Build: UPDATE reports SET a = ?, b = ? WHERE id = ?
            $sql    = "UPDATE reports SET " . implode(", ", array_column($set, 0)) . " WHERE id = ?";
            $types  = implode("", array_column($set, 1)) . "i";
            $values = array_column($set, 2);
            $values[] = $id;

            $stmt = $conn->prepare($sql);
            $stmt->bind_param($types, ...$values);
            $stmt->execute();
            $stmt->close();

            respond([
                "status"  => "success",
                "message" => "Changes saved.",
                "report"  => reportOut(fetchReport($conn, $id))
            ]);
        }


        fail("Unknown action.");

    } catch (mysqli_sql_exception $e) {
        dbError($e, "reports.php");
    }

?>
