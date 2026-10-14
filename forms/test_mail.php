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

    $to = isset($_POST['to']) ? trim((string) $_POST['to']) : '';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(["status" => "error", "message" => "Invalid request."]);
        exit;
    }

    requireAdmin($conn);

    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(["status" => "error", "message" => "Enter a valid email address."]);
        exit;
    }

    $usingGmail = defined('SMTP_USER') && SMTP_USER !== '';

    $ok = sendNoticeEmail(
        $to,
        "PipeSense test email",
        "This is a test email from PipeSense.\n\nIf you can read this, water service notices can reach residents.\n"
    );

    if ($ok) {
        echo json_encode([
            "status"  => "success",
            "message" => "Test email sent to " . $to . ($usingGmail ? " through Gmail." : " with PHP mail().")
        ]);
        exit;
    }

    $why = !empty($GLOBALS['PS_MAIL_ERROR']) ? $GLOBALS['PS_MAIL_ERROR'] : "Unknown problem.";
    echo json_encode(["status" => "error", "message" => "The email could not be sent. " . $why]);
    exit;

?>
