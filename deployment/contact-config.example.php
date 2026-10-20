<?php
// Copy outside httpdocs to /var/www/vhosts/bex.co.jp/bex-private/contact-config.php.
// Do not add the real password to Git, public files, or JavaScript.
return [
    'smtp_host' => 'bex.co.jp',
    'smtp_port' => 465,
    'smtp_username' => 'uto@bex.co.jp',
    'smtp_password' => '', // Set the password for uto@bex.co.jp on the server only.
    'from_email' => 'uto@bex.co.jp',
    'to_email' => 'soumu@bex.co.jp',
    'allowed_origins' => ['https://www.bex.co.jp', 'https://bex.co.jp'],
    'require_https' => true,
];
