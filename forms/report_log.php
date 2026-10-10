<?php

    require __DIR__ . '/common.php';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        fail("Invalid request.", 405);
    }

    try {

        $conn = db();
        requireAdmin();

        if (input('action') !== 'list') {
            fail("Unknown action.");
        }

        $limit = (int) input('limit', '200');
        if ($limit < 1)   $limit = 200;
        if ($limit > 500) $limit = 500;

        $sql = "SELECT id, report_id, title, action, from_value, to_value, actor,
                       UNIX_TIMESTAMP(created_at) * 1000 AS created_ms
                FROM report_log";

        if (input('report_id') !== '') {
            $rid  = reportId(input('report_id'));
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

        respond(["status" => "success", "log" => $log]);

    } catch (mysqli_sql_exception $e) {
        dbError($e, "report_log.php");
    }

?>
