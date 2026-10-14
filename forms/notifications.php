<?php

    require __DIR__ . '/common.php';

    $host = "localhost";

    $user = "root";

    $pass = "";

    $db = "pipesense";

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

    $action = isset($_POST['action']) ? trim((string) $_POST['action']) : '';
    $id     = isset($_POST['id']) ? trim((string) $_POST['id']) : '';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(["status" => "error", "message" => "Invalid request."]);
        exit;
    }

    try {
        $me   = actor($conn);

        if ($me['role'] !== 'resident') {
            echo json_encode(["status" => "error", "message" => "Notifications are for residents."]);
            exit;
        }

        $userId = (int) $me['id'];

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

            echo json_encode(["status" => "success", "notifications" => $notes]);
            exit;
        }

        if ($action === 'read') {

            $id = (int) $id;

            $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?");
            $stmt->bind_param("ii", $id, $userId);
            $stmt->execute();
            $stmt->close();

            echo json_encode(["status" => "success"]);
            exit;
        }

        if ($action === 'read_all') {

            $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?");
            $stmt->bind_param("i", $userId);
            $stmt->execute();
            $stmt->close();

            echo json_encode(["status" => "success"]);
            exit;
        }

        echo json_encode(["status" => "error", "message" => "Unknown action."]);
        exit;

    } catch (mysqli_sql_exception $e) {
        dbError($e, "notifications.php");
    }

?>
