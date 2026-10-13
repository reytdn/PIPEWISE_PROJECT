<?php

    // sends one email through Gmail. Returns true if it worked.

    include_once "mail_config.php";

    // sends one line to the mail server and returns what it answered
    function mailTalk($fp, $command)
    {
        if ($command !== null) {
            fwrite($fp, $command . "\r\n");
        }

        $reply = "";
        while ($line = fgets($fp, 515)) {
            $reply .= $line;
            if (substr($line, 3, 1) == " ") {
                break;
            }
        }
        return $reply;
    }

    function sendEmail($to, $subject, $body)
    {
        if (SMTP_PASS == "" || $to == "") {
            return false;
        }

        // Laragon/XAMPP often has no certificate list, so we do not check the certificate
        $options = stream_context_create(["ssl" => ["verify_peer" => false, "verify_peer_name" => false]]);
        $fp = @stream_socket_client("tcp://smtp.gmail.com:587", $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $options);
        if (!$fp) {
            return false;
        }

        mailTalk($fp, null);
        mailTalk($fp, "EHLO localhost");
        mailTalk($fp, "STARTTLS");
        stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        mailTalk($fp, "EHLO localhost");
        mailTalk($fp, "AUTH LOGIN");
        mailTalk($fp, base64_encode(SMTP_USER));
        $reply = mailTalk($fp, base64_encode(SMTP_PASS));

        // 235 means the login worked
        if (substr($reply, 0, 3) != "235") {
            fclose($fp);
            return false;
        }

        mailTalk($fp, "MAIL FROM:<" . SMTP_USER . ">");
        mailTalk($fp, "RCPT TO:<" . $to . ">");
        mailTalk($fp, "DATA");

        $message = "From: PipeSense <" . SMTP_USER . ">\r\n"
                 . "To: <" . $to . ">\r\n"
                 . "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n"
                 . "Content-Type: text/plain; charset=UTF-8\r\n"
                 . "Content-Transfer-Encoding: base64\r\n\r\n"
                 . chunk_split(base64_encode($body))
                 . "\r\n.\r\n";
        fwrite($fp, $message);
        $reply = mailTalk($fp, null);

        mailTalk($fp, "QUIT");
        fclose($fp);

        // 250 means the mail was accepted
        return substr($reply, 0, 3) == "250";
    }

?>
