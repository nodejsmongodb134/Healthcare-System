require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

(async () => {
  console.log('Cloud name:', process.env.CLOUDINARY_CLOUD_NAME);
  console.log('API key   :', process.env.CLOUDINARY_API_KEY
    ? process.env.CLOUDINARY_API_KEY.substring(0, 6) + '...'
    : '(missing)');

  // Use an existing image from your project
  const testImage = path.join(__dirname, '..', 'public', 'images', 'marker-icon.png');

  if (!fs.existsSync(testImage)) {
    console.log('❌ Not found:', testImage);
    process.exit(1);
  }

  console.log('Uploading:', testImage);
  console.log('Size     :', (fs.statSync(testImage).size / 1024).toFixed(1), 'KB');

  const result = await uploadToCloudinary(testImage, 'test');

  if (result) {
    console.log('');
    console.log('✅ SUCCESS');
    console.log('  URL       :', result.url);
    console.log('  publicId  :', result.publicId);
    console.log('  size      :', (result.bytes / 1024).toFixed(1), 'KB');
    console.log('  format    :', result.format);
    console.log('  dimensions:', result.width + 'x' + result.height);
  } else {
    console.log('❌ Upload failed — check errors above');
  }
  process.exit(0);
})();
