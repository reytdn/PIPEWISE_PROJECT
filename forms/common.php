<?php

    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');

    session_start();

    date_default_timezone_set('Asia/Manila');

    if (is_file(__DIR__ . '/mail_config.php')) {
        require __DIR__ . '/mail_config.php';
    }

    $DB_HOST = "localhost";
    $DB_USER = "root";
    $DB_PASS = "";
    $DB_NAME = "pipesense";

    $DEBUG = true;

    const REPORT_TYPES    = ['interruption', 'maintenance', 'pressure', 'quality'];
    const REPORT_STATUSES = ['reported', 'scheduled', 'ongoing', 'resolved'];

    const DEFAULT_COVERAGE_M = 1000;

    const RESIDENT_GEOFENCE_M = 1000;

    const SMTP_HOST = 'smtp.gmail.com';
    const SMTP_PORT = 587;
    const MIN_COVERAGE_M     = 100;
    const MAX_COVERAGE_M     = 10000;

    const MAIL_ENABLED = true;
    const MAIL_FROM    = 'PipeSense <pipesenseorganization@gmail.com>';

    const BOX_LAT_MIN = 10.55;
    const BOX_LAT_MAX = 10.80;
    const BOX_LNG_MIN = 122.84;
    const BOX_LNG_MAX = 123.04;

    function respond($payload, $httpCode = 200)
    {
        http_response_code($httpCode);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
        exit;
    }

    function fail($message, $httpCode = 400, $extra = [])
    {
        respond(array_merge(["status" => "error", "message" => $message], $extra), $httpCode);
    }

    function input($key, $default = '')
    {
        if (isset($_POST[$key])) return trim((string) $_POST[$key]);
        if (isset($_GET[$key]))  return trim((string) $_GET[$key]);
        return $default;
    }

    function hasInput($key)
    {
        return isset($_POST[$key]);
    }

    function textLen($text)
    {
        return function_exists('mb_strlen') ? mb_strlen($text) : strlen($text);
    }

    function validPoint($lat, $lng)
    {
        if (!is_numeric($lat) || !is_numeric($lng)) return false;
        $lat = (float) $lat;
        $lng = (float) $lng;
        return $lat >= BOX_LAT_MIN && $lat <= BOX_LAT_MAX
            && $lng >= BOX_LNG_MIN && $lng <= BOX_LNG_MAX;
    }

    function reportId($raw)
    {
        if (!preg_match('/^r?(\d+)$/', (string) $raw, $m)) {
            fail("Invalid report id.");
        }
        return (int) $m[1];
    }

    function db()
    {
        global $DB_HOST, $DB_USER, $DB_PASS, $DB_NAME;
        static $conn = null;

        if ($conn !== null) return $conn;

        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

        $conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
        $conn->set_charset("utf8mb4");

        ensureTables($conn);
        ensureExtras($conn);
        return $conn;
    }

    function ensureTables($conn)
    {
        $conn->query(
            "CREATE TABLE IF NOT EXISTS reports (
                id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                type        VARCHAR(20)  NOT NULL,
                status      VARCHAR(20)  NOT NULL DEFAULT 'reported',
                title       VARCHAR(90)  NOT NULL,
                description TEXT NULL,
                area        VARCHAR(60)  NOT NULL,
                lat         DECIMAL(9,6) NOT NULL,
                lng         DECIMAL(9,6) NOT NULL,
                source      VARCHAR(20)  NOT NULL DEFAULT 'community',
                verified    TINYINT(1)   NOT NULL DEFAULT 0,
                author_id   VARCHAR(30)  NULL,
                author      VARCHAR(100) NULL,
                starts_at   DATETIME NULL,
                ends_at     DATETIME NULL,
                created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_reports_status (status),
                INDEX idx_reports_area (area),
                INDEX idx_reports_author (author_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );

        $conn->query(
            "CREATE TABLE IF NOT EXISTS user_homes (
                user_id    INT NOT NULL PRIMARY KEY,
                lat        DECIMAL(9,6) NOT NULL,
                lng        DECIMAL(9,6) NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    }

    function ensureExtras($conn)
    {
        $res = $conn->query("SHOW COLUMNS FROM reports LIKE 'radius_m'");
        if ($res->num_rows === 0) {
            $conn->query("ALTER TABLE reports ADD COLUMN radius_m INT NOT NULL DEFAULT 1000");
        }

        $res = $conn->query("SHOW COLUMNS FROM reports LIKE 'code_red'");
        if ($res->num_rows === 0) {
            $conn->query("ALTER TABLE reports ADD COLUMN code_red TINYINT(1) NOT NULL DEFAULT 0");
        }

        $res = $conn->query("SHOW COLUMNS FROM reports LIKE 'geofence'");
        if ($res->num_rows === 0) {
            $conn->query("ALTER TABLE reports ADD COLUMN geofence TEXT NULL");
        }

        $res = $conn->query("SHOW COLUMNS FROM reports LIKE 'resolved_at'");
        if ($res->num_rows === 0) {
            $conn->query("ALTER TABLE reports ADD COLUMN resolved_at DATETIME NULL");
        }

        $conn->query(
            "CREATE TABLE IF NOT EXISTS report_log (
                id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                report_id  INT NOT NULL,
                title      VARCHAR(90)  NOT NULL DEFAULT '',
                action     VARCHAR(20)  NOT NULL,
                from_value VARCHAR(255) NULL,
                to_value   VARCHAR(255) NULL,
                actor      VARCHAR(100) NOT NULL DEFAULT '',
                actor_key  VARCHAR(30)  NOT NULL DEFAULT '',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_log_report (report_id),
                INDEX idx_log_time (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );

        $conn->query(
            "CREATE TABLE IF NOT EXISTS report_emails (
                id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id    INT NOT NULL,
                report_id  INT NOT NULL,
                kind       VARCHAR(20) NOT NULL DEFAULT 'verified',
                sent_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_report_email (user_id, report_id, kind)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );

        $conn->query(
            "CREATE TABLE IF NOT EXISTS notifications (
                id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id    INT NOT NULL,
                report_id  INT NOT NULL,
                message    VARCHAR(400) NOT NULL,
                is_read    TINYINT(1) NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_note (user_id, report_id),
                INDEX idx_note_user (user_id, is_read)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    }

    function parseRadius($raw, &$errors)
    {
        if ($raw === '' || $raw === null) return DEFAULT_COVERAGE_M;
        if (!ctype_digit((string) $raw)
            || (int) $raw < MIN_COVERAGE_M || (int) $raw > MAX_COVERAGE_M) {
            $errors[] = "The coverage radius must be " . MIN_COVERAGE_M . " to " . MAX_COVERAGE_M . " meters.";
            return DEFAULT_COVERAGE_M;
        }
        return (int) $raw;
    }

    function notifySummary($n)
    {
        $out = "";
        if ($n > 0) {
            $out = " " . $n . " resident" . ($n === 1 ? "" : "s") . " with a home in the affected area " . ($n === 1 ? "was" : "were") . " notified.";
        }

        $failed = isset($GLOBALS['PS_MAIL_FAILED']) ? (int) $GLOBALS['PS_MAIL_FAILED'] : 0;
        if ($failed > 0) {
            $why  = !empty($GLOBALS['PS_MAIL_ERROR']) ? " (" . $GLOBALS['PS_MAIL_ERROR'] . ")" : "";
            $out .= " " . $failed . " email" . ($failed === 1 ? "" : "s") . " could not be sent" . $why . ".";
        }
        return $out;
    }

    const SMTP_VERIFY_TLS = true;

    function smtpRead($fp)
    {
        $out = '';
        while (($line = fgets($fp, 515)) !== false) {
            $out .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') break;
        }
        return $out;
    }

    function smtpStep($fp, $cmd, $expect)
    {
        if ($cmd !== null) fwrite($fp, $cmd . "\r\n");
        $reply = smtpRead($fp);
        if (strpos($reply, (string) $expect) !== 0) {
            throw new RuntimeException("Mail server said: " . trim($reply));
        }
        return $reply;
    }

    function smtpLink($close = false)
    {
        static $fp = null;

        if ($close) {
            if ($fp) { @fwrite($fp, "QUIT\r\n"); @fclose($fp); }
            $fp = null;
            return null;
        }
        if ($fp && !feof($fp)) return $fp;
        $fp = null;

        $ctx = stream_context_create(['ssl' => [
            'verify_peer'       => SMTP_VERIFY_TLS,
            'verify_peer_name'  => SMTP_VERIFY_TLS,
            'allow_self_signed' => !SMTP_VERIFY_TLS,
            'peer_name'         => SMTP_HOST
        ]]);
        $conn = @stream_socket_client('tcp://' . SMTP_HOST . ':' . SMTP_PORT, $errno, $errstr, 12, STREAM_CLIENT_CONNECT, $ctx);
        if (!$conn) {
            throw new RuntimeException("Cannot connect to " . SMTP_HOST . " (" . $errstr . ")");
        }
        stream_set_timeout($conn, 12);

        try {
            smtpStep($conn, null, '220');
            smtpStep($conn, 'EHLO pipesense.local', '250');
            smtpStep($conn, 'STARTTLS', '220');
            if (!stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException("Could not start a secure (TLS) connection. If the certificate could not be verified, see SMTP_VERIFY_TLS in common.php");
            }
            smtpStep($conn, 'EHLO pipesense.local', '250');
            smtpStep($conn, 'AUTH LOGIN', '334');
            smtpStep($conn, base64_encode(SMTP_USER), '334');
            smtpStep($conn, base64_encode(SMTP_PASS), '235');
        } catch (Throwable $e) {
            @fclose($conn);
            throw $e;
        }

        $fp = $conn;
        return $fp;
    }

    function smtpSend($to, $subject, $body)
    {
        $fp = smtpLink();

        try {
            smtpStep($fp, 'MAIL FROM:<' . SMTP_USER . '>', '250');
            smtpStep($fp, 'RCPT TO:<' . $to . '>', '250');
            smtpStep($fp, 'DATA', '354');

            $headers = "Date: " . date('r') . "\r\n"
                     . "From: PipeSense <" . SMTP_USER . ">\r\n"
                     . "To: <" . $to . ">\r\n"
                     . "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n"
                     . "MIME-Version: 1.0\r\n"
                     . "Content-Type: text/plain; charset=UTF-8\r\n"
                     . "Content-Transfer-Encoding: base64\r\n";

            fwrite($fp, $headers . "\r\n" . chunk_split(base64_encode($body)) . "\r\n.\r\n");
            smtpStep($fp, null, '250');
        } catch (Throwable $e) {
            smtpLink(true);
            throw $e;
        }
        return true;
    }

    function sendNoticeEmail($to, $subject, $body)
    {
        if (!MAIL_ENABLED) return false;

        $subject = preg_replace('/[\r\n]+/', ' ', $subject);
        $ok      = false;

        try {
            if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
                throw new RuntimeException("The resident's email address is not valid");
            }

            if (defined('SMTP_USER') && SMTP_USER !== '') {
                if (!defined('SMTP_PASS') || SMTP_PASS === '') {
                    throw new RuntimeException("SMTP_PASS in forms/mail_config.php is empty. Paste the Gmail App Password for " . SMTP_USER);
                }
                $ok = smtpSend($to, $subject, $body);
            } else {
                $headers = "From: " . MAIL_FROM . "\r\nContent-Type: text/plain; charset=UTF-8";
                $ok = @mail($to, $subject, $body, $headers);
                if (!$ok) {
                    throw new RuntimeException("PHP mail() is not set up. Add your Gmail details to forms/mail_config.php");
                }
            }
        } catch (Throwable $e) {
            $ok = false;
            $GLOBALS['PS_MAIL_ERROR'] = $e->getMessage();
            error_log("sendNoticeEmail: " . $e->getMessage());
        }

        if (!$ok) {
            $GLOBALS['PS_MAIL_FAILED'] = (isset($GLOBALS['PS_MAIL_FAILED']) ? (int) $GLOBALS['PS_MAIL_FAILED'] : 0) + 1;
        }
        return $ok;
    }

    function whenText($startTs, $endTs)
    {
        $f = function ($ts) { return date('M j, g:i A', (int) $ts); };
        if ($startTs !== null && $endTs !== null) return $f($startTs) . " to " . $f($endTs);
        if ($startTs !== null) return "from " . $f($startTs);
        if ($endTs !== null)   return "until " . $f($endTs);
        return "";
    }

    function haversineM($lat1, $lng1, $lat2, $lng2)
    {
        $r    = M_PI / 180;
        $dLat = ($lat2 - $lat1) * $r;
        $dLng = ($lng2 - $lng1) * $r;
        $a    = pow(sin($dLat / 2), 2) + cos($lat1 * $r) * cos($lat2 * $r) * pow(sin($dLng / 2), 2);
        return 2 * 6371000 * asin(min(1, sqrt($a)));
    }

    function pointInPolygon($lat, $lng, $pts)
    {
        $inside = false;
        $n = count($pts);
        for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
            $yi = $pts[$i][0]; $xi = $pts[$i][1];
            $yj = $pts[$j][0]; $xj = $pts[$j][1];
            if ((($yi > $lat) !== ($yj > $lat)) && ($lng < ($xj - $xi) * ($lat - $yi) / ($yj - $yi) + $xi)) {
                $inside = !$inside;
            }
        }
        return $inside;
    }

    function geofenceOf($rep)
    {
        if (empty($rep['geofence'])) return null;
        $g = json_decode($rep['geofence'], true);
        if (is_array($g) && isset($g['type']) && $g['type'] === 'polygon'
            && isset($g['points']) && is_array($g['points']) && count($g['points']) >= 3) {
            return $g;
        }
        return null;
    }

    function reportCovers($rep, $lat, $lng)
    {
        $g = geofenceOf($rep);
        if ($g) return pointInPolygon($lat, $lng, $g['points']);

        $radius = isset($rep['radius_m']) && (int) $rep['radius_m'] > 0 ? (int) $rep['radius_m'] : DEFAULT_COVERAGE_M;
        return haversineM((float) $rep['lat'], (float) $rep['lng'], $lat, $lng) <= $radius;
    }

    function parseGeofence($raw, &$errors)
    {
        if ($raw === '' || $raw === null) return null;

        $g = json_decode($raw, true);
        if (!is_array($g) || !isset($g['type']) || $g['type'] !== 'polygon'
            || !isset($g['points']) || !is_array($g['points'])) {
            $errors[] = "The drawn coverage area is not valid.";
            return null;
        }

        $n = count($g['points']);
        if ($n < 3 || $n > 200) {
            $errors[] = "The coverage area needs 3 to 200 points.";
            return null;
        }

        $clean = [];
        foreach ($g['points'] as $p) {
            if (!is_array($p) || count($p) < 2 || !validPoint($p[0], $p[1])) {
                $errors[] = "Every point of the coverage area must be inside Bacolod City.";
                return null;
            }
            $clean[] = [round((float) $p[0], 6), round((float) $p[1], 6)];
        }

        return json_encode(["type" => "polygon", "points" => $clean]);
    }

    function coverageText($row)
    {
        $g = geofenceOf($row);
        if ($g) return "drawn area, " . count($g['points']) . " points";
        return "circle " . ((int) $row['radius_m']) . " m";
    }

    function logReport($conn, $reportId, $title, $action, $from, $to, $actorName, $actorKey)
    {
        $stmt = $conn->prepare(
            "INSERT INTO report_log (report_id, title, action, from_value, to_value, actor, actor_key)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $reportId = (int) $reportId;
        $title    = function_exists('mb_substr') ? mb_substr((string) $title, 0, 90) : substr((string) $title, 0, 90);
        $stmt->bind_param("issssss", $reportId, $title, $action, $from, $to, $actorName, $actorKey);
        $stmt->execute();
        $stmt->close();
    }

    function typeLabel($t)
    {
        $labels = ['interruption' => 'Water interruption', 'maintenance' => 'Maintenance',
                   'pressure' => 'Low pressure', 'quality' => 'Water quality'];
        return isset($labels[$t]) ? $labels[$t] : $t;
    }

    function reportAlertsHome($rep, $lat, $lng)
    {
        $officialActive = $rep['source'] === 'official' && in_array($rep['status'], ['scheduled', 'ongoing'], true);
        $codeRed        = !empty($rep['code_red']) && (int) $rep['code_red'] === 1 && $rep['status'] !== 'resolved';

        if ($officialActive && reportCovers($rep, $lat, $lng)) return true;

        if ($codeRed) {
            if (haversineM((float) $rep['lat'], (float) $rep['lng'], $lat, $lng) <= RESIDENT_GEOFENCE_M) return true;
            if ($rep['source'] === 'official' && reportCovers($rep, $lat, $lng)) return true;
        }
        return false;
    }

    function notifyAffected($conn, $reportId, $onlyUserId = null, $force = false)
    {
        $stmt = $conn->prepare(
            "SELECT title, description, type, status, area, lat, lng, source, radius_m, geofence, code_red,
                    UNIX_TIMESTAMP(starts_at) AS s, UNIX_TIMESTAMP(ends_at) AS e,
                    UNIX_TIMESTAMP(created_at) AS c
             FROM reports WHERE id = ?"
        );
        $stmt->bind_param("i", $reportId);
        $stmt->execute();
        $rep = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$rep) return 0;

        $sql = "SELECT u.id, u.name, u.email, h.lat AS hlat, h.lng AS hlng
                FROM user_homes h
                JOIN user_login u ON u.id = h.user_id";
        if ($onlyUserId !== null) {
            $stmt = $conn->prepare($sql . " WHERE u.id = ?");
            $uid  = (int) $onlyUserId;
            $stmt->bind_param("i", $uid);
            $stmt->execute();
            $homes = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmt->close();
        } else {
            $homes = $conn->query($sql)->fetch_all(MYSQLI_ASSOC);
        }

        $residents = [];
        foreach ($homes as $h) {
            if (reportAlertsHome($rep, (float) $h['hlat'], (float) $h['hlng'])) $residents[] = $h;
        }
        if (!$residents) return 0;

        $codeRed = (int) $rep['code_red'] === 1 && $rep['status'] !== 'resolved';
        $when    = whenText($rep['s'], $rep['e']);

        if ($codeRed) {
            $message = "CODE RED: " . $rep['title'] . " (" . $rep['area'] . "). This report is close to your home.";
        } else {
            $prefix  = $rep['status'] === 'ongoing' ? "Ongoing" : "Scheduled";
            $message = $prefix . ": " . $rep['title'] . " (" . $rep['area'] . ")"
                     . ($when !== "" ? ", " . $when : "")
                     . ". Your home is inside the affected area.";
        }

        if ($force) {
            $sql = "INSERT INTO notifications (user_id, report_id, message)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE is_read = 0, created_at = NOW(), message = VALUES(message)";
        } else {
            $sql = "INSERT INTO notifications (user_id, report_id, message)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        is_read    = IF(message <> VALUES(message), 0, is_read),
                        created_at = IF(message <> VALUES(message), NOW(), created_at),
                        message    = VALUES(message)";
        }
        $ins = $conn->prepare($sql);

        $count = 0;
        foreach ($residents as $r) {
            $uid = (int) $r['id'];
            $ins->bind_param("iis", $uid, $reportId, $message);
            $ins->execute();

            if ($ins->affected_rows > 0) {
                $count++;

                if ($codeRed) {
                    $dist = (int) round(haversineM((float) $rep['lat'], (float) $rep['lng'], (float) $r['hlat'], (float) $r['hlng']));
                    $text = "CODE RED water service report\n\n"
                          . "Hello " . $r['name'] . ",\n\n"
                          . "An urgent report was posted close to your home in PipeSense.\n\n"
                          . "Title: " . $rep['title'] . "\n"
                          . "Type: " . typeLabel($rep['type']) . "\n"
                          . "Barangay: " . $rep['area'] . "\n"
                          . "Status: " . ucfirst($rep['status']) . "\n"
                          . "Reported: " . date('M j, Y g:i A', (int) $rep['c']) . "\n"
                          . ($when !== "" ? "Schedule: " . $when . "\n" : "")
                          . "Distance from your home: about " . $dist . " m\n\n"
                          . "Details:\n" . ($rep['description'] !== null && $rep['description'] !== '' ? $rep['description'] : "No details were added.") . "\n\n"
                          . "Open PipeSense to see it on the map.\n";
                    sendNoticeEmail((string) $r['email'], "PipeSense CODE RED: " . $rep['title'], $text);
                } else {
                    sendNoticeEmail(
                        (string) $r['email'],
                        "PipeSense: water service notice for your home",
                        "Hello " . $r['name'] . ",\n\n" . $message . "\n\nOpen PipeSense to see it on the map.\n"
                    );
                }
            }
        }
        $ins->close();

        return $count;
    }

    function notifyUserForActiveAdvisories($conn, $userId, $lat, $lng)
    {
        $lat = (float) $lat;
        $lng = (float) $lng;
        $uid = (int) $userId;

        $stmt = $conn->prepare(
            "SELECT n.id AS nid, r.lat, r.lng, r.radius_m, r.geofence, r.source, r.status, r.code_red
             FROM notifications n
             JOIN reports r ON r.id = n.report_id
             WHERE n.user_id = ?"
        );
        $stmt->bind_param("i", $uid);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        foreach ($rows as $row) {
            if (!reportAlertsHome($row, $lat, $lng)) {
                $del = $conn->prepare("DELETE FROM notifications WHERE id = ?");
                $nid = (int) $row['nid'];
                $del->bind_param("i", $nid);
                $del->execute();
                $del->close();
            }
        }

        $ids    = [];
        $result = $conn->query(
            "SELECT id FROM reports
             WHERE (source = 'official' AND status IN ('scheduled', 'ongoing'))
                OR (code_red = 1 AND status <> 'resolved')"
        );
        while ($row = $result->fetch_assoc()) {
            $ids[] = (int) $row['id'];
        }

        $total = 0;
        foreach ($ids as $rid) {
            $total += notifyAffected($conn, $rid, $uid);
        }
        return $total;
    }

    function verifiedEmailCopy($type)
    {
        $copy = [
            'interruption' => [
                'subject' => 'Water interruption reported in your area',
                'intro'   => 'A water interruption was reported near you, and the PipeSense administrator has verified it.',
                'tips'    => [
                    'Store enough water for drinking, cooking and hygiene.',
                    'Avoid running washing machines and other water-using appliances until the supply returns.',
                    'Close any taps you opened, so water does not spill when the supply comes back.'
                ]
            ],
            'maintenance' => [
                'subject' => 'Maintenance work in your area',
                'intro'   => 'Maintenance work on the water system was reported near you, and the PipeSense administrator has verified it.',
                'tips'    => [
                    'Expect low pressure or short interruptions while the work is going on.',
                    'Store some water ahead of time if a schedule is shown above.',
                    'Check PipeSense for updates on when the work ends.'
                ]
            ],
            'pressure' => [
                'subject' => 'Low water pressure reported in your area',
                'intro'   => 'Low water pressure was reported near you, and the PipeSense administrator has verified it.',
                'tips'    => [
                    'Use water outside the busiest hours, such as early morning or late evening.',
                    'If neighbors nearby have normal pressure, check the valves and filters in your own plumbing.',
                    'Report it in PipeSense if the water stops completely.'
                ]
            ],
            'quality' => [
                'subject' => 'Water quality concern reported in your area',
                'intro'   => 'A water quality concern was reported near you, and the PipeSense administrator has verified it.',
                'tips'    => [
                    'Do not drink the water if it looks cloudy or colored, or smells or tastes unusual.',
                    'Until it is cleared, use bottled water, or water boiled at a rolling boil for at least one minute, for drinking and cooking.',
                    'Contact your water provider if you notice a problem at home.'
                ]
            ]
        ];

        return isset($copy[$type]) ? $copy[$type] : [
            'subject' => 'Water service report in your area',
            'intro'   => 'A water service report was posted near you, and the PipeSense administrator has verified it.',
            'tips'    => ['Open PipeSense to see what is happening and how long it may last.']
        ];
    }

    function verifiedEmailText($rep, $name, $dist, $inBarangay)
    {
        $copy = verifiedEmailCopy($rep['type']);
        $when = whenText($rep['s'], $rep['e']);

        $why = [];
        if ($inBarangay)      $why[] = "your address is in " . $rep['area'];
        if ($dist !== null && $dist <= RESIDENT_GEOFENCE_M) $why[] = "your home marker is about " . (int) round($dist) . " m from it";

        $text  = "Hello " . $name . ",\n\n"
               . $copy['intro'] . "\n\n"
               . "What was reported\n"
               . "Title: "    . $rep['title'] . "\n"
               . "Type: "     . typeLabel($rep['type']) . "\n"
               . "Barangay: " . $rep['area'] . "\n"
               . "Status: "   . ucfirst($rep['status']) . "\n"
               . "Reported: " . date('M j, Y g:i A', (int) $rep['c']) . "\n"
               . ($when !== "" ? "Schedule: " . $when . "\n" : "")
               . "\nDetails:\n"
               . ($rep['description'] !== null && $rep['description'] !== '' ? $rep['description'] : "No details were added.") . "\n\n"
               . "What you can do\n";

        foreach ($copy['tips'] as $tip) {
            $text .= "- " . $tip . "\n";
        }

        $text .= "\nOpen PipeSense to see it on the map.\n";
        if ($why) {
            $text .= "\nYou are getting this email because " . implode(" and ", $why) . ".\n";
        }
        return $text;
    }

    function emailVerifiedReport($conn, $reportId)
    {
        $reportId = (int) $reportId;

        @set_time_limit(180);
        @ignore_user_abort(true);

        $stmt = $conn->prepare(
            "SELECT title, description, type, status, area, lat, lng, source, radius_m, geofence,
                    code_red, verified, author_id,
                    UNIX_TIMESTAMP(starts_at) AS s, UNIX_TIMESTAMP(ends_at) AS e,
                    UNIX_TIMESTAMP(created_at) AS c
             FROM reports WHERE id = ?"
        );
        $stmt->bind_param("i", $reportId);
        $stmt->execute();
        $rep = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$rep || (int) $rep['verified'] !== 1 || $rep['status'] === 'resolved') return 0;

        $users = $conn->query(
            "SELECT u.id, u.name, u.email, u.address, h.lat AS hlat, h.lng AS hlng
             FROM user_login u
             LEFT JOIN user_homes h ON h.user_id = u.id"
        )->fetch_all(MYSQLI_ASSOC);

        $seen = $conn->prepare("SELECT 1 FROM report_emails WHERE user_id = ? AND report_id = ? AND kind = 'verified'");
        $mark = $conn->prepare("INSERT IGNORE INTO report_emails (user_id, report_id, kind) VALUES (?, ?, 'verified')");

        $sent = 0;
        foreach ($users as $u) {
            $uid = (int) $u['id'];

            if ($u['email'] === null || trim($u['email']) === '') continue;
            if ($rep['author_id'] === 'user-' . $uid) continue;

            $inBarangay = false;

            $hasHome = $u['hlat'] !== null && $u['hlng'] !== null;
            $dist    = $hasHome ? haversineM((float) $rep['lat'], (float) $rep['lng'], (float) $u['hlat'], (float) $u['hlng']) : null;
            $near    = $dist !== null && $dist <= RESIDENT_GEOFENCE_M;

            if (!$near) continue;

            if ($hasHome && reportAlertsHome($rep, (float) $u['hlat'], (float) $u['hlng'])) continue;

            $seen->bind_param("ii", $uid, $reportId);
            $seen->execute();
            $seen->store_result();
            $already = $seen->num_rows > 0;
            $seen->free_result();
            if ($already) continue;

            $copy = verifiedEmailCopy($rep['type']);
            $ok   = sendNoticeEmail(
                (string) $u['email'],
                "PipeSense: " . $copy['subject'] . " (" . $rep['area'] . ")",
                verifiedEmailText($rep, $u['name'], $dist, $inBarangay)
            );

            if ($ok) {
                $mark->bind_param("ii", $uid, $reportId);
                $mark->execute();
                $sent++;
            }
        }

        $seen->close();
        $mark->close();
        smtpLink(true);
        return $sent;
    }

    function emailedSummary($n)
    {
        if ($n > 0) {
            return " " . $n . " resident" . ($n === 1 ? "" : "s") . " in the report's area " . ($n === 1 ? "was" : "were") . " emailed.";
        }
        $failed = isset($GLOBALS['PS_MAIL_FAILED']) ? (int) $GLOBALS['PS_MAIL_FAILED'] : 0;
        return $failed > 0 ? "" : " No other resident in this area needed an email.";
    }

    function dbError($e, $file)
    {
        global $DEBUG;

        error_log($file . ": " . $e->getMessage());

        $reply = [
            "status"  => "error",
            "message" => "Database error. Check that MySQL is running and the tables from pipesense_tables.sql exist."
        ];
        if ($DEBUG) {
            $reply["detail"] = $e->getMessage();
        }
        respond($reply, 500);
    }

    function sessionIdentity()
    {
        $token = '';
        if (isset($_POST['token']))     $token = (string) $_POST['token'];
        elseif (isset($_GET['token']))  $token = (string) $_GET['token'];

        if ($token !== '') {
            if (isset($_SESSION['pipesense_tokens'][$token])) {
                return $_SESSION['pipesense_tokens'][$token];
            }
            fail("Your session has expired. Log in again.", 401, ["code" => "not_logged_in"]);
        }

        return [
            "role" => isset($_SESSION['pipesense_role']) ? $_SESSION['pipesense_role'] : null,
            "id"   => isset($_SESSION['pipesense_user_id']) ? (int) $_SESSION['pipesense_user_id'] : 0
        ];
    }

    function actor()
    {
        $who  = sessionIdentity();
        $role = $who['role'];
        $id   = (int) $who['id'];

        if (($role !== 'admin' && $role !== 'resident') || $id <= 0) {
            fail("Your session has expired. Log in again.", 401, ["code" => "not_logged_in"]);
        }

        if ($role === 'admin') {
            return ["role" => "admin", "id" => $id, "key" => "admin-" . $id, "name" => "PipeSense Admin"];
        }

        $name = '';
        $stmt = db()->prepare("SELECT name FROM user_login WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->bind_result($name);
        $stmt->fetch();
        $stmt->close();

        return ["role" => "resident", "id" => $id, "key" => "user-" . $id, "name" => $name ? $name : "Resident"];
    }

    function requireAdmin()
    {
        $me = actor();
        if ($me['role'] !== 'admin') {
            fail("Administrators only.", 403);
        }
        return $me;
    }

?>
