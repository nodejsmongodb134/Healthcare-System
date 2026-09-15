// models/AuditLog.js
const mongoose = require('mongoose');
const { encryptionPlugin } = require('../middleware/encryption');

const AuditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true,
    encrypted: true
  },
  role: {
    type: String,
    enum: ['admin', 'nurse'],
    default: 'admin'
  },
  action: {
    type: String,
    required: true,
    enum: [
      'create', 'update', 'delete', 'assign', 'revoke',
      'change_password', 'toggle_status', 'send_sms', 'login'
    ]
  },
  entityType: {
    type: String,
    required: true,
    enum: [
      'nurse', 'driver', 'patient', 'appointment', 'order',
      'message', 'user', 'admin'
    ]
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'entityTypeModel',
    default: null
  },
  entityTypeModel: {
    type: String,
    default: null
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String,
    default: null,
    encrypted: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Indexes for faster queries
AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1 });

// Apply AES-256-GCM encryption plugin
AuditLogSchema.plugin(encryptionPlugin);

module.exports = mongoose.model('AuditLog', AuditLogSchema);