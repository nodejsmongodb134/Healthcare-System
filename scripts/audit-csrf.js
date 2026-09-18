const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ejs')) out.push(full);
  }
  return out;
}

const viewsDir = path.join(ROOT, 'views');
const files = walk(viewsDir);

console.log('Scanning EJS views for CSRF issues...\n');
console.log('Found ' + files.length + ' EJS files\n');

let totalStatic = 0, totalDynamic = 0, missingStatic = 0, missingDynamic = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const c = fs.readFileSync(file, 'utf8');
  const issues = [];

  // Static POST forms
  const staticFormRegex = /<form\b[^>]*method\s*=\s*["']POST["'][^>]*>([\s\S]*?)<\/form>/gi;
  let match;
  while ((match = staticFormRegex.exec(c)) !== null) {
    totalStatic++;
    const body = match[1];
    const fullTag = match[0];
    if (!/name\s*=\s*["']_csrf["']/i.test(body)) {
      missingStatic++;
      const lineNumber = c.substring(0, match.index).split('\n').length;
      const actionMatch = fullTag.match(/action\s*=\s*["']([^"']+)["']/i);
      const action = actionMatch ? actionMatch[1] : '(no action)';
      issues.push('   Line ' + lineNumber + ': POST form -> ' + action);
    }
  }

  // JS-created forms
  const jsFormRegex = /document\.createElement\(\s*['"]form['"]\s*\)([\s\S]{0,800}?)\.submit\(\)/gi;
  while ((match = jsFormRegex.exec(c)) !== null) {
    totalDynamic++;
    const block = match[0];
    if (!/_csrf/.test(block)) {
      missingDynamic++;
      const lineNumber = c.substring(0, match.index).split('\n').length;
      const actionMatch = block.match(/form\.action\s*=\s*[`'"]([^`'"]+)/);
      const action = actionMatch ? actionMatch[1] : '(unknown action)';
      issues.push('   Line ' + lineNumber + ': JS form -> ' + action);
    }
  }

  if (issues.length > 0) {
    console.log('MISSING: ' + rel);
    issues.forEach(function(i) { console.log(i); });
    console.log('');
  }
}

console.log('===========================================');
console.log('Summary');
console.log('   Static POST forms scanned : ' + totalStatic);
console.log('   JS-created forms scanned  : ' + totalDynamic);
console.log('   Missing _csrf (static)    : ' + missingStatic);
console.log('   Missing _csrf (JS)        : ' + missingDynamic);
console.log('===========================================\n');

if (missingStatic === 0 && missingDynamic === 0) {
  console.log('OK - All POST forms have CSRF tokens');
} else {
  console.log('Fix the forms listed above');
}
