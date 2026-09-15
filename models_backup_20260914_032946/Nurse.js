// models/Nurse.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const { encryptionPlugin } = require('../middleware/encryption');

const NurseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, required: true, trim: true, encrypted: true },
  idNumber: { type: String, required: true, trim: true, encrypted: true },
  idNumberHash: { type: String, unique: true, sparse: true, index: true },
  phone: { type: String, required: true, trim: true, encrypted: true },
  email: { type: String, required: true, trim: true, lowercase: true, encrypted: true },
  emailHash: { type: String, sparse: true, index: true },
  dateOfBirth: { type: Date, required: true },
  age: { type: Number },
  qualification: { type: String, trim: true, encrypted: true },
  specialization: { type: String, trim: true, encrypted: true },
  yearsOfExperience: { type: Number, default: 0 },
  licenseNumber: { type: String, trim: true, encrypted: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ✅ Async pre-save hook (no `next`)
NurseSchema.pre('save', async function () {
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

NurseSchema.plugin(encryptionPlugin);

module.exports = mongoose.model('Nurse', NurseSchema);