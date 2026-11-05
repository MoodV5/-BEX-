// Local integration tests. Never connects to a real SMTP server or uses real credentials.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import tls from 'node:tls';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const php = process.env.BEX_TEST_PHP;
const openssl = process.env.BEX_TEST_OPENSSL || 'openssl';
if (!php) throw new Error('Set BEX_TEST_PHP to a PHP CLI executable.');
const directory = await mkdtemp(join(tmpdir(), 'bex-form-qa-'));
const key = join(directory, 'localhost.key');
const cert = join(directory, 'localhost.crt');
const opensslConfig = join(directory, 'openssl.cnf');
await writeFile(opensslConfig, '[req]\ndistinguished_name=dn\nx509_extensions=v3\nprompt=no\n[dn]\nCN=localhost\n[v3]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n');
execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-config', opensslConfig], { stdio: 'ignore' });
const messages = [];
let rejectMail = false;
const smtp = tls.createServer({ key: await readFile(key), cert: await readFile(cert) }, socket => {
    socket.setEncoding('utf8');
    socket.on('error', () => {});
    socket.write('220 localhost ESMTP test\r\n');
    let buffer = '', auth = '', data = false, body = [], envelope = {};
    socket.on('data', chunk => {
        buffer += chunk;
        while (buffer.includes('\r\n')) {
            const end = buffer.indexOf('\r\n');
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (data) {
                if (line === '.') {
                    data = false;
                    if (!rejectMail) messages.push({ ...envelope, body: body.join('\r\n') });
                    socket.write(rejectMail ? '451 temporary local test failure\r\n' : '250 queued locally\r\n');
                } else body.push(line.replace(/^\.\./, '.'));
            } else if (auth === 'user') {
                assert.equal(Buffer.from(line, 'base64').toString(), 'uto@bex.co.jp');
                auth = 'pass'; socket.write('334 UGFzc3dvcmQ6\r\n');
            } else if (auth === 'pass') {
                assert.equal(Buffer.from(line, 'base64').toString(), 'local-dummy-only');
                auth = ''; socket.write('235 authenticated\r\n');
            } else if (/^EHLO/.test(line)) socket.write('250-localhost\r\n250 AUTH LOGIN\r\n');
            else if (/^AUTH LOGIN/.test(line)) { auth = 'user'; socket.write('334 VXNlcm5hbWU6\r\n'); }
            else if (/^MAIL FROM:/.test(line)) { envelope.from = line; socket.write('250 OK\r\n'); }
            else if (/^RCPT TO:/.test(line)) { envelope.to = line; socket.write('250 OK\r\n'); }
            else if (line === 'DATA') { data = true; body = []; socket.write('354 enter data\r\n'); }
            else if (line === 'QUIT') { socket.end('221 bye\r\n'); }
            else socket.write('250 OK\r\n');
        }
    });
});
smtp.on('tlsClientError', () => {});
await new Promise(resolveListen => smtp.listen(0, '127.0.0.1', resolveListen));
const smtpPort = smtp.address().port;
const reservation = net.createServer();
await new Promise(resolveListen => reservation.listen(0, '127.0.0.1', resolveListen));
const httpPort = reservation.address().port;
await new Promise(resolveClose => reservation.close(resolveClose));
const base = `http://127.0.0.1:${httpPort}`;
const configPath = join(directory, 'contact-config.php');
const phpValue = value => `'${String(value).replaceAll('\\', '/').replaceAll("'", "\\'")}'`;
async function configure(overrides = {}) {
    const config = {
        smtp_host: 'localhost', smtp_port: smtpPort, smtp_username: 'uto@bex.co.jp',
        smtp_password: 'local-dummy-only', smtp_ca_file: cert,
        state_dir: join(directory, 'state'), allowed_origins: [base], require_https: false,
        cooldown_seconds: 0, hourly_limit: 50, ...overrides,
    };
    const entries = Object.entries(config).map(([name, value]) => {
        const literal = Array.isArray(value) ? `[${value.map(phpValue).join(',')}]` : typeof value === 'boolean' ? String(value) : typeof value === 'number' ? String(value) : phpValue(value);
        return `${phpValue(name)} => ${literal}`;
    });
    await writeFile(configPath, `<?php return [${entries.join(',')}];\n`);
}
await configure();
await mkdir(join(directory, 'sessions'));
const phpFlags = ['-n', '-d', `extension_dir=${join(dirname(php), 'ext')}`, '-d', 'extension=openssl', '-d', 'display_errors=0', '-d', 'log_errors=1', '-d', `session.save_path=${join(directory, 'sessions')}`];
const server = spawn(php, [...phpFlags, '-S', `127.0.0.1:${httpPort}`, '-t', root], { env: { ...process.env, BEX_CONTACT_CONFIG: configPath }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
server.stderr.on('data', chunk => { logs += chunk; });
let passed = 0;
function check(condition, message) { assert.ok(condition, message); passed++; }
const valid = { company: 'テスト株式会社', name: '山田 太郎', email: 'visitor@example.org', tel: '03-0000-0000', message: '映像音響設備について\n日本語のテストです。', website: '' };
async function session() {
    const response = await fetch(`${base}/contact.php?action=token`, { headers: { Accept: 'application/json' } });
    const body = await response.json();
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie').split(';')[0], token: body.token };
}
async function post(client, fields = {}, headers = {}, html = false) {
    const response = await fetch(`${base}/contact.php`, {
        method: 'POST', redirect: 'manual',
        headers: { Cookie: client.cookie, Accept: html ? 'text/html' : 'application/json', Origin: base, ...headers },
        body: new URLSearchParams({ ...valid, _token: client.token, ...fields }),
    });
    return { response, body: html ? await response.text() : await response.json() };
}
try {
    for (let attempt = 0; attempt < 80; attempt++) {
        try { await fetch(`${base}/contact.html`); break; } catch { await new Promise(resolveWait => setTimeout(resolveWait, 50)); }
    }
    const client = await session();
    check(client.token.length === 64, 'Session token');
    const tokenResponse = await fetch(`${base}/contact.php?action=token`, { headers: { Cookie: client.cookie } });
    check(tokenResponse.headers.get('cache-control').includes('no-store'), 'No token caching');
    check(tokenResponse.headers.get('x-frame-options') === 'DENY', 'Embedding denied');
    check(tokenResponse.headers.get('x-content-type-options') === 'nosniff', 'MIME sniffing disabled');
    check(tokenResponse.headers.get('referrer-policy') === 'strict-origin-when-cross-origin', 'Referrer policy');
    check(tokenResponse.headers.get('content-security-policy').includes("script-src 'self';"), 'Restrictive script CSP');
    check(!tokenResponse.headers.has('x-powered-by'), 'PHP version not disclosed');
    check(tokenResponse.headers.get('permissions-policy').includes('camera=()'), 'Unused device permissions disabled');
    check(tokenResponse.headers.get('x-robots-tag') === 'noindex, follow', 'Token endpoint is not indexed');
    const cookieResponse = await fetch(`${base}/contact.php?action=token`);
    check(/HttpOnly/i.test(cookieResponse.headers.get('set-cookie')) && /SameSite=Lax/i.test(cookieResponse.headers.get('set-cookie')), 'Cookie attributes');
    check((await post(client, { _token: '' })).response.status === 403, 'Missing CSRF');
    const expiredHtml = await post(client, { _token: '' }, {}, true);
    check(expiredHtml.response.status === 403 && expiredHtml.body.includes(valid.name), 'No-JS preserves input on token failure');
    check((await post(client, {}, { Origin: 'https://attacker.example' })).response.status === 403, 'Cross-origin blocked');
    check((await post(client, {}, { 'Sec-Fetch-Site': 'cross-site' })).response.status === 403, 'Cross-site Fetch Metadata blocked');
    const crossToken = await fetch(`${base}/contact.php?action=token`, { headers: { Origin: 'https://attacker.example', Accept: 'application/json' } });
    check(crossToken.status === 403 && !(await crossToken.json()).token && !crossToken.headers.has('set-cookie'), 'Cross-origin token request rejected before session');
    const unsupportedMethod = await fetch(`${base}/contact.php`, { method: 'PUT', headers: { Accept: 'application/json' } });
    check(unsupportedMethod.status === 405 && unsupportedMethod.headers.get('allow') === 'GET, POST' && !unsupportedMethod.headers.has('set-cookie'), 'Unsupported method rejected before session');
    const jsonPost = await fetch(`${base}/contact.php`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(valid) });
    check(jsonPost.status === 415 && !jsonPost.headers.has('set-cookie'), 'Unsupported JSON submission rejected');
    const upload = new FormData();
    for (const [name, value] of Object.entries({ ...valid, _token: client.token })) upload.set(name, value);
    upload.set('attachment', new Blob(['dummy file, not executed'], { type: 'text/plain' }), 'test.txt');
    const uploadResponse = await fetch(`${base}/contact.php`, { method: 'POST', headers: { Cookie: client.cookie, Accept: 'application/json' }, body: upload });
    check(uploadResponse.status === 422, 'Unexpected file upload rejected');
    for (const fields of [{ name: '' }, { message: '' }, { email: 'bad' }, { email: 'a@example.org\r\nBcc:other@example.org' }, { name: 'あ'.repeat(101) }, { message: 'あ'.repeat(5001) }, { website: 'spam' }, { email: undefined, 'email[]': 'visitor@example.org' }]) {
        check((await post(client, fields)).response.status === 422, 'Invalid input rejected');
    }
    check((await post(client, { message: 'a'.repeat(66000) })).response.status === 413, 'Oversized body');
    const fallback = await fetch(`${base}/contact.php`, { headers: { Cookie: client.cookie } }).then(response => response.text());
    check(fallback.includes(`value="${client.token}"`) && !fallback.includes('<noscript>'), 'No-JS form token');
    check(!fallback.includes('local-dummy-only'), 'Password never exposed');
    check(messages.length === 0, 'Rejected requests never reach SMTP');
    const invalidHtml = await post(client, { company: '"><script>alert(1)</script>', name: '' }, {}, true);
    check(invalidHtml.response.status === 422 && invalidHtml.body.includes('&lt;script&gt;') && !invalidHtml.body.includes('value=""><script>'), 'HTML fallback escapes preserved fields');
    const delivered = await post(client, { to_email: 'attacker@example.org', from_email: 'attacker@example.org' });
    check(delivered.response.status === 200 && delivered.body.ok, 'SMTP accepted');
    check(messages.length === 1, 'One local delivery');
    check(messages[0].from === 'MAIL FROM:<uto@bex.co.jp>' && messages[0].to === 'RCPT TO:<soumu@bex.co.jp>', 'Fixed envelope addresses');
    check(/Reply-To:.*<visitor@example.org>/.test(messages[0].body), 'Visitor Reply-To');
    const mimeBody = messages[0].body.split('\r\n\r\n').slice(1).join('\r\n\r\n');
    check(Buffer.from(mimeBody.replaceAll('\r\n', ''), 'base64').toString().includes(valid.message), 'Japanese mail body');
    check((await post(client)).response.status === 200 && messages.length === 1, 'Retry is not delivered twice');
    client.token = delivered.body.token;
    rejectMail = true;
    const failure = await post(client);
    check(failure.response.status === 503 && !failure.body.ok && messages.length === 1, 'SMTP failure is not success');
    rejectMail = false;
    await configure({ smtp_ca_file: join(directory, 'missing-ca.crt') });
    check((await post(client)).response.status === 503 && messages.length === 1, 'Untrusted TLS certificate blocks delivery');
    await configure({ hourly_limit: 1 });
    check((await post(await session())).response.status === 429, 'Rate limit across new sessions');
    check((await post(await session(), {}, { 'X-Forwarded-For': '198.51.100.123', 'X-Real-IP': '198.51.100.124' })).response.status === 429, 'Forged proxy headers cannot bypass rate limit');
    await configure({ state_dir: join(root, 'images') });
    const publicStateResult = await post(await session());
    check(publicStateResult.response.status === 503, `Public state directory is rejected (HTTP ${publicStateResult.response.status})`);
    await configure({ smtp_password: '' });
    check((await fetch(`${base}/contact.php?action=token`)).status === 503, 'Missing secret fails closed');
    await configure({ require_https: true });
    check((await fetch(`${base}/contact.php?action=token`)).status === 503, 'Production requires HTTPS');
    await configure({ state_dir: join(directory, 'state-cooldown'), cooldown_seconds: 30 });
    check((await post(await session())).response.status === 200, 'First request before cooldown');
    check((await post(await session())).response.status === 429, 'Cooldown enforced across sessions');
    const beforePrg = messages.length;
    await configure({ state_dir: join(directory, 'state-prg') });
    const noJs = await session();
    const redirect = await post(noJs, {}, {}, true);
    check(redirect.response.status === 303, 'No-JS POST redirects');
    const successHtml = await fetch(`${base}/contact.php?sent=1`, { headers: { Cookie: noJs.cookie } }).then(response => response.text());
    check(successHtml.includes('お問い合わせを送信しました。'), 'No-JS success flash');
    const refreshed = await fetch(`${base}/contact.php?sent=1`, { headers: { Cookie: noJs.cookie } }).then(response => response.text());
    check(!refreshed.includes('お問い合わせを送信しました。') && messages.length === beforePrg + 1, 'Refresh does not resend or fabricate success');

    if (process.env.BEX_PLAYWRIGHT_MODULE) {
        const { chromium } = await import(process.env.BEX_PLAYWRIGHT_MODULE);
        const browser = await chromium.launch({ executablePath: process.env.BEX_CHROME, headless: true });
        try {
            const page = await browser.newPage();
            const errors = [];
            await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
            await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(`${base}/contact.html`);
            await page.locator('[data-contact-submit]').waitFor({ state: 'visible' });
            await page.waitForFunction(() => !document.querySelector('[data-contact-submit]').disabled);
            await page.locator('#name').fill(valid.name);
            await page.locator('#email').fill(valid.email);
            await page.locator('#message').fill(valid.message);
            await page.locator('[data-contact-submit]').click();
            await page.locator('#contact-status[data-state="success"]').waitFor();
            check(await page.locator('#message').inputValue() === '', 'Browser clears only after success');
            rejectMail = true;
            await page.locator('#name').fill(valid.name);
            await page.locator('#email').fill(valid.email);
            await page.locator('#message').fill(valid.message);
            await page.locator('[data-contact-submit]').click();
            await page.locator('#contact-status[data-state="error"]').waitFor();
            check(await page.locator('#message').inputValue() === valid.message, 'Browser retains input on error');
            for (const width of [1440, 390]) {
                await page.setViewportSize({ width, height: 1000 });
                check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}`);
                await page.locator('form').scrollIntoViewIfNeeded();
                await page.screenshot({ path: join(directory, `contact-${width}.png`) });
            }
            check(errors.length === 0, 'No browser JavaScript errors');
            await page.goto(`${base}/contact.php`);
            await page.waitForFunction(() => !document.querySelector('[data-contact-submit]').disabled);
            check(await page.locator('[data-contact-form]').isVisible(), 'Server-rendered form works with enforced CSP');
            const noJsContext = await browser.newContext({ javaScriptEnabled: false });
            const noJsPage = await noJsContext.newPage();
            await noJsPage.goto(`${base}/contact.html`);
            check(await noJsPage.locator('a[href="contact.php"]').isVisible(), 'No-JS fallback link visible');
            await noJsPage.locator('a[href="contact.php"]').click();
            check(await noJsPage.locator('[data-contact-submit]').isEnabled(), 'No-JS server form enabled');
            await noJsContext.close();
            await configure({ smtp_password: '' });
            await page.goto(`${base}/contact.html`);
            await page.locator('#contact-status[data-state="error"]').waitFor();
            check(await page.locator('[data-contact-submit]').isDisabled(), 'Unavailable service disables static form');
        } finally { await browser.close(); }
    }
    check(!logs.includes('local-dummy-only') && !logs.includes(valid.message), 'No sensitive data logged');
    console.log(`PASS ${passed} assertions. Local SMTP only. Fixtures/screenshots: ${directory}`);
} finally {
    server.kill();
    await new Promise(resolveClose => smtp.close(resolveClose));
}
