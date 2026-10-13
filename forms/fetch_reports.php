<?php
    // reports shown on the public overview page (index.html):
    // no login needed

    include "db.php";

    $sql = "SELECT * FROM reports";
    $result = $conn->query($sql);

    $reports = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $reports[] = $row;
        }
    }

    echo json_encode([
        "status" => "success",
        "data" => $reports
    ]);

    $conn->close();
?>
