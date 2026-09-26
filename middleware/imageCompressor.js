// middleware/imageCompressor.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

// ===== Config =====
const MAX_WIDTH   = 1200;
const MAX_HEIGHT  = 1200;
const JPEG_QUALITY = 65;
const WEBP_QUALITY = 72;
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

  // Read the file into memory FIRST — releases the file handle immediately
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
    pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true, chromaSubsampling: '4:2:0' });
  } else if (format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 9, palette: true, quality: 85 });
  } else if (format === 'webp') {
    pipeline = pipeline.webp({ quality: WEBP_QUALITY });
  } else {
    pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
  }

  const outputBuffer = await pipeline.toBuffer();

  if (outputBuffer.length < originalSize) {
    // Write to a temp file, then atomically replace the original
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
 * Pick a Cloudinary subfolder based on the local file path.
 * Falls back to 'uploads' if the path doesn't match a known folder.
 */
function folderFor(filePath) {
  if (filePath.includes('prescriptions')) return 'prescriptions';
  if (filePath.includes('messages'))      return 'messages';
  if (filePath.includes('profiles'))      return 'profiles';
  return 'uploads';
}

/**
 * Process one file: compress + upload to Cloudinary.
 * Sets `file.cloudinaryUrl` and `file.cloudinaryPublicId` on success.
 */
async function processFile(file) {
  // 1. Compress (unchanged behavior)
  const result = await compressImage(file.path).catch(err => {
    console.error('⚠️ Compression failed (keeping original):', err.message);
    return { skipped: true, originalSize: 0, compressedSize: 0, percent: 0 };
  });

  if (!result.skipped) {
    console.log(
      `🖼️  ${file.originalname} — ` +
      `${(result.originalSize / 1024).toFixed(1)} KB → ` +
      `${(result.compressedSize / 1024).toFixed(1)} KB ` +
      `(saved ${result.percent}%)`
    );
  }

  // 2. Upload the COMPRESSED file to Cloudinary
  const folder = folderFor(file.path);
  const cloud = await uploadToCloudinary(file.path, folder);

  if (cloud) {
    file.cloudinaryUrl = cloud.url;
    file.cloudinaryPublicId = cloud.publicId;
    console.log(`☁️  ${file.originalname} → Cloudinary (${(cloud.bytes / 1024).toFixed(1)} KB)`);
  } else {
    console.warn(`⚠️  ${file.originalname} → Cloudinary failed, kept local: ${file.path}`);
  }

  return result;
}

/**
 * Middleware for single-file uploads.
 */
function compressSingle(req, res, next) {
  const file = req.file;
  if (!file) return next();

  processFile(file)
    .then(() => next())
    .catch(err => {
      console.error('⚠️ compressSingle error:', err.message);
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

  Promise.all(all.map(f => processFile(f).catch(() => null)))
    .then(() => next())
    .catch(err => {
      console.error('⚠️ compressMultiple error:', err.message);
      next();
    });
}

module.exports = { compressImage, compressSingle, compressMultiple };
