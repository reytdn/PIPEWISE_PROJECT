<?php

    require __DIR__ . '/common.php';

    // Frequently affected areas for the public overview.
    // Counts official announcements and VERIFIED reports per barangay for one period.
    // Resolved reports are counted too: they stay stored for the history.
    // ?from=YYYY-MM-DD (first day of the period)  &to=YYYY-MM-DD (first day AFTER the period)

    try {

        $conn = db();
        $from = input('from');
        $to   = input('to');

        $ok = '/^\d{4}-\d{2}-\d{2}$/';
        if (!preg_match($ok, $from) || !preg_match($ok, $to)) {
            fail("Pick a valid period.");
        }

        // reports without a start or end time use the day they were posted
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

        respond(["status" => "success", "areas" => $areas]);

    } catch (mysqli_sql_exception $e) {
        dbError($e, "area_counts.php");
    }

?>
