<?php

    require __DIR__ . '/common.php';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        fail("Invalid request.", 405);
    }

    try {

        $conn = db();
        $me   = actor();
        $id   = reportId(input('id'));

        $authorId = null;
        $delTitle = '';

        $stmt = $conn->prepare("SELECT author_id, title FROM reports WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->store_result();

        if ($stmt->num_rows === 0) {
            $stmt->close();
            fail("That report no longer exists.", 404);
        }

        $stmt->bind_result($authorId, $delTitle);
        $stmt->fetch();
        $stmt->close();

        if ($me['role'] !== 'admin' && $authorId !== $me['key']) {
            fail("You can only delete your own reports.", 403);
        }

        $stmt = $conn->prepare("DELETE FROM notifications WHERE report_id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->close();

        $stmt = $conn->prepare("DELETE FROM report_emails WHERE report_id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->close();

        $stmt = $conn->prepare("DELETE FROM reports WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->close();

        logReport($conn, $id, $delTitle, 'deleted', null, null, $me['name'], $me['key']);

        respond([
            "status"  => "success",
            "message" => "Report deleted."
        ]);

    } catch (mysqli_sql_exception $e) {
        dbError($e, "delete_report.php");
    }

?>
