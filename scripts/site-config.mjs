// Page registry shared by generation, checks, preview and release packaging.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const pages = JSON.parse(readFileSync(resolve(root, 'data/site-pages.json'), 'utf8'));
if (!Array.isArray(pages) || !pages.length || new Set(pages.map(page => page.file)).size !== pages.length) {
    throw new Error('data/site-pages.json: ページ一覧が空か、ファイル名が重複しています。');
}
for (const page of pages) {
    if (!/^[a-z\d_]+\.html$/.test(page.file) || typeof page.title !== 'string' || !page.title || typeof page.generated !== 'boolean') {
        throw new Error('data/site-pages.json: file・title・generated を確認してください。');
    }
}
export const pageFiles = pages.map(page => page.file);
