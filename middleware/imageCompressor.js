// middleware/imageCompressor.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// ===== Config =====
const MAX_WIDTH   = 1600;
const MAX_HEIGHT  = 1600;
const JPEG_QUALITY = 78;
const WEBP_QUALITY = 80;
const MIN_SIZE_TO_COMPRESS = 30 * 1024; // skip files < 30 KB

/**
 * Compress an image in place (same path, same format).
 * Uses a temp file + rename to avoid Windows file locks.
 */
async function compressImage(filePath) {
  const originalSize = fs.statSync(filePath).size;

  // Skip very small files
  if (originalSize < MIN_SIZE_TO_COMPRESS) {
    return { originalSize, compressedSize: originalSize, saved: 0, percent: 0, skipped: true };
  }

  // 🆕 Read the file into memory FIRST — releases the file handle immediately
  const inputBuffer = fs.readFileSync(filePath);

  // Read metadata from the buffer (Sharp never touches the file on disk)
  const metadata = await sharp(inputBuffer).metadata();
  const format = metadata.format; // 'jpeg', 'png', 'webp', ...

  // Build the pipeline from the buffer
  let pipeline = sharp(inputBuffer).rotate();
  if ((metadata.width || 0) > MAX_WIDTH || (metadata.height || 0) > MAX_HEIGHT) {
    pipeline = pipeline.resize(MAX_WIDTH, MAX_HEIGHT, {
      fit: 'inside',
      withoutEnlargement: true
    });
  }

  // Keep the same format
  if (format === 'jpeg' || format === 'jpg') {
    pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true });
  } else if (format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 9, palette: true, quality: 85 });
  } else if (format === 'webp') {
    pipeline = pipeline.webp({ quality: WEBP_QUALITY });
  } else {
    pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
  }

  const outputBuffer = await pipeline.toBuffer();

  if (outputBuffer.length < originalSize) {
    // 🆕 Write to a temp file, then atomically replace the original
    const tmpPath = filePath + '.tmp-' + Date.now();
    await fs.promises.writeFile(tmpPath, outputBuffer);
    await fs.promises.rename(tmpPath, filePath);

    const saved = originalSize - outputBuffer.length;
    const percent = ((saved / originalSize) * 100).toFixed(1);
    return {
      originalSize,
      compressedSize: outputBuffer.length,
      saved,
      percent,
      skipped: false
    };
  }

  // Compressed version was bigger — keep the original
  return {
    originalSize,
    compressedSize: originalSize,
    saved: 0,
    percent: 0,
    skipped: true
  };
}

/**
 * Middleware for single-file uploads.
 */
function compressSingle(req, res, next) {
  const file = req.file;
  if (!file) return next();

  compressImage(file.path)
    .then(result => {
      if (!result.skipped) {
        console.log(
          `🖼️  ${file.originalname} — ` +
          `${(result.originalSize / 1024).toFixed(1)} KB → ` +
          `${(result.compressedSize / 1024).toFixed(1)} KB ` +
          `(saved ${result.percent}%)`
        );
      }
      next();
    })
    .catch(err => {
      console.error('⚠️ Compression failed (keeping original):', err.message);
      next();
    });
}

/**
 * Middleware for multi-file uploads.
 */
function compressMultiple(req, res, next) {
  const all = [];
  if (req.files) {
    if (Array.isArray(req.files)) all.push(...req.files);
    else Object.values(req.files).forEach(arr => all.push(...arr));
  }

  if (all.length === 0) return next();

  Promise.all(all.map(f => compressImage(f.path).catch(() => null)))
    .then(results => {
      results.forEach((r, i) => {
        if (r && !r.skipped) {
          console.log(`🖼️  ${all[i].originalname} — saved ${r.percent}%`);
        }
      });
      next();
    })
    .catch(err => {
      console.error('⚠️ Multi-compress failed:', err.message);
      next();
    });
}

module.exports = { compressImage, compressSingle, compressMultiple };