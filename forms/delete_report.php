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

    $id = isset($_POST['id']) ? trim((string) $_POST['id']) : '';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(["status" => "error", "message" => "Invalid request."]);
        exit;
    }

    try {
        $me   = actor($conn);
        $id   = reportId($id);

        $authorId  = null;
        $delTitle  = '';
        $delStatus = '';

        $stmt = $conn->prepare("SELECT author_id, title, status FROM reports WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->store_result();

        if ($stmt->num_rows === 0) {
            $stmt->close();
            echo json_encode(["status" => "error", "message" => "That report no longer exists."]);
            exit;
        }

        $stmt->bind_result($authorId, $delTitle, $delStatus);
        $stmt->fetch();
        $stmt->close();

        if ($me['role'] !== 'admin' && $authorId !== $me['key']) {
            echo json_encode(["status" => "error", "message" => "You can only delete your own reports."]);
            exit;
        }

        if ($delStatus === 'resolved') {
            echo json_encode(["status" => "error", "message" => "Resolved reports are kept for the history and cannot be deleted."]);
            exit;
        }

        $stmt = $conn->prepare("DELETE FROM notifications WHERE report_id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->close();

        $stmt = $conn->prepare("DELETE FROM report_emails WHERE report_id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->close();

        $stmt = $conn->prepare("SELECT photo FROM reports WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $photoRow = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        $stmt = $conn->prepare("DELETE FROM reports WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->close();

        if ($photoRow && $photoRow['photo']) deletePhotoFile($photoRow['photo']);

        logReport($conn, $id, $delTitle, 'deleted', null, null, $me['name'], $me['key']);

        echo json_encode([
            "status"  => "success",
            "message" => "Report deleted."
        ]);
        exit;

    } catch (mysqli_sql_exception $e) {
        dbError($e, "delete_report.php");
    }

?>
