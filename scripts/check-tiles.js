// scripts/check-tiles.js
const fs = require('fs');
const path = require('path');

const tilesPath = path.join(__dirname, '..', 'public', 'tiles');

console.log('🔍 Checking offline tiles...');
console.log(`📁 Path: ${tilesPath}`);

if (!fs.existsSync(tilesPath)) {
  console.log('❌ No tiles found. Run: npm run download-tiles');
  process.exit(1);
}

let total = 0;
let totalSize = 0;

function countTiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      countTiles(fullPath);
    } else if (file.endsWith('.png')) {
      total++;
      totalSize += stat.size;
    }
  }
}

countTiles(tilesPath);

const zoomDirs = fs.readdirSync(tilesPath).filter(d => /^\d+$/.test(d));
zoomDirs.sort((a, b) => parseInt(a) - parseInt(b));

const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
const sizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);

console.log(`✅ Found ${total} offline tiles`);
console.log(`📊 Zoom levels: ${zoomDirs.join(', ')}`);
console.log(`💾 Size: ${totalSize > 1024 * 1024 * 1024 ? sizeGB + ' GB' : sizeMB + ' MB'}`);

// Check Leaflet local files
const leafletJs = path.join(__dirname, '..', 'public', 'js', 'leaflet.js');
const leafletCss = path.join(__dirname, '..', 'public', 'css', 'leaflet.css');

console.log(`📦 Leaflet JS: ${fs.existsSync(leafletJs) ? '✅' : '❌'} (${leafletJs})`);
console.log(`📦 Leaflet CSS: ${fs.existsSync(leafletCss) ? '✅' : '❌'} (${leafletCss})`);

if (!fs.existsSync(leafletJs) || !fs.existsSync(leafletCss)) {
  console.log('\n⚠️ Leaflet files not found locally. Run the PowerShell commands from the previous guide.');
}