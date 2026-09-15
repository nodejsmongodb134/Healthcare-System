// models/Message.js
const mongoose = require('mongoose');
const { encryptionPlugin } = require('../middleware/encryption');

const MessageSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  patientName: { type: String, required: true, trim: true, encrypted: true },
  patientEmail: { type: String, required: true, trim: true, lowercase: true, encrypted: true },
  patientPhone: { type: String, required: true, trim: true, encrypted: true },
  subject: { type: String, required: true, trim: true, maxlength: 100, encrypted: true },
  message: { type: String, required: true, trim: true, maxlength: 1000, encrypted: true },
  imageUrl: { type: String, default: null },
  senderRole: { type: String, enum: ['patient', 'nurse'], default: 'patient' },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  isAnnouncement: { type: Boolean, default: false },
  announcementId: { type: mongoose.Schema.Types.ObjectId, default: null },
  status: { type: String, enum: ['unread', 'read', 'replied'], default: 'unread' },
  nurseId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  nurseName: { type: String, default: null, encrypted: true },
  nurseReply: { type: String, default: null, encrypted: true },
  nurseReplyImageUrl: { type: String, default: null },
  replyDate: { type: Date, default: null },
}, { timestamps: true });

// ✅ Async pre-save hook (no `next`)
MessageSchema.pre('save', async function () {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY missing');
  }
});

MessageSchema.index({ isAnnouncement: 1, announcementId: 1 });
MessageSchema.index({ patientId: 1, createdAt: -1 });
MessageSchema.index({ status: 1 });

MessageSchema.plugin(encryptionPlugin);

module.exports = mongoose.model('Message', MessageSchema);