// scripts/delete-tiles.js
const fs = require('fs');
const path = require('path');

const tilesPath = path.join(__dirname, '..', 'public', 'tiles');

if (!fs.existsSync(tilesPath)) {
  console.log('❌ Tiles directory not found:', tilesPath);
  process.exit(0);
}

console.log('🗑️ Deleting all tiles from:', tilesPath);

fs.readdirSync(tilesPath).forEach(zoomDir => {
  const zoomPath = path.join(tilesPath, zoomDir);
  if (fs.statSync(zoomPath).isDirectory()) {
    fs.readdirSync(zoomPath).forEach(xDir => {
      const xPath = path.join(zoomPath, xDir);
      if (fs.statSync(xPath).isDirectory()) {
        fs.readdirSync(xPath).forEach(file => {
          const filePath = path.join(xPath, file);
          fs.unlinkSync(filePath);
          console.log(`   Deleted: ${filePath}`);
        });
        fs.rmdirSync(xPath);
      }
    });
    fs.rmdirSync(zoomPath);
  }
});

fs.rmdirSync(tilesPath);
console.log('✅ All tiles deleted. You can now re-download fresh ones.');