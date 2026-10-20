<?php
// PHP 7.4+; SMTP credentials and rate-limit files live OUTSIDE the public directory.
declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;

const BEX_SUCCESS = 'お問い合わせを送信しました。内容を確認のうえ、ご連絡いたします。';
const BEX_UNAVAILABLE = '現在フォームから送信できません。時間をおいてお試しいただくか、ページ下部の連絡先へお問い合わせください。';

header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');

function bexEscape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function bexToken(): string
{
    if (empty($_SESSION['contact_token']) || ($_SESSION['contact_token_time'] ?? 0) < time() - 1800) {
        $_SESSION['contact_token'] = bin2hex(random_bytes(32));
        $_SESSION['contact_token_time'] = time();
    }
    return $_SESSION['contact_token'];
}

function bexReply(int $status, string $message, array $errors = [], array $values = []): void
{
    http_response_code($status);
    $token = session_status() === PHP_SESSION_ACTIVE ? bexToken() : '';
    if (strpos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false || ($_GET['action'] ?? '') === 'token') {
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['ok' => $status >= 200 && $status < 300, 'message' => $message, 'errors' => (object) $errors, 'token' => $token], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }
    header('Content-Type: text/html; charset=UTF-8');
    header('X-Robots-Tag: noindex, follow');
    // Also preserve safely escaped input on an expired token or temporary outage.
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && !$values) {
        foreach (['company', 'name', 'email', 'tel', 'message'] as $field) {
            $input = $_POST[$field] ?? '';
            $values[$field] = is_string($input) ? substr($input, 0, 20000) : '';
        }
    }
    $html = file_get_contents(__DIR__ . '/contact.html');
    $html = preg_replace('~<noscript>.*?</noscript>~s', '', $html);
    $html = str_replace('name="_token" value=""', 'name="_token" value="' . bexEscape($token) . '"', $html);
    if ($token !== '') {
        $html = str_replace('data-contact-submit disabled', 'data-contact-submit', $html);
    }
    if ($message !== '') {
        $state = $status >= 400 ? 'error' : 'success';
        $html = str_replace('tabindex="-1" hidden><!-- contact-feedback -->', 'tabindex="-1" data-state="' . $state . '">' . bexEscape($message), $html);
    }
    foreach (['company', 'name', 'email', 'tel'] as $field) {
        $html = preg_replace_callback('~<input\b[^>]*\bname="' . $field . '"[^>]*>~', function (array $match) use ($field, $values, $errors): string {
            return substr($match[0], 0, -1) . ' value="' . bexEscape($values[$field] ?? '') . '"' . (isset($errors[$field]) ? ' aria-invalid="true"' : '') . '>';
        }, $html);
    }
    $html = preg_replace_callback('~(<textarea\b[^>]*\bname="message"[^>]*>).*?(</textarea>)~s', function (array $match) use ($values, $errors): string {
        $start = isset($errors['message']) ? str_replace('>', ' aria-invalid="true">', $match[1]) : $match[1];
        return $start . bexEscape($values['message'] ?? '') . $match[2];
    }, $html);
    echo $html;
    exit;
}

function bexOutsidePublic(string $path): bool
{
    $resolved = realpath($path);
    $root = str_replace('\\', '/', (string) realpath(__DIR__)) . '/';
    return $resolved !== false && stripos(str_replace('\\', '/', $resolved) . '/', $root) !== 0;
}

