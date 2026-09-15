const crypto = require('crypto');

const algorithmGcm = 'aes-256-gcm';
const algorithmCbc = 'aes-256-cbc';
const delimiter = '|';

/**
 * Parses the key string into a Buffer. Accepts either a 32-byte raw string or
 * a 64-character hex string. Call once at plugin initialisation time and pass
 * the resulting Buffer to encrypt() / decrypt() to avoid repeating this work
 * on every field access.
 *
 * @param {string} key
 * @returns {Buffer}
 */
function parseKey(key) {
    const hexReg = /^[0-9A-F]{64}$/i;
    if (!key) {
        throw new Error('mongoose-aes-encryption: key is required');
    }
    if (key.toString().length === 32) {
        return Buffer.from(key);
    }
    if (hexReg.test(key)) {
        return Buffer.from(key, 'hex');
    }
    throw new Error('mongoose-aes-encryption: key must be 32 bytes (raw string) or 64 hex characters');
}

/**
 * Encrypts a plain-text string.
 *
 * Options:
 *   key        {string|Buffer}  Encryption key — 32-byte string, 64-char hex string, or
 *                               a Buffer previously returned by parseKey().
 *   algorithm  {string}         'aes-256-gcm' (default) or 'aes-256-cbc'.
 *   passNull   {boolean}        When true, null input is returned as null instead of throwing.
 *
 * Wire format:
 *   GCM -> iv_hex|ciphertext_hex|authTag_hex   (3 pipe-delimited parts)
 *   CBC -> iv_hex|ciphertext_hex               (2 pipe-delimited parts)
 *
 * @param {string|null} text
 * @param {object} options
 * @returns {string|null}
 */
function encrypt(text, options) {
    if (text === null) {
        if (options && options.passNull) return null;
        throw new Error('mongoose-aes-encryption: encrypt input must not be null');
    }
    const keyBuf = (options.key instanceof Buffer) ? options.key : parseKey(options.key);
    const algorithm = (options && options.algorithm) ? options.algorithm : algorithmGcm;
    let iv, cipher, encrypted, authTag;
    if (algorithm === algorithmGcm) {
        iv = crypto.randomBytes(12);
        cipher = crypto.createCipheriv(algorithmGcm, keyBuf, iv);
        encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
        authTag = cipher.getAuthTag();
        return iv.toString('hex') + delimiter + encrypted.toString('hex') + delimiter + authTag.toString('hex');
    }
    if (algorithm === algorithmCbc) {
        iv = crypto.randomBytes(16);
        cipher = crypto.createCipheriv(algorithmCbc, keyBuf, iv);
        encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
        return iv.toString('hex') + delimiter + encrypted.toString('hex');
    }
    throw new Error(`mongoose-aes-encryption: unknown algorithm '${algorithm}'`);
}

/**
 * Decrypts a ciphertext string produced by encrypt().
 * The algorithm is auto-detected from the number of pipe-delimited parts.
 *
 * Options:
 *   key       {string|Buffer}  Decryption key — same formats as encrypt().
 *   passNull  {boolean}        When true, null input is returned as null instead of throwing.
 *
 * @param {string|null} text
 * @param {object} options
 * @returns {string|null}
 */
function decrypt(text, options) {
    if (text === null) {
        if (options && options.passNull) return null;
        throw new Error('mongoose-aes-encryption: decrypt input must not be null');
    }
    const keyBuf = (options.key instanceof Buffer) ? options.key : parseKey(options.key);
    try {
        const parts = text.split(delimiter);
        if (parts.length === 3) {
            const iv = Buffer.from(parts[0], 'hex');
            const ciphertext = Buffer.from(parts[1], 'hex');
            const authTag = Buffer.from(parts[2], 'hex');
            const decipher = crypto.createDecipheriv(algorithmGcm, keyBuf, iv);
            decipher.setAuthTag(authTag);
            return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString();
        }
        const iv = Buffer.from(parts[0], 'hex');
        const ciphertext = Buffer.from(parts[1], 'hex');
        const decipher = crypto.createDecipheriv(algorithmCbc, keyBuf, iv);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString();
    } catch (error) {
        throw new Error(
            'mongoose-aes-encryption: decryption failed — check that the key is correct and the value has not been tampered with',
            { cause: error }
        );
    }
}

module.exports = { parseKey, encrypt, decrypt };
