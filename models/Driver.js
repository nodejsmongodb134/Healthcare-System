// models/Driver.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const { encryptionPlugin } = require('../middleware/encryption');

const DriverSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, encrypted: true },
  idNumber: { type: String, required: true, trim: true, encrypted: true },
  idNumberHash: { type: String, unique: true, sparse: true, index: true },
  phone: { type: String, required: true, trim: true, encrypted: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, encrypted: true },
  emailHash: { type: String, unique: true, sparse: true, index: true },
  password: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },
  age: { type: Number },
  status: {
    type: String,
    enum: ['active', 'inactive', 'on-leave'],
    default: 'active'
  },
  licenseNumber: { type: String, trim: true, encrypted: true },
  vehicleType: { type: String, trim: true },
  vehiclePlate: { type: String, trim: true, encrypted: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

// ✅ Async pre-save hook (no `next`)
DriverSchema.pre('save', async function () {
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

DriverSchema.plugin(encryptionPlugin);

module.exports = mongoose.model('Driver', DriverSchema);