// The only configurable file path is a server environment variable, never request data.
$privateDirectory = dirname(__DIR__) . '/bex-private';
$config = [
    'smtp_host' => 'bex.co.jp', 'smtp_port' => 465,
    'smtp_username' => 'uto@bex.co.jp', 'smtp_password' => getenv('BEX_SMTP_PASSWORD') ?: '',
    'from_email' => 'uto@bex.co.jp', 'to_email' => 'soumu@bex.co.jp',
    'state_dir' => $privateDirectory . '/form-state',
    'allowed_origins' => ['https://www.bex.co.jp', 'https://bex.co.jp'],
    'require_https' => true, 'hourly_limit' => 10, 'cooldown_seconds' => 30,
];
$configPath = getenv('BEX_CONTACT_CONFIG') ?: $privateDirectory . '/contact-config.php';
try {
    if (is_file($configPath)) {
        if (!bexOutsidePublic($configPath)) {
            throw new RuntimeException('Configuration must be outside the public directory.');
        }
        $privateConfig = require $configPath;
        if (!is_array($privateConfig)) {
            throw new RuntimeException('Invalid configuration.');
        }
        $config = array_replace($config, $privateConfig);
    }
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    if ($config['require_https'] && !$https) {
        bexReply(503, '安全な接続でフォームをご利用ください。https://www.bex.co.jp/contact.html を開いてください。');
    }
    if ($config['smtp_password'] === '' || !extension_loaded('openssl')) {
        bexReply(503, BEX_UNAVAILABLE);
    }
    session_name('bex_contact');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
    if (!session_start()) {
        throw new RuntimeException('Session could not be started.');
    }
    bexToken();
} catch (Throwable $exception) {
    error_log('[BEX contact] Initialization failed (' . get_class($exception) . ').');
    bexReply(503, BEX_UNAVAILABLE);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    if (($_GET['action'] ?? '') === 'token') {
        bexReply(200, '');
    }
    $flash = $_SESSION['contact_sent'] ?? false;
    unset($_SESSION['contact_sent']);
    bexReply(200, $flash ? BEX_SUCCESS : '');
}
if ($method !== 'POST') {
    header('Allow: GET, POST');
    bexReply(405, 'この操作には対応していません。');
}
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 65536) {
    bexReply(413, '入力内容が長すぎます。お問い合わせ内容を短くしてお試しください。');
}
if (isset($_SERVER['HTTP_ORIGIN']) && !in_array($_SERVER['HTTP_ORIGIN'], $config['allowed_origins'], true)) {
    bexReply(403, '送信元を確認できませんでした。フォームを再読み込みしてください。');
}
$submittedToken = $_POST['_token'] ?? '';
if (!is_string($submittedToken) || !preg_match('/^[a-f0-9]{64}$/D', $submittedToken)) {
    bexReply(403, 'フォームを再読み込みしてから送信してください。');
}
// A retry after a lost response must not send the same submission twice.
$sentTokens = array_filter($_SESSION['contact_sent_tokens'] ?? [], function ($sentAt): bool { return $sentAt > time() - 1800; });
if (isset($sentTokens[hash('sha256', $submittedToken)])) {
    if (strpos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') === false) {
        $_SESSION['contact_sent'] = true;
        header('Location: contact.php?sent=1', true, 303);
        exit;
    }
    bexReply(200, BEX_SUCCESS);
}
if (!hash_equals(bexToken(), $submittedToken)) {
    bexReply(403, 'フォームの有効期限が切れました。もう一度送信してください。');
}

