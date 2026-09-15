[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![npm version](https://img.shields.io/npm/v/mongoose-aes-encryption)
![node version](https://img.shields.io/node/v/mongoose-aes-encryption)
[![Build Status](https://img.shields.io/github/actions/workflow/status/tsmx/mongoose-aes-encryption/git-build.yml?branch=master)](https://img.shields.io/github/actions/workflow/status/tsmx/mongoose-aes-encryption/git-build.yml?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/tsmx/mongoose-aes-encryption/badge.svg?branch=master)](https://coveralls.io/github/tsmx/mongoose-aes-encryption?branch=master)

# [**mongoose-aes-encryption**](https://github.com/tsmx/mongoose-aes-encryption)

> Mongoose encryption plugin for MongoDB providing field-level AES-256-GCM encryption-at-rest with built-in tamper detection.

Secure sensitive fields such as passwords, PII, tokens, and secrets while
keeping your application logic unchanged.

## Installation

```bash
npm install mongoose-aes-encryption
```

## Quick Example

```js
const mongoose = require('mongoose');
const createAESPlugin = require('mongoose-aes-encryption');

const plugin = createAESPlugin({ key: process.env.ENCRYPTION_KEY });

const userSchema = new mongoose.Schema({
    token: { type: String, encrypted: true },
    pin: { type: Number, encrypted: true }
});

userSchema.plugin(plugin);
```

MongoDB stores only ciphertext — your application reads and writes plain values.

Already have an existing MongoDB with plaintext data or want to upgrade from another encryption plugin? See the [migration](#migration) section. 

## What this package does

✅ Field-level encryption for Mongoose schemas  
✅ Transparent encryption on save, decryption on read  
✅ AES-256-GCM authenticated encryption  
✅ Tamper detection for encrypted values  
✅ Works with [nested sub-documents](#inline-nested-sub-documents), [sub-schemas](#separate-sub-schemas), and arrays  
✅ Zero production dependencies — uses Node.js built-in `crypto` module only  

❌ Not full-database encryption  
❌ Not a replacement for MongoDB Atlas encryption at rest  

## Usage

Suppose you have the following Mongoose schema with sensitive fields:

```javascript
const schema = new mongoose.Schema({
    username:     { type: String },
    email:        { type: String },
    salary:       { type: Number },
    phoneNumbers: { type: [String] }
});
```

To encrypt `email`, `salary`, and `phoneNumbers` at rest using AES-GCM, add two lines of setup and one flag per field:

```javascript
const createAESPlugin = require('mongoose-aes-encryption');
const plugin = createAESPlugin({ key: process.env.ENCRYPTION_KEY });

const schema = new mongoose.Schema({
    username:     { type: String },
    email:        { type: String,   encrypted: true },
    salary:       { type: Number,   encrypted: true },
    phoneNumbers: { type: [String], encrypted: true }
});
schema.plugin(plugin);
```

That's it — the rest of your code is unchanged:

```javascript
const User = mongoose.model('User', schema);

const user = new User({ username: 'alice', email: 'alice@example.com', salary: 75000, phoneNumbers: ['+1-555-0100', '+1-555-0101'] });
await user.save();
// MongoDB stores:
// { username: 'alice', email: '<iv|ciphertext|authTag>', salary: '<iv|ciphertext|authTag>',
//   phoneNumbers: ['<iv|ciphertext|authTag>', '<iv|ciphertext|authTag>'] }

const found = await User.findOne({ username: 'alice' });
// Result: found.email        === 'alice@example.com'                    (transparently decrypted)
// Result: found.salary       === 75000                                  (transparently decrypted)
// Result: found.phoneNumbers deep-equals ['+1-555-0100', '+1-555-0101'] (each element transparently decrypted)
```

### Inline nested sub-documents

Encrypted fields inside inline nested objects work automatically.

```js
const schema = new mongoose.Schema({
    id: { type: String, required: true },
    address: {
        street: { type: String, encrypted: true },
        city: { type: String }
    }
});

schema.plugin(plugin);
```

### Separate sub-schemas

Apply the plugin to **both** the parent schema and the sub-schema.

```js
const contactSchema = new mongoose.Schema({
    email: { type: String, encrypted: true },
    phone: { type: String }
});

contactSchema.plugin(plugin);

const employeeSchema = new mongoose.Schema({
    name: { type: String, encrypted: true },
    contacts: [contactSchema]
});

employeeSchema.plugin(plugin);
```
### Lean queries

Mongoose `.lean()` bypasses getters and returns the raw ciphertext stored in MongoDB. To decrypt manually, use the exported `decrypt` function directly:

```javascript
const { decrypt } = require('mongoose-aes-encryption');
const key = process.env.ENCRYPTION_KEY;

const doc = await User.findOne({ username: 'alice' }).lean();

const email    = decrypt(doc.email, { key });                    // → string
const salary   = parseFloat(decrypt(doc.salary, { key }));       // → number
const dob      = new Date(decrypt(doc.birthDate, { key }));      // → Date
const mfaEnabled = decrypt(doc.mfaEnabled, { key }) === 'true';      // → boolean
```

## Update method compatibility

Encryption is done automatically when a value is assigned through the Mongoose document lifecycle (`new`/`save()` or `findOne()` + mutate + `save()`). Operations that write directly to the database — `updateOne`, `updateMany`, `findOneAndUpdate`, `bulkWrite`, and atomic operators like `$inc`/`$push` — bypass the lifecycle and require manual use of the exported `encrypt` function.

| Operation | Support | Notes |
|---|---|---|
| `new Model({ field: v }); doc.save()` | Automatic | Full getter/setter round-trip. Standard path. |
| `Model.create({ field: v })` | Automatic | Equivalent to `new` + `save()`. |
| `doc.field = v; doc.save()` (after `findOne()`) | Automatic | Full getter/setter round-trip. |
| `.lean()` query | Manual | Getter does not fire; use `decrypt(doc.field, { key })` on each ciphertext field. |
| `Model.findOneAndUpdate(…, { $set: { field: v } })` | Manual | Bypasses document lifecycle; use `encrypt(String(v), { key })` and pass the result as the `$set` value. |
| `Model.updateOne(…, { $set: { field: v } })` | Manual | Same as above. |
| `Model.updateMany(…, { $set: { field: v } })` | Manual | Same as above — pre-encrypt each value with `encrypt()` before passing to `$set`. |
| `Model.findOneAndUpdate(…, { $inc: { field: n } })` | Manual | Cannot `$inc` ciphertext. Use `findOne()` → `doc.field += n` → `doc.save()` instead. |
| `Model.findOneAndUpdate(…, { $push: { field: v } })` | Manual | Cannot `$push` plaintext into an encrypted array. Use `findOne()` → `doc.arr.push(v)` → `doc.save()`, or pre-encrypt `v` with `encrypt(String(v), { key })` and pass to `$push`. |
| `Model.bulkWrite()` with `updateOne`/`updateMany` ops | Manual | Same as `updateOne`/`updateMany` — pre-encrypt each value with `encrypt()` before building the bulk operations. |

**Example — manual `$set` with pre-encryption:**

```javascript
const { encrypt } = require('mongoose-aes-encryption');
const key = process.env.ENCRYPTION_KEY;

const cipher = encrypt(String(newPrice), { key });
await Product.updateOne({ id: 'p-1' }, { $set: { price: cipher } });
```

**Example — manual increment workaround:**

```javascript
const doc = await Product.findOne({ id: 'p-1' });
doc.stock += 1;
await doc.save();
```

## API Reference

### `createAESPlugin(options)`

Creates and returns a Mongoose plugin function that encrypts and decrypts schema fields. Call this once — before defining any schema that uses encrypted fields — and apply the returned plugin to each schema with `schema.plugin()`.

**Parameters:**
- `options` (Object): Configuration object.
  - `options.key` (string): 64-character hex string (32 bytes). **Required.**
  - `options.algorithm` (string, optional): Encryption algorithm. `'aes-256-gcm'` (default) or `'aes-256-cbc'`.

**Returns:** `Function` — Mongoose plugin function, ready to pass to `schema.plugin()`.

**Example:**
```javascript
const mongoose = require('mongoose');
const createAESPlugin = require('mongoose-aes-encryption');

const plugin = createAESPlugin({ key: process.env.ENCRYPTION_KEY });

const schema = new mongoose.Schema({
    name:       { type: String },
    email:      { type: String,  encrypted: true },
    birthDate:  { type: Date,    encrypted: true },
    salary:     { type: Number,  encrypted: true },
    mfaEnabled: { type: Boolean, encrypted: true }
});
schema.plugin(plugin);
```

### `encrypt(value, options)`

Encrypts a plaintext string and returns the ciphertext in wire format (`iv|ciphertext|authTag` for GCM, `iv|ciphertext` for CBC).

**Parameters:**
- `value` (string): Plaintext to encrypt. Pass `null` or `undefined` to get `null` back unchanged.
- `options` (Object):
  - `options.key` (string): 64-character hex key. **Required.**
  - `options.algorithm` (string, optional): `'aes-256-gcm'` (default) or `'aes-256-cbc'`.

**Returns:** `string` — encrypted ciphertext, or `null`/`undefined` if `value` was nullish.

**Example:**
```javascript
const { encrypt } = require('mongoose-aes-encryption');
const key = process.env.ENCRYPTION_KEY;

// Pre-encrypt before a $set that bypasses Mongoose middleware
const cipher = encrypt(String(newPrice), { key });
await Product.updateOne({ id: 'p-1' }, { $set: { price: cipher } });
```

### `decrypt(value, options)`

Decrypts a ciphertext string previously produced by `encrypt` and returns the plaintext.

**Parameters:**
- `value` (string): Ciphertext in wire format. Pass `null` or `undefined` to get `null` back unchanged.
- `options` (Object):
  - `options.key` (string): 64-character hex key. **Required.**

**Returns:** `string` — decrypted plaintext, or `null`/`undefined` if `value` was nullish.

**Example:**
```javascript
const { decrypt } = require('mongoose-aes-encryption');
const key = process.env.ENCRYPTION_KEY;

// Manually decrypt fields from a lean() query
const doc = await Product.findOne({ id: 'p-1' }).lean();
const price = parseFloat(decrypt(doc.price, { key }));
```

## Setup

1. Generate a 32-byte encryption key:

   ```bash
   openssl rand -hex 32
   ```

2. Store the key securely — an environment variable or a secrets manager. Never hardcode it.

   ```bash
   export ENCRYPTION_KEY=<your-64-char-hex-key>
   ```

3. Call `createAESPlugin()` once, before any schema that uses encrypted fields is defined:

   ```javascript
   const createAESPlugin = require('mongoose-aes-encryption');
   const plugin = createAESPlugin({ key: process.env.ENCRYPTION_KEY });
   ```

4. Apply the plugin to each schema and mark sensitive fields with `encrypted: true`:

   ```javascript
   const schema = new mongoose.Schema({
       name:  { type: String },
       email: { type: String, encrypted: true }
   });
   schema.plugin(plugin);
   ```

## Security

### AES-256-GCM — authenticated encryption with tamper detection

By default, `mongoose-aes-encryption` uses **AES-256-GCM**, an authenticated encryption mode. Every encrypted value is stored in MongoDB as a pipe-delimited string:

```
iv|ciphertext|authTag
```

The `authTag` is a cryptographic MAC computed over the ciphertext. On every read the authentication tag is verified before decryption. If the stored value has been modified in any way — bit-flip, truncation, or wholesale substitution — the tag check fails and decryption `throws` immediately. Corrupted or tampered ciphertext can never be silently read back as incorrect plaintext.

AES-256-CBC (available as `algorithm: 'aes-256-cbc'` for backwards compatibility) uses the wire format `iv|ciphertext` and provides no tamper detection.

### Lean queries expose raw ciphertext

`.lean()` results bypass Mongoose getters entirely. The raw `iv|ciphertext|authTag` string is returned as-is. If your application uses lean queries on collections that contain encrypted fields, treat those fields as opaque ciphertext and decrypt them explicitly using the exported `decrypt` function — see [Lean queries](#lean-queries) and [Update method compatibility](#update-method-compatibility).

### Null values

`null` fields are stored as `null` in MongoDB without encryption. Do not rely on `null` values being confidential.

## Migration

[`mongoose-aes-encryption-migrate`](https://www.npmjs.com/package/mongoose-aes-encryption-migrate) is a companion CLI and programmatic tool for migrating existing MongoDB collections to `mongoose-aes-encryption` safely and idempotently. It processes documents in configurable batches, supports a `--dry-run` mode, and skips documents that are already encrypted so it can be re-run without side effects.

Supported migration sources:

| Source | Package |
|---|---|
| Plaintext (no prior encryption) | — |
| Field-level CBC encryption | `mongoose-field-encryption` |
| Document-level CBC + HMAC | `mongoose-encryption` |

```bash
npx mongoose-aes-encryption-migrate --source plaintext --model User
npx mongoose-aes-encryption-migrate --source mongoose-field-encryption --model User
npx mongoose-aes-encryption-migrate --source mongoose-encryption --model User
```

## How it compares to other popular Mongoose encryption plugins

| | `mongoose-field-encryption` | `mongoose-encryption` | `mongoose-aes-encryption` |
|---|---|---|---|
| Maintenance status | Active | Last release Nov 2021 | Active |
| Default algorithm | AES-256-CBC | AES-256-CBC | AES-256-GCM |
| Tamper detection | No | Via separate HMAC-SHA-512 | GCM auth tag (built-in) |
| Encryption granularity | Per field | Whole document (`_ct` blob) | Per field |
| Supported field types | String, Number, Date, Boolean | All (JSON-serialised into blob) | String, Number, Date, Boolean, arrays, nested docs |
| Schema pollution | Yes — `__enc_*` marker fields | Yes — `_ct`, `_ac` fields | No |
| `lean()` decrypt helper | No | No | Yes — exported `decrypt()` |
| Migration tool available | No | No | Yes — [`mongoose-aes-encryption-migrate`](https://www.npmjs.com/package/mongoose-aes-encryption-migrate) |

## License

[MIT](https://github.com/tsmx/mongoose-aes-encryption/blob/master/LICENSE)
