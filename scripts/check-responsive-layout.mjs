// Local browser regression checks. Does not deploy or deliver email.
// Set BEX_PLAYWRIGHT_MODULE to playwright-core (package name or file URL).
// Set BEX_CHROME to an installed Chrome executable when no bundled browser exists.
// Optional: BEX_RESPONSIVE_SCREENSHOTS points to a directory for QA screenshots.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.BEX_PLAYWRIGHT_MODULE || 'playwright-core');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(root).filter(file => file.endsWith('.html'));
const screenshots = process.env.BEX_RESPONSIVE_SCREENSHOTS;
// Test the actual policy's browser compatibility, not just unprotected HTML.
// This does NOT emulate or validate Apache routing/access-control directives.
const csp = readFileSync(join(root, '.htaccess'), 'utf8').match(/Header always set Content-Security-Policy "([^"]+)"/)[1];
if (screenshots) await mkdir(screenshots, { recursive: true });
const mime = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/contact.php') {
        response.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({
            ok: false, message: 'Local layout test: SMTP is disabled.', token: '',
        }));
        return;
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html');
    if (!path.startsWith(root + sep) || !existsSync(path) || !statSync(path).isFile() || !mime[extname(path)]) {
        response.writeHead(404).end();
        return;
    }
    response.writeHead(200, {
        'Content-Type': mime[extname(path)],
        ...(extname(path) === '.html' ? { 'Content-Security-Policy': csp, 'X-Frame-Options': 'DENY' } : {}),
    }).end(readFileSync(path));
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
let browser;
try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.BEX_CHROME || undefined });
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    const policyErrors = [];
    page.on('console', message => {
        if (/violates.*(?:Content Security Policy|directive)|Refused to.*(?:script|style|font|image)/i.test(message.text())) policyErrors.push(message.text());
    });
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
    page.on('pageerror', error => {
        if (!error.message.includes('ViewTransition')) errors.push(error.message);
    });
    const base = `http://127.0.0.1:${server.address().port}/`;
    const viewports = [320, 360, 375, 390, 414, 600, 601, 768, 860, 861, 1024, 1440, 1920]
        .map(width => ({ width, height: 1000 }));
    viewports.push({ width: 568, height: 320 }, { width: 844, height: 390 });
    let checks = 0;
    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        for (const file of files) {
            await page.goto(base + file, { waitUntil: 'load' });
            const issues = await page.evaluate(() => {
                const visible = node => node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
                const outside = [...document.querySelectorAll([
                    'header .logo', 'header .header-company-name', 'header .header-contact-btn', 'header .menu-toggle',
                    'main p', 'main h2', 'main h4', 'main li', 'main input', 'main textarea',
                    'main .service-grid', 'main .service-grid > *', 'main .grid-3 > *',
                ].join(','))].filter(visible).filter(node => {
                    const rect = node.getBoundingClientRect();
                    return rect.left < -1 || rect.right > innerWidth + 1;
                }).map(node => ({ element: node.tagName, class: node.className, right: node.getBoundingClientRect().right }));
                const grids = [...document.querySelectorAll('main .service-grid, main .grid-3, main [style*="grid-template-columns"]')];
                const oversizedCards = grids.flatMap(grid => [...grid.children].filter(node => {
                    const parent = grid.getBoundingClientRect(), child = node.getBoundingClientRect();
                    return visible(node) && (child.left < parent.left - 1 || child.right > parent.right + 1);
                }).map(node => ({ parent: grid.className, child: node.className })));
                const logo = document.querySelector('.logo').getBoundingClientRect();
                const control = document.querySelector(innerWidth <= 860 ? '.menu-toggle' : '.main-nav');
                const headerOverlap = control && logo.right > control.getBoundingClientRect().left + 1;
                return { outside, oversizedCards, headerOverlap: Boolean(headerOverlap) };
            });
            assert.deepEqual(issues, { outside: [], oversizedCards: [], headerOverlap: false }, `${file} at ${viewport.width}x${viewport.height}`);
            checks++;
            if (screenshots && [320, 375, 1440].includes(viewport.width) && ['consumer.html', 'jyohotsushin.html', 'order.html', 'system.html', 'kyouiku.html', 'bousai.html'].includes(file)) {
                await page.locator('main .service-grid, main .grid-3, main [style*="grid-template-columns"]').first().scrollIntoViewIfNeeded();
                await page.screenshot({ path: join(screenshots, `${file}-${viewport.width}.png`) });
            }
        }
    }
    assert.deepEqual(policyErrors, [], 'Normal pages must not violate CSP');
    await page.goto(base);
    const injectionBlocked = await page.evaluate(async () => {
        window.bexInjected = false;
        const script = document.createElement('script');
        script.textContent = 'window.bexInjected = true';
        document.body.append(script);
        await new Promise(resolveWait => setTimeout(resolveWait, 30));
        return window.bexInjected === false;
    });
    assert.ok(injectionBlocked, 'CSP blocks injected inline scripts');
    // Intercept even a regressed request: this negative test never leaves localhost.
    await page.route('https://csp-test.invalid/**', route => route.abort());
    const exfiltrationBlocked = await page.evaluate(async () => {
        const violation = new Promise(resolveViolation => {
            document.addEventListener('securitypolicyviolation', event => {
                if (event.effectiveDirective === 'form-action') resolveViolation(true);
            });
        });
        const form = document.createElement('form');
        form.action = 'https://csp-test.invalid/';
        form.method = 'post';
        document.body.append(form);
        form.submit();
        return Promise.race([violation, new Promise(resolveWait => setTimeout(() => resolveWait(false), 500))]);
    });
    assert.ok(exfiltrationBlocked, 'CSP blocks cross-origin form submission');
    for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        await page.goto(base + 'system.html');
        await page.locator('.menu-toggle').click();
        await page.locator('.main-nav .nav-link[href="concept.html"]').click();
        assert(await page.locator('.main-nav').evaluate(node => node.getBoundingClientRect().bottom <= innerHeight + 1), 'Landscape menu stays within viewport');
        await page.locator('.main-nav .header-contact-btn').scrollIntoViewIfNeeded();
        await page.locator('.main-nav .header-contact-btn').click();
        await page.waitForURL('**/contact.html');
        assert(await page.locator('[data-contact-submit]').isDisabled(), 'Layout test cannot send email');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + 'system.html');
    await page.locator('.feature-card').first().hover();
    await page.waitForTimeout(350);
    assert.notEqual(await page.locator('.feature-card').first().evaluate(node => getComputedStyle(node).transform), 'none', 'Card hover is preserved');
    assert.equal(await page.locator('.feature-card').first().evaluate(node => getComputedStyle(node).borderRadius), '4px');
    assert.deepEqual(errors, [], 'No application JavaScript errors');
    console.log(`PASS ${files.length} pages x ${viewports.length} viewports = ${checks} layout checks under CSP; inline-script injection and external form submission blocked; landscape menus, card hover and 4px corners verified. No email sent.`);
} finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolveClose => server.close(resolveClose));
}
