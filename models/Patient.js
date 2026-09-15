// models/Patient.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const { encryptionPlugin } = require('../middleware/encryption');

const PatientSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, required: true, trim: true, encrypted: true },
  idNumber: { type: String, required: true, trim: true, encrypted: true },
  idNumberHash: { type: String, unique: true, sparse: true, index: true },
  phone: { type: String, required: true, trim: true, encrypted: true },
  email: { type: String, required: true, trim: true, lowercase: true, encrypted: true },
  emailHash: { type: String, sparse: true, index: true },
  dateOfBirth: { type: Date, required: true },
  age: { type: Number },

  // ✅ NEW — Gender (plaintext enum, safe for filtering/stats)
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer-not-to-say', ''],
    default: ''
  },

  // ✅ NEW — Address (PII → encrypted)
  address: { type: String, trim: true, default: '', encrypted: true },

  isChronic: { type: Boolean, default: false },
  medicationName: { type: String, default: null, encrypted: true },
  refillIntervalDays: { type: Number, default: null },
  lastRefillDate: { type: Date, default: null },
  nextRefillDate: { type: Date, default: null },
  lastRefillReminderSentAt: { type: Date, default: null },
  lastSmsSent: { type: Date, default: null },
  smsOptIn: { type: Boolean, default: true },
}, { timestamps: true });

// ✅ Async pre-save hook — recompute blind indexes
PatientSchema.pre('save', async function () {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY missing');
  }

  if (this.isModified('idNumber') && this.idNumber) {
    this.idNumberHash = crypto
      .createHmac('sha256', process.env.ENCRYPTION_KEY)
      .update(this.idNumber.trim())
      .digest('hex');
  }

  if (this.isModified('email') && this.email) {
    this.emailHash = crypto
      .createHmac('sha256', process.env.ENCRYPTION_KEY)
      .update(this.email.toLowerCase().trim())
      .digest('hex');
  }
});

PatientSchema.plugin(encryptionPlugin);

module.exports = mongoose.model('Patient', PatientSchema);