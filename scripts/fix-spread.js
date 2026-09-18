const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const file = path.join(ROOT, 'routes', 'nurse-order.js');

if (!fs.existsSync(file)) {
  console.error('❌ File not found:', file);
  process.exit(1);
}

let content = fs.readFileSync(file, 'utf8');

// Try the exact block first
const oldBlock = `const patientsWithPhone = patients.map(p => ({
      ...p,
      phone: profileMap[p._id.toString()] || 'N/A'
    }));`;

const newBlock = `const patientsWithPhone = patients.map(p => ({
      _id: p._id,
      name: p.name,        // getter → plaintext
      email: p.email,      // getter → plaintext
      phone: profileMap[p._id.toString()] || 'N/A'
    }));`;

if (content.includes(oldBlock)) {
  content = content.replace(oldBlock, newBlock);
  fs.writeFileSync(file, content, 'utf8');
  console.log('✅ Fixed patientsWithPhone spread bug');
} else {
  console.log('⚠️  Exact pattern not found. Trying regex fallback...');

  // Fallback: match any `...p,` inside patientsWithPhone map
  const regex = /const patientsWithPhone = patients\.map\(p => \(\{\s*\.\.\.p,/;
  if (regex.test(content)) {
    content = content.replace(
      regex,
      `const patientsWithPhone = patients.map(p => ({\n      _id: p._id,\n      name: p.name,\n      email: p.email,`
    );
    fs.writeFileSync(file, content, 'utf8');
    console.log('✅ Fixed via regex fallback');
  } else {
    console.log('❌ Could not find the pattern. Showing current block:');
    const idx = content.indexOf('patientsWithPhone');
    if (idx !== -1) {
      console.log(content.substring(idx - 30, idx + 280));
    } else {
      console.log('❌ "patientsWithPhone" not found in file at all.');
    }
  }
}
