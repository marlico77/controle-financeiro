const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
    const filePath = path.join(publicDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove the window.selectMonth definition from the <script> block if present
    content = content.replace(/window\.selectMonth = \(item\) => \{[\s\S]*?\};\s*/g, '');
    
    // Fix the labels and inputs
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    for (let i = 0; i < months.length; i++) {
        const val = i + 1;
        // Regex to match the label and input flexibly
        const regex = new RegExp(<label class="month-grid-item"[\\s\\n]*onclick="window\\.selectMonth\\?\\.\\(this\\)"[\\s\\n]*> <input[\\s\\n]*type="checkbox" value=""></label>, 'g');
        const replacement = <label class="month-grid-item"> <input type="checkbox" value="" onchange="this.parentElement.classList.toggle('selected', this.checked)"></label>;
        content = content.replace(regex, replacement);
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed ' + file);
});
