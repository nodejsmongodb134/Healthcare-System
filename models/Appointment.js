// models/Appointment.js
const mongoose = require('mongoose');
const { encryptionPlugin } = require('../middleware/encryption');

const AppointmentSchema = new mongoose.Schema({
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
  date: {
    type: Date,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
    encrypted: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
  },
  nurseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  nurseName: {
    type: String,
    default: null,
    encrypted: true
  },
  fiveHourReminderSent: {
    type: Boolean,
    default: false
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
}, { timestamps: true });

// Index for faster queries
AppointmentSchema.index({ patientId: 1, date: -1 });
AppointmentSchema.index({ date: 1, status: 1 });

// Apply AES-256-GCM encryption plugin
AppointmentSchema.plugin(encryptionPlugin);

module.exports = mongoose.model('Appointment', AppointmentSchema);