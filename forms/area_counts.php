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

    $from = isset($_GET['from']) ? trim((string) $_GET['from']) : '';
    $to   = isset($_GET['to']) ? trim((string) $_GET['to']) : '';

    try {

        $ok = '/^\d{4}-\d{2}-\d{2}$/';
        if (!preg_match($ok, $from) || !preg_match($ok, $to)) {
            echo json_encode(["status" => "error", "message" => "Pick a valid period."]);
            exit;
        }

        $stmt = $conn->prepare(
            "SELECT area, COUNT(*) AS report_count
             FROM reports
             WHERE (source = 'official' OR verified = 1)
               AND area <> ''
               AND COALESCE(starts_at, created_at) < ?
               AND COALESCE(ends_at, starts_at, created_at) >= ?
             GROUP BY area
             ORDER BY report_count DESC, area ASC
             LIMIT 10"
        );
        $stmt->bind_param("ss", $to, $from);
        $stmt->execute();
        $result = $stmt->get_result();

        $areas = [];
        while ($row = $result->fetch_assoc()) {
            $areas[] = [
                "area"         => $row['area'],
                "report_count" => (int) $row['report_count']
            ];
        }
        $stmt->close();

        echo json_encode(["status" => "success", "areas" => $areas]);
        exit;

    } catch (mysqli_sql_exception $e) {
        dbError($e, "area_counts.php");
    }

?>
