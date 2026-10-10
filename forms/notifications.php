<?php

    require __DIR__ . '/common.php';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        fail("Invalid request.", 405);
    }

    try {

        $conn = db();
        $me   = actor();

        if ($me['role'] !== 'resident') {
            fail("Notifications are for residents.", 403);
        }

        $userId = (int) $me['id'];
        $action = input('action');

        if ($action === 'list') {

            $stmt = $conn->prepare(
                "SELECT n.id, n.report_id, n.message, n.is_read,
                        UNIX_TIMESTAMP(n.created_at) * 1000 AS created_ms
                 FROM notifications n
                 JOIN reports r ON r.id = n.report_id
                 WHERE n.user_id = ?
                 ORDER BY n.created_at DESC, n.id DESC
                 LIMIT 30"
            );
            $stmt->bind_param("i", $userId);
            $stmt->execute();
            $result = $stmt->get_result();

            $notes = [];
            while ($row = $result->fetch_assoc()) {
                $notes[] = [
                    "id"        => (int) $row['id'],
                    "reportId"  => "r" . $row['report_id'],
                    "message"   => $row['message'],
                    "read"      => (int) $row['is_read'] === 1,
                    "createdAt" => (int) $row['created_ms']
                ];
            }
            $stmt->close();

            respond(["status" => "success", "notifications" => $notes]);
        }

        if ($action === 'read') {

            $id = (int) input('id');

            $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?");
            $stmt->bind_param("ii", $id, $userId);
            $stmt->execute();
            $stmt->close();

            respond(["status" => "success"]);
        }

        if ($action === 'read_all') {

            $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?");
            $stmt->bind_param("i", $userId);
            $stmt->execute();
            $stmt->close();

            respond(["status" => "success"]);
        }

        fail("Unknown action.");

    } catch (mysqli_sql_exception $e) {
        dbError($e, "notifications.php");
    }

?>
