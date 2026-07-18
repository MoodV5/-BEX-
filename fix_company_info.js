const fs = require('fs');
const glob = require('fs').readdirSync;

function main() {
    const files = glob(__dirname).filter(f => f.endsWith('.html'));

    files.forEach(file => {
        let content = fs.readFileSync(file, 'utf8');

        // Update Address
        content = content.replace(/<p>〒101-0044 東京都千代田区鍛冶町1-9-16<\/p>/g, '<p>〒170-0003<br>東京都豊島区駒込2-3-1<br>六興ビル 5F</p>');
        
        // Update TEL
        content = content.replace(/<p>TEL: 03-3252-0900<\/p>/g, '<p>TEL 03-5980-0822</p>');
        
        // Replace Email with FAX in footer
        content = content.replace(/<p>Email: info@bex\.co\.jp<\/p>/g, '<p>FAX 03-5980-0877</p>');
        
        // Update Copyright
        content = content.replace(/&copy;\s*(?:\d{4}-\d{4}\s*)?BEX Co\.,\s*Ltd\.\s*All\s+Rights\s+reserved\./gi, 'Copyright 2012-2019 BEX All Rights reserved');

        // Update contact.html specifics
        content = content.replace(/<p><strong>TEL:<\/strong> 03-3252-0900<\/p>/g, '<p><strong>TEL:</strong> 03-5980-0822</p>');
        content = content.replace(/<p><strong>FAX:<\/strong> 03-3252-0910<\/p>/g, '<p><strong>FAX:</strong> 03-5980-0877</p>');
        content = content.replace(/placeholder="例: 03-3252-0900"/g, 'placeholder="例: 03-5980-0822"');

        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated company info in ${file}`);
    });
}

main();
