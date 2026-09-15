// scripts/test-compression.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { compressImage } = require('../middleware/imageCompressor');

// ============================================================
//  HELPER: Format bytes nicely
// ============================================================
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ============================================================
//  TEST 1: Compress a freshly generated large image
// ============================================================
async function testFreshImage() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  TEST 1: Compress a freshly generated image');
  console.log('═══════════════════════════════════════════════');

  // Create a test upload dir
  const testDir = path.join(__dirname, '..', 'public', 'uploads', 'test');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const testFile = path.join(testDir, 'test-image.jpg');

  // Generate a noisy 3000x3000 JPEG — hard to compress (worst case)
  console.log('🎨 Generating a 3000×3000 test image (noisy, worst case)...');
  const width = 3000, height = 3000;
  const buffer = Buffer.alloc(width * height * 3);
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }

  await sharp(buffer, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 100 })     // uncompressed output
    .toFile(testFile);

  const beforeSize = fs.statSync(testFile).size;
  console.log(`📁 Created: ${formatBytes(beforeSize)}`);

  // Run the compressor
  console.log('🖼️  Running compressor...');
  const result = await compressImage(testFile);

  console.log('');
  console.log('  ─── Result ───');
  console.log(`  Original   : ${formatBytes(result.originalSize)}`);
  console.log(`  Compressed : ${formatBytes(result.compressedSize)}`);
  console.log(`  Saved      : ${formatBytes(result.saved)} (${result.percent}%)`);
  console.log(`  Skipped?   : ${result.skipped ? 'YES (too small or no gain)' : 'No'}`);

  if (result.percent > 40) {
    console.log('  ✅ Compression is WORKING');
  } else if (result.skipped) {
    console.log('  ⚠️  Image was skipped — this is expected for very small images');
  } else {
    console.log('  ❌ Compression did NOT reduce the file size significantly');
  }

  // Cleanup
  fs.unlinkSync(testFile);
  console.log('  🗑️  Test file removed');
}

// ============================================================
//  TEST 2: Compress a PNG (screenshot-like)
// ============================================================
async function testPngImage() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  TEST 2: Compress a generated PNG');
  console.log('═══════════════════════════════════════════════');

  const testDir = path.join(__dirname, '..', 'public', 'uploads', 'test');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const testFile = path.join(testDir, 'test-image.png');

  console.log('🎨 Generating a 2000×2000 PNG...');
  await sharp({
    create: {
      width: 2000,
      height: 2000,
      channels: 3,
      background: { r: 100, g: 150, b: 200 }
    }
  }).png().toFile(testFile);

  const beforeSize = fs.statSync(testFile).size;
  console.log(`📁 Created: ${formatBytes(beforeSize)}`);

  const result = await compressImage(testFile);

  console.log('');
  console.log('  ─── Result ───');
  console.log(`  Original   : ${formatBytes(result.originalSize)}`);
  console.log(`  Compressed : ${formatBytes(result.compressedSize)}`);
  console.log(`  Saved      : ${formatBytes(result.saved)} (${result.percent}%)`);

  fs.unlinkSync(testFile);
  console.log('  🗑️  Test file removed');
}

// ============================================================
//  TEST 3: Simulate a small image (should be SKIPPED)
// ============================================================
async function testSmallImage() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  TEST 3: Small image — should be SKIPPED');
  console.log('═══════════════════════════════════════════════');

  const testDir = path.join(__dirname, '..', 'public', 'uploads', 'test');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const testFile = path.join(testDir, 'test-small.jpg');

  console.log('🎨 Generating a 100×100 JPEG...');
  await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 200, g: 200, b: 200 }
    }
  }).jpeg({ quality: 80 }).toFile(testFile);

  const beforeSize = fs.statSync(testFile).size;
  console.log(`📁 Created: ${formatBytes(beforeSize)}`);

  const result = await compressImage(testFile);

  console.log('');
  console.log('  ─── Result ───');
  console.log(`  Original   : ${formatBytes(result.originalSize)}`);
  console.log(`  Compressed : ${formatBytes(result.compressedSize)}`);
  console.log(`  Skipped?   : ${result.skipped ? '✅ YES (as expected)' : '❌ No — small files should be skipped'}`);

  fs.unlinkSync(testFile);
  console.log('  🗑️  Test file removed');
}

// ============================================================
//  TEST 4: Scan and report existing uploads
// ============================================================
async function testExistingUploads() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  TEST 4: Existing uploads on disk');
  console.log('═══════════════════════════════════════════════');

  const folders = [
    path.join(__dirname, '..', 'public', 'uploads', 'prescriptions'),
    path.join(__dirname, '..', 'public', 'uploads', 'messages')
  ];

  let totalSize = 0;
  let totalFiles = 0;
  const largeFiles = []; // files > 500 KB

  for (const folder of folders) {
    if (!fs.existsSync(folder)) {
      console.log(`  ℹ️  ${path.basename(folder)} — folder does not exist`);
      continue;
    }

    const files = fs.readdirSync(folder).filter(f =>
      /\.(jpe?g|png|webp|gif)$/i.test(f)
    );

    let folderSize = 0;
    let folderCount = 0;

    for (const file of files) {
      const filePath = path.join(folder, file);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;

      folderSize += stat.size;
      folderCount++;

      if (stat.size > 500 * 1024) {
        largeFiles.push({
          name: path.join(path.basename(folder), file),
          size: stat.size
        });
      }
    }

    totalSize += folderSize;
    totalFiles += folderCount;

    console.log(`  📁 ${path.basename(folder)}: ${folderCount} files, ${formatBytes(folderSize)}`);
  }

  console.log('');
  console.log('  ─── Summary ───');
  console.log(`  Total files : ${totalFiles}`);
  console.log(`  Total size  : ${formatBytes(totalSize)}`);
  console.log(`  Avg size    : ${totalFiles > 0 ? formatBytes(totalSize / totalFiles) : 'N/A'}`);

  if (totalFiles > 0) {
    // Estimate savings if compressed
    const estimatedSavings = totalSize * 0.75;  // ~75% avg savings
    console.log(`  💡 If compressed, est. saving: ~${formatBytes(estimatedSavings)}`);
  }

  // List files > 500 KB (candidates for compression)
  if (largeFiles.length > 0) {
    console.log('');
    console.log(`  🎯 ${largeFiles.length} file(s) > 500 KB (compression would help):`);
    largeFiles
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .forEach(f => {
        console.log(`     • ${f.name} — ${formatBytes(f.size)}`);
      });
    if (largeFiles.length > 10) {
      console.log(`     ... and ${largeFiles.length - 10} more`);
    }
  } else if (totalFiles > 0) {
    console.log('');
    console.log('  ✅ No large files found — compression is either active or uploads are already small');
  }
}

// ============================================================
//  MAIN
// ============================================================
(async () => {
  try {
    console.log('');
    console.log('🧪 IMAGE COMPRESSION TEST SUITE');
    console.log('════════════════════════════════════════════════════════════');

    await testFreshImage();
    await testPngImage();
    await testSmallImage();
    await testExistingUploads();

    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('  ✅ All tests complete');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');

    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('❌ Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();