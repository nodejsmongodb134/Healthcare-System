// scripts/download-tiles.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// ============ TILE SERVER ============
// Use a server that allows limited downloading (not the main OSM server)
const TILE_SERVER = 'https://tile.openstreetmap.de'; // or tile.openstreetmap.fr

// ============ CONFIGURE YOUR REGION ============
// Example: Windhoek, Namibia
const REGION = {
  name: 'Windhoek',
  minLat: -22.65,
  maxLat: -22.40,
  minLon: 17.00,
  maxLon: 17.20,
  minZoom: 10,
  maxZoom: 16
};

// ============ USER-AGENT (REQUIRED) ============
// Replace with your actual contact email
const USER_AGENT = 'AppointmentBooking/1.0 (contact: admin@example.com)';

// ============ DOWNLOAD DELAY (ms) ============
const DELAY = 500; // 0.5 seconds between each tile

// ============ TILE CALCULATIONS ============
function deg2num(latDeg, lonDeg, zoom) {
  const latRad = latDeg * Math.PI / 180;
  const n = Math.pow(2, zoom);
  const xtile = Math.floor((lonDeg + 180) / 360 * n);
  const ytile = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x: xtile, y: ytile };
}

function getTilesForRegion(region, zoom) {
  const { minLat, maxLat, minLon, maxLon } = region;
  const topLeft = deg2num(maxLat, minLon, zoom);
  const bottomRight = deg2num(minLat, maxLon, zoom);
  
  const tiles = [];
  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      tiles.push({ z: zoom, x, y });
    }
  }
  return tiles;
}

// ============ DOWNLOAD SINGLE TILE ============
async function downloadTile(z, x, y) {
  const dir = path.join(OUTPUT_DIR, String(z), String(x));
  const file = path.join(dir, `${y}.png`);
  
  // Skip if tile exists and is >1KB (valid tile)
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) {
    return { z, x, y, status: 'cached' };
  }

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const url = `${TILE_SERVER}/${z}/${x}/${y}.png`;
  
  return new Promise((resolve) => {
    const options = new URL(url);
    const req = https.get({
      hostname: options.hostname,
      path: options.pathname,
      headers: {
        'User-Agent': USER_AGENT
      }
    }, (response) => {
      if (response.statusCode === 404) {
        resolve({ z, x, y, status: 'not_found' });
        return;
      }
      if (response.statusCode !== 200) {
        resolve({ z, x, y, status: 'error', code: response.statusCode });
        return;
      }
      
      const fileStream = fs.createWriteStream(file);
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve({ z, x, y, status: 'downloaded' });
      });
      fileStream.on('error', () => {
        resolve({ z, x, y, status: 'error' });
      });
    }).on('error', () => {
      resolve({ z, x, y, status: 'error' });
    });
  });
}

// ============ MAIN DOWNLOAD FUNCTION ============
async function downloadTiles() {
  console.log(`📥 Starting tile download for ${REGION.name}`);
  console.log(`   Server: ${TILE_SERVER}`);
  console.log(`   Zoom range: ${REGION.minZoom} - ${REGION.maxZoom}`);
  
  let totalTiles = 0;
  const zoomTiles = {};
  
  for (let zoom = REGION.minZoom; zoom <= REGION.maxZoom; zoom++) {
    const tiles = getTilesForRegion(REGION, zoom);
    zoomTiles[zoom] = tiles;
    totalTiles += tiles.length;
    console.log(`   Zoom ${zoom}: ${tiles.length} tiles`);
  }
  
  console.log(`📊 Total tiles: ${totalTiles}`);
  console.log('');

  let downloaded = 0;
  let cached = 0;
  let notFound = 0;
  let errors = 0;
  let completed = 0;

  for (let zoom = REGION.minZoom; zoom <= REGION.maxZoom; zoom++) {
    const tiles = zoomTiles[zoom];
    console.log(`📦 Downloading zoom ${zoom} (${tiles.length} tiles)...`);
    
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const result = await downloadTile(tile.z, tile.x, tile.y);
      completed++;
      
      if (result.status === 'downloaded') downloaded++;
      else if (result.status === 'cached') cached++;
      else if (result.status === 'not_found') notFound++;
      else if (result.status === 'error') errors++;
      
      if (completed % 50 === 0 || completed === totalTiles) {
        const pct = Math.round(completed / totalTiles * 100);
        process.stdout.write(`\r   Progress: ${pct}% (${completed}/${totalTiles})`);
      }
      
      // Wait before next request to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, DELAY));
    }
  }
  
  console.log('\n');
  console.log('✅ Download complete!');
  console.log(`   Downloaded: ${downloaded}`);
  console.log(`   Cached: ${cached}`);
  console.log(`   Not found: ${notFound}`);
  console.log(`   Errors: ${errors}`);
}

// Create output directory
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'tiles');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Run
downloadTiles().catch(console.error);