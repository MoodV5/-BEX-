// Build an allowlisted delivery folder, never a copy of the entire repository.
import { copyFile, lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageFiles as pages } from './site-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixed = [...pages, '.htaccess', 'style.css', 'reference.css', 'contact.css', 'main.js', 'contact.js', 'contact.php', 'robots.txt', 'sitemap.xml', 'lib/.htaccess', 'lib/phpmailer/LICENSE', 'lib/phpmailer/README-BEX.md', ...['Exception', 'PHPMailer', 'SMTP'].map(name => `lib/phpmailer/src/${name}.php`)];
const fixedSet = new Set(fixed);

export async function collectPublicFiles() {
    const files = new Set(fixed);
    for (const name of files) {
        const path = join(root, name);
        // Check every component, not just the final file, to reject symlinked dirs.
        let component = root;
        for (const part of name.split('/')) {
            component = join(component, part);
            if ((await lstat(component)).isSymbolicLink()) throw new Error(`Symlink is not allowed: ${name}`);
        }
        if (!(await lstat(path)).isFile()) throw new Error(`Not a regular file: ${name}`);
        if (!['.html', '.css'].includes(extname(name))) continue;
        const source = await readFile(path, 'utf8');
        const links = [...source.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^\s)'";]+)["']?\s*\)/gi)];
        for (const match of links) {
            const url = (match[1] || match[2]).replaceAll('&amp;', '&');
            if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) continue;
            const pathname = decodeURIComponent(url.split(/[?#]/)[0]);
            const target = resolve(dirname(path), pathname || '.');
            if (target !== root && !target.startsWith(root + sep)) throw new Error(`Path outside project: ${url}`);
            const asset = relative(root, target).split(sep).join('/') || 'index.html';
            const publicAsset = /^images\/.+\.(?:avif|webp|jpe?g|png|gif|svg|ico)$/i.test(asset)
                || /^downloads\/visual-master\/(?:be|ba|bs|bl)\/[a-z\d_-]+\.(?:pdf|zip)$/i.test(asset);
            if (!fixedSet.has(asset) && !publicAsset) throw new Error(`Non-public reference: ${asset} in ${name}`);
            files.add(asset);
        }
    }
    return [...files].sort();
}

export async function preparePublicRelease(output) {
    const files = await collectPublicFiles();
    const dist = resolve(root, 'dist');
    const target = resolve(output);
    if (!target.startsWith(dist + sep)) throw new Error('Output must be a new subdirectory of dist/.');
    await mkdir(dist, { recursive: true });
    if (await realpath(dist) !== dist) throw new Error('dist/ must not be a symlink.');
    // Only allow a direct child, and refuse to overwrite or delete an old release.
    if (dirname(target) !== dist) throw new Error('Output must be directly inside dist/.');
    await mkdir(target);
    for (const file of files) {
        const destination = join(target, file);
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(join(root, file), destination);
    }
    return { directory: target, count: files.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.includes('--check')) {
        const files = await collectPublicFiles();
        console.log(`PASS public allowlist: ${files.length} files; no release folder written.`);
    } else {
        const release = await preparePublicRelease(join(root, 'dist', `public-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`));
        console.log(`Prepared ${release.count} public files: ${release.directory}`);
        console.log('Local files only. No upload. Keep SMTP configuration outside the web root.');
    }
}
