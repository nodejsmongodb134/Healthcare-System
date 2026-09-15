// utils/blindIndex.js
const crypto = require('crypto');

/**
 * Generate a deterministic HMAC-SHA256 hash for a value.
 * Used to look up records by an encrypted field (blind index).
 *
 * @param {string|number} value - The plaintext value
 * @returns {string|null} - Hex-encoded hash, or null if value is empty
 */
function blindIndex(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).toLowerCase().trim();
  if (str.length === 0) return null;

  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is not set in .env — required for blind index');
  }

  return crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY)
    .update(str)
    .digest('hex');
}

module.exports = { blindIndex };
