// models/User.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const { encryptionPlugin } = require('../middleware/encryption');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, encrypted: true },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    encrypted: true
  },
  emailHash: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['patient', 'nurse', 'admin'],
    default: 'patient'
  },
  isVerified: { type: Boolean, default: false },
  profileComplete: { type: Boolean, default: false },
  verificationToken: String,
  verificationTokenExpires: Date,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  createdAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

// ✅ Async pre-save hook (no `next`)
UserSchema.pre('save', async function () {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY missing — cannot compute blind index');
  }

  if (this.isModified('email') && this.email) {
    this.emailHash = crypto
      .createHmac('sha256', process.env.ENCRYPTION_KEY)
      .update(this.email.toLowerCase().trim())
      .digest('hex');
  }
});

UserSchema.plugin(encryptionPlugin);

module.exports = mongoose.model('User', UserSchema);