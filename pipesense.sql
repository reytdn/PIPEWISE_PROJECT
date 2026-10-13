-- PipeSense tables. Import this file in phpMyAdmin (Import tab).
-- It is safe to import more than once: tables that already exist are not touched.
-- If your database has another name, change the two names below
-- and also change $db in forms/db.php.

CREATE DATABASE IF NOT EXISTS pipesense;
USE pipesense;

CREATE TABLE IF NOT EXISTS admin_login (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(30) NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS user_login (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(30) NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL DEFAULT '',
    address VARCHAR(255) NOT NULL DEFAULT '',
    email VARCHAR(100) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS reports (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'reported',
    title VARCHAR(90) NOT NULL,
    description TEXT NULL,
    area VARCHAR(60) NOT NULL,
    lat DECIMAL(9,6) NOT NULL,
    lng DECIMAL(9,6) NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'community',
    verified TINYINT(1) NOT NULL DEFAULT 0,
    author_id VARCHAR(30) NULL,
    author VARCHAR(100) NULL,
    radius_m INT NOT NULL DEFAULT 1000,
    geofence TEXT NULL,
    code_red TINYINT(1) NOT NULL DEFAULT 0,
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,
    resolved_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_homes (
    user_id INT NOT NULL PRIMARY KEY,
    lat DECIMAL(9,6) NOT NULL,
    lng DECIMAL(9,6) NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    report_id INT NOT NULL,
    message VARCHAR(400) NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_log (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    report_id INT NOT NULL,
    title VARCHAR(90) NOT NULL DEFAULT '',
    action VARCHAR(20) NOT NULL,
    from_value VARCHAR(255) NULL,
    to_value VARCHAR(255) NULL,
    actor VARCHAR(100) NOT NULL DEFAULT '',
    actor_key VARCHAR(30) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A first administrator, only added when there is none yet.
-- Log in with admin / admin123, then change the password in the table.
INSERT INTO admin_login (username, password, email)
SELECT 'admin', 'admin123', 'admin@example.com'
WHERE NOT EXISTS (SELECT 1 FROM admin_login);
