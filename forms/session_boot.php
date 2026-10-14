<?php

    // Starts the session with safer cookie settings (HttpOnly, SameSite, Secure on HTTPS).
    if (session_status() === PHP_SESSION_NONE) {
        $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => $https,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
        session_start();
    }

?>
