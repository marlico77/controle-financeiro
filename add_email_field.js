const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

const emailField = `            <div class="input-group">
                <label for="p-email">E-mail (Opcional)</label>
                <input type="email" id="p-email" placeholder="Para recuperação de senha e avisos">
            </div>`;

for (const file of files) {
    const filePath = path.join(publicDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Check if it has p-phone but NOT p-email
    if (content.includes('id="p-phone"') && !content.includes('id="p-email"')) {
        // Use a regex that matches the div containing p-phone
        const regex = /(<div class="input-group">\s*<label for="p-phone">.*?<\/label>\s*<input[^>]+id="p-phone"[^>]*>\s*<\/div>)/i;
        if (regex.test(content)) {
            content = content.replace(regex, `$1\n${emailField}`);
            fs.writeFileSync(filePath, content, 'utf-8');
            console.log(`Successfully updated ${file}`);
        } else {
            console.log(`Failed to match regex in ${file}`);
        }
    }
}
