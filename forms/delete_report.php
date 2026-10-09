<?php

    // ==================================================
    // delete_report.php
    // Deletes one report from the database.
    //
    // Receives:  POST id   (for example "r12" or "12")
    // Returns:   JSON  { status, message }
    //
    // Who can delete:
    //   - the administrator: any report
    //   - a resident: only the reports they posted themselves
    // ==================================================

    require __DIR__ . '/common.php';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        fail("Invalid request.", 405);
    }

    try {

        $conn = db();
        $me   = actor();
        $id   = reportId(input('id'));


        // ----------------------------------------------
        // DOES THE REPORT EXIST, AND WHO POSTED IT?
        // ----------------------------------------------
        $authorId = null;

        $stmt = $conn->prepare("SELECT author_id FROM reports WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->store_result();

        if ($stmt->num_rows === 0) {
            $stmt->close();
            fail("That report no longer exists.", 404);
        }

        $stmt->bind_result($authorId);
        $stmt->fetch();
        $stmt->close();


        // ----------------------------------------------
        // ARE THEY ALLOWED TO DELETE IT?
        // ----------------------------------------------
        if ($me['role'] !== 'admin' && $authorId !== $me['key']) {
            fail("You can only delete your own reports.", 403);
        }


        // ----------------------------------------------
        // DELETE IT
        // ----------------------------------------------
        $stmt = $conn->prepare("DELETE FROM reports WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->close();

        respond([
            "status"  => "success",
            "message" => "Report deleted."
        ]);

    } catch (mysqli_sql_exception $e) {
        dbError($e, "delete_report.php");
    }

?>
