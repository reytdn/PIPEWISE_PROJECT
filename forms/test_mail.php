<?php

    // admin only: sends a test email to see if the Gmail settings work

    include "db.php";
    include "send_email.php";
    needAdmin();

    $to = trim($_POST['to']);

    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        stop("Enter a valid email address.");
    }

    if (SMTP_PASS == "") {
        stop("SMTP_PASS in forms/mail_config.php is empty. Paste the Gmail App Password there first.");
    }

    $text = "This is a test email from PipeSense.\n\nIf you can read this, code red alerts and interruption notices can reach residents.\n";

    if (sendEmail($to, "PipeSense test email", $text)) {
        echo json_encode(["status" => "success", "message" => "Test email sent to " . $to . "."]);
    } else {
        stop("The email could not be sent. Check the Gmail address and App Password in forms/mail_config.php.");
    }

    $conn->close();

?>
