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

    $action    = isset($_POST['action']) ? trim((string) $_POST['action']) : '';
    $limit     = isset($_POST['limit']) ? trim((string) $_POST['limit']) : '';
    $report_id = isset($_POST['report_id']) ? trim((string) $_POST['report_id']) : '';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(["status" => "error", "message" => "Invalid request."]);
        exit;
    }

    try {
        requireAdmin($conn);

        if ($action !== 'list') {
            echo json_encode(["status" => "error", "message" => "Unknown action."]);
            exit;
        }

        $limit = (int) ($limit !== '' ? $limit : '200');
        if ($limit < 1)   $limit = 200;
        if ($limit > 500) $limit = 500;

        $sql = "SELECT id, report_id, title, action, from_value, to_value, actor,
                       UNIX_TIMESTAMP(created_at) * 1000 AS created_ms
                FROM report_log";

        if ($report_id !== '') {
            $rid  = reportId($report_id);
            $stmt = $conn->prepare($sql . " WHERE report_id = ? ORDER BY created_at DESC, id DESC LIMIT ?");
            $stmt->bind_param("ii", $rid, $limit);
        } else {
            $stmt = $conn->prepare($sql . " ORDER BY created_at DESC, id DESC LIMIT ?");
            $stmt->bind_param("i", $limit);
        }
        $stmt->execute();
        $result = $stmt->get_result();

        $log = [];
        while ($row = $result->fetch_assoc()) {
            $log[] = [
                "id"        => (int) $row['id'],
                "reportId"  => "r" . $row['report_id'],
                "title"     => $row['title'],
                "action"    => $row['action'],
                "from"      => $row['from_value'],
                "to"        => $row['to_value'],
                "actor"     => $row['actor'],
                "createdAt" => (int) $row['created_ms']
            ];
        }
        $stmt->close();

        echo json_encode(["status" => "success", "log" => $log]);
        exit;

    } catch (mysqli_sql_exception $e) {
        dbError($e, "report_log.php");
    }

?>
