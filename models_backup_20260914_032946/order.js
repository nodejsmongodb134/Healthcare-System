// models/Order.js
const mongoose = require('mongoose');
const { encryptionPlugin } = require('../middleware/encryption');

const OrderSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  patientName: {
    type: String,
    required: true,
    trim: true,
    encrypted: true
  },
  patientEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    encrypted: true
  },
  patientPhone: {
    type: String,
    required: true,
    trim: true,
    encrypted: true
  },
  prescriptionName: {
    type: String,
    required: true,
    trim: true,
    encrypted: true
  },
  prescriptionPhoto: {
    type: String,
    default: null
  },
  location: {
    type: String,
    required: true,
    trim: true,
    encrypted: true
  },
  latitude: {
    type: Number,
    default: null
  },
  longitude: {
    type: Number,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'in-transit', 'delivered', 'cancelled'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    default: null
  },
  driverName: {
    type: String,
    default: null,
    encrypted: true
  },
  driverPhone: {
    type: String,
    default: null,
    encrypted: true
  },
  driverVehicle: {
    type: String,
    default: null
  },
  orderDate: {
    type: Date,
    default: Date.now
  },
  deliveryDate: {
    type: Date,
    default: null
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500,
    default: null,
    encrypted: true
  },
  lastNotificationSent: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
OrderSchema.index({ patientId: 1, createdAt: -1 });
OrderSchema.index({ driverId: 1, status: 1 });
OrderSchema.index({ status: 1 });

// Apply AES-256-GCM encryption plugin
OrderSchema.plugin(encryptionPlugin);

module.exports = mongoose.model('Order', OrderSchema);