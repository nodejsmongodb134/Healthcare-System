// utils/cloudinaryUpload.js
const fs = require('fs');
const cloudinary = require('../config/cloudinary');

/**
 * Upload a local file to Cloudinary.
 * @param {string} localPath  - Absolute path to a file on disk
 * @param {string} folder     - Cloudinary subfolder (e.g. 'prescriptions', 'messages')
 * @returns {Promise<{url, publicId, format, bytes, width, height} | null>}
 */
async function uploadToCloudinary(localPath, folder = 'healthcare') {
  if (!localPath || !fs.existsSync(localPath)) {
    console.warn('⚠️  uploadToCloudinary: file not found:', localPath);
    return null;
  }

  try {
    const result = await cloudinary.uploader.upload(localPath, {
      folder: `healthcare/${folder}`,
      resource_type: 'image'
    });

    return {
      url:      result.secure_url,
      publicId: result.public_id,
      format:   result.format,
      bytes:    result.bytes,
      width:    result.width,
      height:   result.height
    };
  } catch (err) {
    console.error('❌ Cloudinary upload failed:', err.message);
    return null;
  }
}

/**
 * Delete a file from Cloudinary by public_id.
 */
async function deleteFromCloudinary(publicId) {
  if (!publicId) return false;
  try {
    await cloudinary.uploader.destroy(publicId);
    return true;
  } catch (err) {
    console.error('❌ Cloudinary delete failed:', err.message);
    return false;
  }
}

module.exports = { uploadToCloudinary, deleteFromCloudinary };
