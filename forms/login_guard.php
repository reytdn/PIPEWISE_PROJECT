<?php

    // Login lockout: 5 failed attempts within 10 minutes locks that account + IP for 10 minutes.
    const LOGIN_MAX_FAILS  = 5;
    const LOGIN_WINDOW_SEC = 600;
    const LOGIN_LOCK_SEC   = 600;

    function loginGuardEnsure($conn)
    {
        $conn->query(
            "CREATE TABLE IF NOT EXISTS login_attempts (
                k            CHAR(64) NOT NULL PRIMARY KEY,
                fails        INT      NOT NULL DEFAULT 0,
                first_at     INT      NOT NULL,
                locked_until INT      NOT NULL DEFAULT 0
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    }

    function loginGuardKey($scope, $identifier)
    {
        $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
        return hash('sha256', $scope . '|' . $ip . '|' . strtolower(trim($identifier)));
    }

    // Seconds left on a lock, or 0 when the login is allowed.
    function loginLockedFor($conn, $key)
    {
        $stmt = $conn->prepare("SELECT locked_until FROM login_attempts WHERE k = ?");
        $stmt->bind_param("s", $key);
        $stmt->execute();
        $stmt->bind_result($until);
        $found = $stmt->fetch();
        $stmt->close();

        if (!$found) return 0;
        $left = (int) $until - time();
        return $left > 0 ? $left : 0;
    }

    function loginRecordFail($conn, $key)
    {
        $now = time();

        $stmt = $conn->prepare("SELECT fails, first_at FROM login_attempts WHERE k = ?");
        $stmt->bind_param("s", $key);
        $stmt->execute();
        $stmt->bind_result($fails, $firstAt);
        $found = $stmt->fetch();
        $stmt->close();

        if (!$found || ($now - (int) $firstAt) > LOGIN_WINDOW_SEC) {
            $fails   = 1;
            $firstAt = $now;
        } else {
            $fails = (int) $fails + 1;
        }

        $lockedUntil = $fails >= LOGIN_MAX_FAILS ? $now + LOGIN_LOCK_SEC : 0;

        $up = $conn->prepare("REPLACE INTO login_attempts (k, fails, first_at, locked_until) VALUES (?, ?, ?, ?)");
        $up->bind_param("siii", $key, $fails, $firstAt, $lockedUntil);
        $up->execute();
        $up->close();
    }

    function loginClear($conn, $key)
    {
        $stmt = $conn->prepare("DELETE FROM login_attempts WHERE k = ?");
        $stmt->bind_param("s", $key);
        $stmt->execute();
        $stmt->close();
    }

    function loginLockedReply($seconds)
    {
        $mins = max(1, (int) ceil($seconds / 60));
        echo json_encode([
            "status"  => "error",
            "code"    => "locked",
            "message" => "Too many failed attempts. Try again in " . $mins . " minute" . ($mins === 1 ? "" : "s") . "."
        ]);
        exit;
    }

?>
