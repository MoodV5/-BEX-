const fs = require('fs');
const glob = require('fs').readdirSync;
const path = require('path');

const BASE_URL = 'https://MoodV5.github.io/-BEX-/';

// Function to generate the sitemap and robots.txt
function generateSitemapAndRobots(files) {
    let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    files.forEach(file => {
        const fileUrl = `${BASE_URL}${file}`;
        // Prioritize index.html
        const priority = file === 'index.html' ? '1.0' : '0.8';
        sitemapXml += `  <url>\n    <loc>${fileUrl}</loc>\n    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
    });
    
    sitemapXml += `</urlset>`;
    fs.writeFileSync('sitemap.xml', sitemapXml, 'utf8');
    console.log('Generated sitemap.xml');

    const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}sitemap.xml`;
    fs.writeFileSync('robots.txt', robotsTxt, 'utf8');
    console.log('Generated robots.txt');
}

// Function to apply SEO tags to HTML files
function applySeoTags(files) {
    files.forEach(file => {
        let content = fs.readFileSync(file, 'utf8');
        let updated = false;

        // Skip if already applied
        if (content.includes('property="og:title"')) {
            console.log(`Skipping ${file} (SEO tags already applied)`);
            return;
        }

        // 1. Extract Title and Description
        const titleMatch = content.match(/<title>(.*?)<\/title>/i);
        const descMatch = content.match(/<meta\s+name="Description"\s+content="(.*?)"/i);
        
        const title = titleMatch ? titleMatch[1] : '株式会社 ベックス';
        const description = descMatch ? descMatch[1] : '株式会社ベックスはAV＆ITシステムでさまざまな施設をトータルにサポートします。';
        const fileUrl = `${BASE_URL}${file}`;
        const imageUrl = `${BASE_URL}images/hero_index.jpg`; // Default social share image
        
        // 2. Prepare OGP & Canonical tags
        const seoTags = `
    <!-- SEO & OGP Tags -->
    <link rel="canonical" href="${fileUrl}">
    <meta property="og:site_name" content="株式会社 ベックス">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:type" content="${file === 'index.html' ? 'website' : 'article'}">
    <meta property="og:url" content="${fileUrl}">
    <meta property="og:image" content="${imageUrl}">
    <meta name="twitter:card" content="summary_large_image">
`;

        // Inject tags before </head>
        content = content.replace(/<\/head>/i, `${seoTags}</head>`);
        updated = true;

        // 3. Apply lazy loading to images (skip header/logo images)
        // Find <img> tags that don't have loading="lazy"
        // Also ensure we don't accidentally lazy load the top logo.
        content = content.replace(/<img([^>]*)>/g, (match, p1) => {
            // If it's a logo or already has lazy loading, skip
            if (p1.includes('bex-rogo.jpg') || p1.includes('loading=')) {
                return match;
            }
            return `<img${p1} loading="lazy">`;
        });

        fs.writeFileSync(file, content, 'utf8');
        console.log(`Applied SEO optimizations to ${file}`);
    });
}

function main() {
    const files = glob(__dirname).filter(f => f.endsWith('.html'));
    if (files.length === 0) {
        console.error('No HTML files found.');
        return;
    }
    
    generateSitemapAndRobots(files);
    applySeoTags(files);
    console.log('All technical SEO optimizations complete!');
}

main();
