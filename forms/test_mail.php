<?php

    require __DIR__ . '/common.php';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        fail("Invalid request.", 405);
    }

    requireAdmin();

    $to = input('to');
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        fail("Enter a valid email address.");
    }

    $usingGmail = defined('SMTP_USER') && SMTP_USER !== '';

    $ok = sendNoticeEmail(
        $to,
        "PipeSense test email",
        "This is a test email from PipeSense.\n\nIf you can read this, code red alerts and interruption notices can reach residents.\n"
    );

    if ($ok) {
        respond([
            "status"  => "success",
            "message" => "Test email sent to " . $to . ($usingGmail ? " through Gmail." : " with PHP mail().")
        ]);
    }

    $why = !empty($GLOBALS['PS_MAIL_ERROR']) ? $GLOBALS['PS_MAIL_ERROR'] : "Unknown problem.";
    fail("The email could not be sent. " . $why, 500);

?>
