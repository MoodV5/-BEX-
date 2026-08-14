const fs = require('fs');
const path = require('path');

const dir = __dirname;
const scriptTag = '<script src="main.js"></script>\n</body>';

fs.readdirSync(dir).forEach(file => {
    if (file.endsWith('.html')) {
        let content = fs.readFileSync(path.join(dir, file), 'utf8');
        
        // If main.js is not linked, add it before </body>
        if (!content.includes('src="main.js"')) {
            content = content.replace(/<\/body>/, scriptTag);
            fs.writeFileSync(path.join(dir, file), content, 'utf8');
            console.log(`Linked main.js to ${file}`);
        }
    }
});
console.log("All HTML files have been successfully linked to main.js!");