$values = [];
$errors = [];
$limits = ['company' => 200, 'name' => 100, 'email' => 254, 'tel' => 50, 'message' => 5000];
$labels = ['company' => '貴社名・団体名', 'name' => 'お名前', 'email' => 'メールアドレス', 'tel' => '電話番号', 'message' => 'お問い合わせ内容'];
foreach ($limits as $field => $limit) {
    $value = $_POST[$field] ?? '';
    if (!is_string($value) || preg_match('//u', $value) !== 1) {
        $errors[$field] = $labels[$field] . 'を正しく入力してください。';
        $values[$field] = '';
        continue;
    }
    $value = str_replace(["\r\n", "\r"], "\n", $value);
    $values[$field] = trim($value);
    $controlPattern = $field === 'message' ? '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/' : '/[\x00-\x1F\x7F]/';
    $length = preg_match_all('/./us', $value);
    if (preg_match($controlPattern, $value) || $length > $limit) {
        $errors[$field] = $labels[$field] . 'は' . $limit . '文字以内で正しく入力してください。';
    } elseif (in_array($field, ['name', 'email', 'message'], true) && $values[$field] === '') {
        $errors[$field] = $labels[$field] . 'を入力してください。';
    }
}
if (!isset($errors['email']) && !filter_var($values['email'], FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'メールアドレスを正しく入力してください。';
}
if (!isset($_POST['website']) || !is_string($_POST['website']) || $_POST['website'] !== '') {
    $errors['website'] = '入力内容を確認して、もう一度お試しください。';
}
if ($errors) {
    bexReply(422, implode(' ', array_values($errors)), $errors, $values);
}

// Per-IP rate limiting also applies across fresh browser sessions. No message is stored.
try {
    $stateDirectory = $config['state_dir'];
    if (!is_dir($stateDirectory) && !mkdir($stateDirectory, 0700, true) && !is_dir($stateDirectory)) {
        throw new RuntimeException('State directory could not be created.');
    }
    if (!bexOutsidePublic($stateDirectory)) {
        throw new RuntimeException('State must be outside the public directory.');
    }
    $rateFile = $stateDirectory . '/' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown') . '.json';
    $handle = fopen($rateFile, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        throw new RuntimeException('Rate limit unavailable.');
    }
    $history = json_decode(stream_get_contents($handle), true);
    $now = time();
    $history = array_values(array_filter(is_array($history) ? $history : [], function ($timestamp) use ($now): bool { return is_int($timestamp) && $timestamp > $now - 3600; }));
    $last = $history ? $history[count($history) - 1] : 0;
    if (count($history) >= (int) $config['hourly_limit'] || $last > $now - (int) $config['cooldown_seconds']) {
        flock($handle, LOCK_UN);
        fclose($handle);
        $retryAfter = count($history) >= (int) $config['hourly_limit']
            ? max(1, $history[0] + 3600 - $now)
            : max(1, $last + (int) $config['cooldown_seconds'] - $now);
        header('Retry-After: ' . $retryAfter);
        bexReply(429, '短時間に複数回の送信がありました。時間をおいてお試しください。', [], $values);
    }
    $history[] = $now;
    rewind($handle);
    if (!ftruncate($handle, 0) || fwrite($handle, json_encode($history)) === false || !fflush($handle)) {
        throw new RuntimeException('Rate limit could not be saved.');
    }
    flock($handle, LOCK_UN);
    fclose($handle);

    require_once __DIR__ . '/lib/phpmailer/src/Exception.php';
    require_once __DIR__ . '/lib/phpmailer/src/PHPMailer.php';
    require_once __DIR__ . '/lib/phpmailer/src/SMTP.php';
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $config['smtp_host'];
    $mail->Port = (int) $config['smtp_port'];
    $mail->SMTPAuth = true;
    $mail->Username = $config['smtp_username'];
    $mail->Password = $config['smtp_password'];
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    $mail->Timeout = 10;
    $mail->Timelimit = 15;
    $mail->SMTPDebug = 0;
    $mail->SMTPOptions = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false]];
    if (!empty($config['smtp_ca_file'])) {
        $mail->SMTPOptions['ssl']['cafile'] = $config['smtp_ca_file'];
    }
    $mail->CharSet = 'UTF-8';
    $mail->Encoding = 'base64';
    $mail->setFrom($config['from_email'], '株式会社ベックス お問い合わせ');
    $mail->Sender = $config['from_email'];
    $mail->addAddress($config['to_email']);
    $mail->addReplyTo($values['email'], $values['name']);
    $mail->Subject = '【株式会社ベックス】Webサイトからのお問い合わせ';
    $mail->Body = "Webサイトからお問い合わせがありました。\n\n";
    foreach ($labels as $field => $label) {
        $mail->Body .= $label . '：' . ($values[$field] !== '' ? $values[$field] : '（未入力）') . "\n\n";
    }
    $mail->Body .= '受付日時：' . (new DateTimeImmutable('now', new DateTimeZone('Asia/Tokyo')))->format('Y-m-d H:i:s') . " (JST)\n";
    $mail->send();
} catch (Throwable $exception) {
    // Do not log SMTP transcripts, passwords, visitor fields, or exception messages.
    error_log('[BEX contact] Delivery failed (' . get_class($exception) . ').');
    bexReply(503, BEX_UNAVAILABLE, [], $values);
}

$sentTokens[hash('sha256', $submittedToken)] = time();
$_SESSION['contact_sent_tokens'] = array_slice($sentTokens, -10, null, true);
unset($_SESSION['contact_token']);
bexToken();
if (strpos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') === false) {
    $_SESSION['contact_sent'] = true;
    header('Location: contact.php?sent=1', true, 303);
    exit;
}
bexReply(200, BEX_SUCCESS);
