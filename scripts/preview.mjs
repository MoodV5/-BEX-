// Safe static preview: serves only release-allowlisted assets. NEVER serves PHP source.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPublicFiles } from './prepare-public-release.mjs';
import { root } from './site-config.mjs';

const mime = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.zip': 'application/zip',
};

export async function createPreviewServer() {
    const allowed = new Set(await collectPublicFiles());
    const config = await readFile(resolve(root, '.htaccess'), 'utf8');
    const csp = config.match(/Header always set Content-Security-Policy "([^"]+)"/)[1];
    return createServer(async (request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('X-Robots-Tag', 'noindex, nofollow');
        if (!['GET', 'HEAD'].includes(request.method)) {
            response.writeHead(405, { Allow: 'GET, HEAD' }).end('Local preview does not accept submissions.');
            return;
        }
        let name;
        try {
            name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html';
        } catch {
            response.writeHead(400).end('Bad request');
            return;
        }
        if (name === 'contact.php') {
            response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' }).end(request.method === 'HEAD' ? undefined : JSON.stringify({
                ok: false, token: '', message: 'ローカルプレビューではメールを送信できません。送信確認はPHP対応の検証環境で行ってください。',
            }));
            return;
        }
        // Includes deliberately rejecting .htaccess, PHP, lib/, docs/ and data/.
        if (!allowed.has(name) || !mime[extname(name)] || name.startsWith('lib/')) {
            response.writeHead(404).end('Not found');
            return;
        }
        try {
            const content = await readFile(resolve(root, name));
            response.writeHead(200, {
                'Content-Type': mime[extname(name)], 'Content-Length': content.length,
                ...(extname(name) === '.html' ? { 'Content-Security-Policy': csp, 'X-Frame-Options': 'DENY' } : {}),
            }).end(request.method === 'HEAD' ? undefined : content);
        } catch {
            response.writeHead(404).end('Not found');
        }
    });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const port = Number(process.env.BEX_PREVIEW_PORT || 8000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('BEX_PREVIEW_PORT は1～65535の整数にしてください。');
    const server = await createPreviewServer();
    server.on('error', error => {
        console.error(error.code === 'EADDRINUSE' ? `ポート${port}は使用中です。前のプレビューをCtrl+Cで終了するか、BEX_PREVIEW_PORTで別の番号を指定してください。` : 'プレビューを開始できませんでした。');
        process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
        console.log(`確認用URL: http://127.0.0.1:${port}/`);
        console.log('このPCだけで確認できます。メール送信・本番公開はしません。終了: Ctrl+C');
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
        server.closeAllConnections();
        server.close();
    });
}
