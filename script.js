const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'public');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

files.forEach(f => {
  let c = fs.readFileSync(path.join(dir, f), 'utf8');
  c = c.replace(/window\.selectMonth = \(item\) => \{[\s\S]*?\};\s*/g, '');
  
  c = c.replace(/<label class="month-grid-item"[^>]*onclick="window\.selectMonth\?\.\(this\)"[^>]*>\s*([A-Za-z]+)\s*<input[^>]*type="checkbox"[^>]*value="(\d+)"[^>]*>\s*<\/label>/g, (match, month, val) => {
      return '<label class="month-grid-item">' + month + ' <input type="checkbox" value="' + val + '" onchange="this.parentElement.classList.toggle(\'selected\', this.checked)"></label>';
  });
  
  fs.writeFileSync(path.join(dir, f), c);
  console.log('Fixed ' + f);
});
