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

    $action   = isset($_POST['action']) ? trim((string) $_POST['action']) : '';
    $username = isset($_POST['username']) ? trim((string) $_POST['username']) : '';
    $email    = isset($_POST['email']) ? trim((string) $_POST['email']) : '';
    $code     = isset($_POST['code']) ? trim((string) $_POST['code']) : '';

    const OTP_MINUTES      = 10;
    const OTP_RESEND_SECS  = 60;
    const OTP_MAX_TRIES    = 5;
    const MAX_AVATAR_BYTES = 2097152;

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(["status" => "error", "message" => "Invalid request."]);
        exit;
    }

    function profileColumns($conn)
    {
        $has = function ($table, $col) use ($conn) {
            $stmt = $conn->prepare(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?"
            );
            $stmt->bind_param("ss", $table, $col);
            $stmt->execute();
            $stmt->bind_result($n);
            $stmt->fetch();
            $stmt->close();
            return (int) $n > 0;
        };

        if (!$has('user_login', 'avatar')) {
            $conn->query("ALTER TABLE user_login ADD COLUMN avatar VARCHAR(120) NULL");
        }

        $conn->query(
            "CREATE TABLE IF NOT EXISTS password_otps (
                user_id INT NOT NULL PRIMARY KEY,
                code_hash VARCHAR(255) NOT NULL,
                expires_at DATETIME NOT NULL,
                sent_at DATETIME NOT NULL,
                tries INT NOT NULL DEFAULT 0
            ) CHARACTER SET utf8mb4"
        );
    }

    function profileOf($conn, $id)
    {
        $stmt = $conn->prepare("SELECT id, username, name, email, address, avatar FROM user_login WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$row){
            echo json_encode(["status" => "error", "message" => "Account not found."]);
            exit;
        }

        return [
            "id"       => "user-" . $row['id'],
            "username" => $row['username'],
            "name"     => $row['name'],
            "email"    => $row['email'],
            "address"  => $row['address'],
            "avatar"   => $row['avatar'] ? $row['avatar'] : ''
        ];
    }

    function avatarDir()
    {
        return dirname(__DIR__) . '/uploads/avatars';
    }

    function deleteAvatarFile($path)
    {
        if (!is_string($path) || !preg_match('#^uploads/avatars/[A-Za-z0-9_]+\.(jpg|png|webp)$#', $path)) return;
        $full = dirname(__DIR__) . '/' . $path;
        if (is_file($full)) @unlink($full);
    }

    function maskEmail($email)
    {
        $parts = explode('@', $email, 2);
        if (count($parts) !== 2) return $email;
        $name = $parts[0];
        $keep = substr($name, 0, min(2, strlen($name)));
        return $keep . str_repeat('*', max(strlen($name) - strlen($keep), 1)) . '@' . $parts[1];
    }

    function emailTaken($conn, $email, $selfId)
    {
        $stmt = $conn->prepare("SELECT COUNT(*) FROM user_login WHERE email = ? AND id <> ?");
        $stmt->bind_param("si", $email, $selfId);
        $stmt->execute();
        $stmt->bind_result($n);
        $stmt->fetch();
        $stmt->close();
        if ((int) $n > 0) return true;

        $stmt = $conn->prepare("SELECT COUNT(*) FROM admin_login WHERE email = ?");
        $stmt->bind_param("s", $email);
        $stmt->execute();
        $stmt->bind_result($n);
        $stmt->fetch();
        $stmt->close();
        return (int) $n > 0;
    }

    function usernameTaken($conn, $username, $selfId)
    {
        $stmt = $conn->prepare("SELECT COUNT(*) FROM user_login WHERE username = ? AND id <> ?");
        $stmt->bind_param("si", $username, $selfId);
        $stmt->execute();
        $stmt->bind_result($n);
        $stmt->fetch();
        $stmt->close();
        if ((int) $n > 0) return true;

        $stmt = $conn->prepare("SELECT COUNT(*) FROM admin_login WHERE username = ?");
        $stmt->bind_param("s", $username);
        $stmt->execute();
        $stmt->bind_result($n);
        $stmt->fetch();
        $stmt->close();
        return (int) $n > 0;
    }

    try {
        $me   = actor($conn);

        if ($me['role'] !== 'resident') {
            echo json_encode(["status" => "error", "message" => "Profiles are for resident accounts."]);
            exit;
        }

        profileColumns($conn);

        $userId = (int) $me['id'];

        if ($action === 'get') {
            echo json_encode(["status" => "success", "profile" => profileOf($conn, $userId)]);
            exit;
        }

        if ($action === 'save') {

            $email    = strtolower($email);

            if (!preg_match('/^[A-Za-z0-9_.-]{3,30}$/', $username)) {
                echo json_encode(["status" => "error", "message" => "Username must be 3 to 30 letters, numbers, dots, dashes or underscores."]);
                exit;
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100) {
                echo json_encode(["status" => "error", "message" => "Enter a valid email address."]);
                exit;
            }
            if (usernameTaken($conn, $username, $userId)) {
                echo json_encode(["status" => "error", "message" => "That username is already taken."]);
                exit;
            }
            if (emailTaken($conn, $email, $userId)) {
                echo json_encode(["status" => "error", "message" => "That email address is already registered."]);
                exit;
            }

            try {
                $stmt = $conn->prepare("UPDATE user_login SET username = ?, email = ? WHERE id = ?");
                $stmt->bind_param("ssi", $username, $email, $userId);
                $stmt->execute();
                $stmt->close();
            } catch (mysqli_sql_exception $e) {
                if ((int) $e->getCode() === 1062){
                    echo json_encode(["status" => "error", "message" => "That username or email address is already registered."]);
                    exit;
                }
                throw $e;
            }

            echo json_encode(["status" => "success", "message" => "Profile updated.", "profile" => profileOf($conn, $userId)]);
            exit;
        }

        if ($action === 'avatar') {

            if (!isset($_FILES['avatar']) || !is_array($_FILES['avatar']) || $_FILES['avatar']['error'] === UPLOAD_ERR_NO_FILE) {
                echo json_encode(["status" => "error", "message" => "Choose a picture first."]);
                exit;
            }
            $f = $_FILES['avatar'];

            if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE || $f['size'] > MAX_AVATAR_BYTES) {
                echo json_encode(["status" => "error", "message" => "That picture is too large. Choose one under 2 MB."]);
                exit;
            }
            if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
                echo json_encode(["status" => "error", "message" => "The picture could not be uploaded. Try again."]);
                exit;
            }

            $mime = '';
            if (function_exists('finfo_open')) {
                $fi   = finfo_open(FILEINFO_MIME_TYPE);
                $mime = (string) finfo_file($fi, $f['tmp_name']);
                finfo_close($fi);
            } else {
                $info = @getimagesize($f['tmp_name']);
                $mime = $info ? (string) $info['mime'] : '';
            }
            $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
            if (!isset($ext[$mime]) || !@getimagesize($f['tmp_name'])) {
                echo json_encode(["status" => "error", "message" => "The picture must be a JPG, PNG or WebP image."]);
                exit;
            }

            $dir = avatarDir();
            if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
                echo json_encode(["status" => "error", "message" => "The server could not create the uploads folder."]);
                exit;
            }

            $name = bin2hex(random_bytes(12)) . '.' . $ext[$mime];
            if (!@move_uploaded_file($f['tmp_name'], $dir . '/' . $name)) {
                echo json_encode(["status" => "error", "message" => "The picture could not be saved on the server."]);
                exit;
            }
            $path = 'uploads/avatars/' . $name;

            $old = '';
            $stmt = $conn->prepare("SELECT avatar FROM user_login WHERE id = ?");
            $stmt->bind_param("i", $userId);
            $stmt->execute();
            $stmt->bind_result($old);
            $stmt->fetch();
            $stmt->close();

            $stmt = $conn->prepare("UPDATE user_login SET avatar = ? WHERE id = ?");
            $stmt->bind_param("si", $path, $userId);
            $stmt->execute();
            $stmt->close();

            deleteAvatarFile($old);

            echo json_encode(["status" => "success", "message" => "Profile picture updated.", "profile" => profileOf($conn, $userId)]);
            exit;
        }

        if ($action === 'avatar_remove') {

            $old = '';
            $stmt = $conn->prepare("SELECT avatar FROM user_login WHERE id = ?");
            $stmt->bind_param("i", $userId);
            $stmt->execute();
            $stmt->bind_result($old);
            $stmt->fetch();
            $stmt->close();

            $stmt = $conn->prepare("UPDATE user_login SET avatar = NULL WHERE id = ?");
            $stmt->bind_param("i", $userId);
            $stmt->execute();
            $stmt->close();

            deleteAvatarFile($old);

            echo json_encode(["status" => "success", "message" => "Profile picture removed.", "profile" => profileOf($conn, $userId)]);
            exit;
        }

        if ($action === 'otp_send') {

            $profile = profileOf($conn, $userId);
            $email   = $profile['email'];

            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                echo json_encode(["status" => "error", "message" => "Your account has no valid email address. Update your email first."]);
                exit;
            }

            $lastSent = null;
            $stmt = $conn->prepare("SELECT sent_at FROM password_otps WHERE user_id = ?");
            $stmt->bind_param("i", $userId);
            $stmt->execute();
            $stmt->bind_result($lastSent);
            $stmt->fetch();
            $stmt->close();

            if ($lastSent && (time() - strtotime($lastSent)) < OTP_RESEND_SECS) {
                $wait = OTP_RESEND_SECS - (time() - strtotime($lastSent));
                echo json_encode(["status" => "error", "message" => "Please wait " . $wait . " seconds before asking for another code.", "wait" => $wait]);
                exit;
            }

            $code    = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $hash    = password_hash($code, PASSWORD_DEFAULT);
            $now     = date('Y-m-d H:i:s');
            $expires = date('Y-m-d H:i:s', time() + OTP_MINUTES * 60);

            $stmt = $conn->prepare(
                "INSERT INTO password_otps (user_id, code_hash, expires_at, sent_at, tries)
                 VALUES (?, ?, ?, ?, 0)
                 ON DUPLICATE KEY UPDATE code_hash = ?, expires_at = ?, sent_at = ?, tries = 0"
            );
            $stmt->bind_param("issssss", $userId, $hash, $expires, $now, $hash, $expires, $now);
            $stmt->execute();
            $stmt->close();

            $first = trim(explode(' ', (string) $profile['name'])[0]);
            $body  = "Hello" . ($first !== '' ? " " . $first : "") . ",\n\n"
                   . "Your PipeSense password change code is:\n\n"
                   . "    " . $code . "\n\n"
                   . "It expires in " . OTP_MINUTES . " minutes. Enter it in PipeSense to set a new password.\n\n"
                   . "If you did not ask to change your password, ignore this email. Your password stays the same.\n\n"
                   . "PipeSense\n";

            $sent = sendNoticeEmail($email, "Your PipeSense password change code", $body);

            if (!$sent) {
                $stmt = $conn->prepare("DELETE FROM password_otps WHERE user_id = ?");
                $stmt->bind_param("i", $userId);
                $stmt->execute();
                $stmt->close();

                $reply = ["status" => "error", "message" => "The code email could not be sent. Try again in a moment."];
                if ($DEBUG && isset($GLOBALS['PS_MAIL_ERROR'])) $reply["detail"] = $GLOBALS['PS_MAIL_ERROR'];
                echo json_encode($reply);
                exit;
            }

            echo json_encode([
                "status"  => "success",
                "message" => "We sent a 6-digit code to " . maskEmail($email) . ".",
                "minutes" => OTP_MINUTES
            ]);
            exit;
        }

        if ($action === 'password_change') {

            $code    = preg_replace('/\D/', '', $code);
            $newPass = isset($_POST['password']) ? (string) $_POST['password'] : '';

            if (strlen($code) !== 6){
                echo json_encode(["status" => "error", "message" => "Enter the 6-digit code from your email."]);
                exit;
            }
            if (strlen($newPass) < 8){
                echo json_encode(["status" => "error", "message" => "Password must be at least 8 characters."]);
                exit;
            }
            if (strlen($newPass) > 200){
                echo json_encode(["status" => "error", "message" => "Password is too long."]);
                exit;
            }

            $hash = null; $expires = null; $tries = 0;
            $stmt = $conn->prepare("SELECT code_hash, expires_at, tries FROM password_otps WHERE user_id = ?");
            $stmt->bind_param("i", $userId);
            $stmt->execute();
            $stmt->bind_result($hash, $expires, $tries);
            $found = $stmt->fetch();
            $stmt->close();

            if (!$found){
                echo json_encode(["status" => "error", "message" => "Ask for a code first.", "code" => "no_otp"]);
                exit;
            }

            if (strtotime($expires) < time()) {
                $stmt = $conn->prepare("DELETE FROM password_otps WHERE user_id = ?");
                $stmt->bind_param("i", $userId);
                $stmt->execute();
                $stmt->close();
                echo json_encode(["status" => "error", "message" => "That code has expired. Ask for a new one.", "code" => "otp_expired"]);
                exit;
            }

            if ((int) $tries >= OTP_MAX_TRIES) {
                $stmt = $conn->prepare("DELETE FROM password_otps WHERE user_id = ?");
                $stmt->bind_param("i", $userId);
                $stmt->execute();
                $stmt->close();
                echo json_encode(["status" => "error", "message" => "Too many wrong codes. Ask for a new one.", "code" => "otp_locked"]);
                exit;
            }

            if (!password_verify($code, $hash)) {
                $stmt = $conn->prepare("UPDATE password_otps SET tries = tries + 1 WHERE user_id = ?");
                $stmt->bind_param("i", $userId);
                $stmt->execute();
                $stmt->close();
                usleep(400000);
                $left = max(OTP_MAX_TRIES - ((int) $tries + 1), 0);
                echo json_encode(["status" => "error", "message" => "That code is not correct." . ($left > 0 ? " " . $left . " tries left." : " Ask for a new code."), "code" => "otp_wrong"]);
                exit;
            }

            $newHash = password_hash($newPass, PASSWORD_DEFAULT);
            $stmt = $conn->prepare("UPDATE user_login SET password = ? WHERE id = ?");
            $stmt->bind_param("si", $newHash, $userId);
            $stmt->execute();
            $stmt->close();

            $stmt = $conn->prepare("DELETE FROM password_otps WHERE user_id = ?");
            $stmt->bind_param("i", $userId);
            $stmt->execute();
            $stmt->close();

            echo json_encode(["status" => "success", "message" => "Your password was changed."]);
            exit;
        }

        echo json_encode(["status" => "error", "message" => "Unknown action."]);
        exit;

    } catch (mysqli_sql_exception $e) {
        dbError($e, 'profile.php');
    }

?>
