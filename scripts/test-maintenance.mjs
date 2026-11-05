// Basic maintenance tests need only Node; no browser, PHP, credentials or packages.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { root, pages } from './site-config.mjs';
import { collectPublicFiles } from './prepare-public-release.mjs';
import { createPreviewServer } from './preview.mjs';

test('一致確認は原本を書き換えない', async () => {
    const paths = [...pages.map(page => page.file), 'sitemap.xml'];
    const digest = async () => Promise.all(paths.map(async file => createHash('sha256').update(await readFile(join(root, file))).digest('hex')));
    const before = await digest();
    execFileSync(process.execPath, ['scripts/build-reference-pages.mjs', '--check'], { cwd: root });
    assert.deepEqual(await digest(), before);
});

test('共通部品と自動更新番号が全ページで一致する', async () => {
    const footerParts = [];
    for (const page of pages) {
        const html = await readFile(join(root, page.file), 'utf8');
        assert.equal([...html.matchAll(/class="header-contact-btn contact-button"/g)].length, 1);
        assert(!html.includes('{{HOME_CURRENT}}') && !html.includes('{{BUSINESS_HREF}}'));
        assert.equal(html.includes('class="nav-link" aria-current="page">ホーム'), page.file === 'index.html');
        footerParts.push(html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0]);
        const expected = createHash('sha256').update((await readFile(join(root, 'style.css'), 'utf8')).replaceAll('\r\n', '\n')).digest('hex').slice(0, 12);
        assert(html.includes(`style.css?v=${expected}`));
    }
    assert.equal(new Set(footerParts).size, 1);
});

test('公開対象に作業用ファイル・認証情報を含めない', async () => {
    const files = await collectPublicFiles();
    for (const file of files) assert(!/^(?:docs|partials|data|deployment|scripts|bex-private|\.git)\//.test(file));
    assert(!files.includes('README.md') && !files.includes('package.json'));
    assert(files.includes('contact.php') && files.includes('lib/phpmailer/src/SMTP.php'));
    assert.equal(new Set(files).size, files.length);
});

test('プレビューはHTMLを配信し、PHP原本・秘密情報・送信を公開しない', async () => {
    const server = await createPreviewServer();
    await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const response = await fetch(base + '/');
        assert.equal(response.status, 200);
        assert(response.headers.get('content-security-policy').includes("script-src 'self'"));
        assert((await response.text()).includes('株式会社ベックス'));
        for (const path of ['/README.md', '/docs/MAINTENANCE.md', '/partials/header.html', '/data/site-pages.json', '/.git/HEAD', '/.htaccess', '/lib/phpmailer/src/SMTP.php', '/deployment/contact-config.example.php', '/%E0%A4%A']) {
            const result = await fetch(base + path);
            assert([400, 404].includes(result.status), path);
        }
        const form = await fetch(base + '/contact.php?action=token');
        assert.equal(form.status, 503);
        assert.equal((await form.json()).token, '');
        assert.equal((await fetch(base + '/contact.php', { method: 'POST', body: 'test' })).status, 405);
        const css = await fetch(base + '/style.css?v=test');
        assert.equal(css.status, 200);
        const head = await fetch(base + '/style.css', { method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal(await head.text(), '');
    } finally {
        server.closeAllConnections();
        await new Promise(resolveClose => server.close(resolveClose));
    }
});
