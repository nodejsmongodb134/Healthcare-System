// config/cloudinary.js
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true
});

if (!process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET) {
  console.warn('⚠️  Cloudinary env vars missing — uploads will fall back to local disk');
} else {
  console.log('☁️  Cloudinary configured for cloud:', process.env.CLOUDINARY_CLOUD_NAME);
}

module.exports = cloudinary;
