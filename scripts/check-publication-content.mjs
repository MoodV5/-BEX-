// Regression checks for the publication-copy review. This is not a specification audit.
// Run: node scripts/check-publication-content.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(root).filter(file => file.endsWith('.html'));
const obsoleteClaims = [
    /地震発生の数秒前/, /最新スマートテレビ/, /番組と一緒にSNS/,
    /テレビ電話が楽しめる/, /画像付きメール/, /最大[６6]分割/,
    /1日分のアイテム/, /手回し・乾電池対応/, /誰でも直感的/,
    /SDからHDまで/, /カタログに掲載している/, /多くのお客様に実際の操作/,
    /SRP-X500P|PCS-XG80|SNC-EP580|BDP-S470/,
];
let links = 0;
let schemas = 0;
for (const file of files) {
    const html = readFileSync(join(root, file), 'utf8');
    assert(!html.includes('\uFFFD'), `${file}: invalid UTF-8`);
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1, `${file}: one main heading`);
    assert(/<meta name="description" content="[^"]+">/.test(html), `${file}: description`);
    assert(/<link rel="canonical" href="https:\/\/www\.bex\.co\.jp\//.test(html), `${file}: canonical`);
    for (const pattern of obsoleteClaims) assert(!pattern.test(html), `${file}: obsolete claim ${pattern}`);
    for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        JSON.parse(json);
        schemas++;
    }
    for (const [, href] of html.matchAll(/\bhref="([^"]+)"/g)) {
        const url = new URL(href, `https://www.bex.co.jp/${file}`);
        if (url.origin !== 'https://www.bex.co.jp') continue;
        const path = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
        assert(existsSync(join(root, path)), `${file}: missing target ${path}`);
        links++;
    }
}

const read = file => readFileSync(join(root, file), 'utf8');
const conditions = {
    'ippan.html': ['強い揺れの到達に間に合わない場合', '気象庁', '接続機器、通信環境の確認'],
    'consumer.html': ['機種によって異なります', 'サービスの契約が必要な場合'],
    'bousai.html': ['取扱分野の一例', '具体的な商品・仕様・構成'],
    'order.html': ['仕様や接続条件を確認したうえで'],
    'kyouiku.html': ['教員用PC1台と専用の学習者用端末', '対象ソフトやライセンス', '通信環境によって異なります'],
    'jyohotsushin.html': ['機種や構成によって異なります', '採用する機器・ソフトや利用条件', '提供元の利用条件'],
    'system.html': ['対象機器・実施場所・日程', 'すべての製品で実施できるものではありません'],
    'vm1.html': ['製造・販売を行っています', '最新の仕様と取扱状況'],
    'contact.html': ['平日 9:00～18:00（土日祝日を除く）', 'mailto:soumu@bex.co.jp'],
};
let conditionsChecked = 0;
for (const [file, phrases] of Object.entries(conditions)) for (const phrase of phrases) {
    assert(read(file).includes(phrase), `${file}: missing condition ${phrase}`);
    conditionsChecked++;
}
const sitemap = read('sitemap.xml');
for (const file of ['ippan', 'consumer', 'bousai', 'order', 'eizoonkyo', 'kyouiku', 'jyohotsushin', 'system', 'vm1']) {
    const entry = sitemap.split(`<loc>https://www.bex.co.jp/${file}.html</loc>`)[1]?.split('</url>')[0];
    const lastModified = entry?.match(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/)?.[1];
    assert(lastModified && lastModified >= '2026-10-20', `${file}: review date must not regress`);
}
console.log(`PASS ${files.length} pages, ${links} local references, ${schemas} JSON-LD blocks, ${conditionsChecked} publication conditions. No external requests or email delivery.`);
