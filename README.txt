PIPESENSE - how to run

1. Start Apache and MySQL in Laragon. Put this folder in the www folder.
2. In phpMyAdmin, import pipesense.sql (Import tab).
   - Your database has another name? Change it in forms/db.php ($db).
   - Old reports table with other columns (latitude, locname...)? Drop it first, then import.
3. Open http://localhost/PIPESENSE_PROJECT/
   - first admin made by the sql file: admin / admin123
4. Emails (optional): put your Gmail address and an App Password in forms/mail_config.php.
   Leave the password empty and emails are simply skipped.

Pages
  index.html            public overview map (js/overview.js, forms/fetch_reports.php)
  login.html            log in / sign up (js/login.js)
  dashboard.html        resident AND admin dashboard (js/dashboard.js) - the admin sees extra things

forms/ (one small PHP file per job)
  db.php                connection + 5 tiny helper functions, included by every file
  login_user / login_admin / add_user / logout / get_user
  fetch_reports (public) / get_reports / add_report / edit_report / delete_report
  get_notifications / read_notifications / resend_notice
  save_home / get_home / get_history / search_users / test_mail
  notify.php + send_email.php   notices and emails for residents near a report
