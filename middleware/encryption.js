// middleware/encryption.js
const createAESPlugin = require('mongoose-aes-encryption');

// Validate key exists and is the correct length
if (!process.env.ENCRYPTION_KEY) {
  throw new Error(
    '❌ ENCRYPTION_KEY is missing from .env. ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
}

if (process.env.ENCRYPTION_KEY.length !== 64) {
  throw new Error(
    '❌ ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
    'Current length: ' + process.env.ENCRYPTION_KEY.length
  );
}

const encryptionPlugin = createAESPlugin({
  key: process.env.ENCRYPTION_KEY
});

module.exports = { encryptionPlugin };