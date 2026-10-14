<?php

    // Shared database settings. Override with environment variables outside local testing.
    $host = getenv('PS_DB_HOST') ?: 'localhost';
    $user = getenv('PS_DB_USER') ?: 'root';
    $pass = getenv('PS_DB_PASS') !== false ? getenv('PS_DB_PASS') : '';
    $db   = getenv('PS_DB_NAME') ?: 'pipesense';

?>
