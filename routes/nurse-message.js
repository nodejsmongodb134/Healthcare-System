// routes/nurse-message.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Message = require('../models/Message');
const User = require('../models/User');
const Patient = require('../models/Patient');
const { plainify } = require('../utils/plainify');

// ============ MULTER CONFIGURATION ============
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './public/uploads/messages';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'msg-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only image files are allowed!'), false);
};

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

// ============ NURSE MESSAGES PAGE ============
router.get('/nurse-messages', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }
    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const messages = await Message.find().sort({ createdAt: -1 });

    const patients = await User.find({ role: 'patient' })
      .select('name email')
      .sort({ name: 1 });

    const patientIds = patients.map(p => p._id);
    const profiles = await Patient.find({ userId: { $in: patientIds } })
      .select('userId phone');

    const profileMap = {};
    profiles.forEach(p => { profileMap[p.userId.toString()] = p.phone; });

        // ✅ Read each field explicitly — getters trigger decryption
    const patientsWithPhone = patients.map(p => ({
      _id: p._id,
      name: p.name,         // ← getter → plaintext
      email: p.email,       // ← getter → plaintext
      phone: profileMap[p._id.toString()] || 'N/A'
    }));

    res.render('nurse/nurse-message', {
      title: 'Patient Messages',
      user: req.session.user,
      messages: messages,
      patients: patientsWithPhone,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('❌ Nurse messages error:', error);
    req.flash('error_msg', 'Failed to load messages');
    res.redirect('/auth/nurse-dashboard');
  }
});

// ============ DATA API (for real-time refresh) ============
router.get('/messages/data', async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'nurse') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const messages = await Message.find().sort({ createdAt: -1 });
    res.json({ messages: plainify(messages) });   // ✅ plainify
  } catch (err) {
    console.error('❌ Messages data error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ VIEW MESSAGE (API) ============
router.get('/message/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.status === 'unread') {
      message.status = 'read';
      message.updatedAt = Date.now();
      await message.save();
      const io = req.app.get('io');
      if (io) io.emit('data-updated', { type: 'message' });
    }

    res.json({ success: true, message: plainify(message) });   // ✅ plainify
  } catch (error) {
    console.error('❌ View message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ REPLY TO MESSAGE ============
router.post('/message/reply', upload.single('replyImage'), async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'nurse') return res.redirect('/auth/login');
    const { messageId, reply } = req.body;
    if (!messageId || !reply) {
      req.flash('error_msg', 'Message ID and reply are required');
      return res.redirect('/nurse/nurse-messages');
    }
    const message = await Message.findById(messageId);
    if (!message) {
      req.flash('error_msg', 'Message not found');
      return res.redirect('/nurse/nurse-messages');
    }
    message.nurseId = req.session.user.id;
    message.nurseName = req.session.user.name;
    message.nurseReply = reply.trim();
    message.replyDate = Date.now();
    message.status = 'replied';
    message.updatedAt = Date.now();
    if (req.file) message.nurseReplyImageUrl = '/uploads/messages/' + req.file.filename;
    await message.save();

    const io = req.app.get('io');
    if (io) io.emit('data-updated', { type: 'message' });

    req.flash('success_msg', 'Reply sent successfully');
    res.redirect('/nurse/nurse-messages');
  } catch (error) {
    console.error('Reply error:', error);
    req.flash('error_msg', 'Failed to send reply');
    res.redirect('/nurse/nurse-messages');
  }
});

// ============ NURSE SEND NEW MESSAGE ============
router.post('/message/send', upload.single('image'), async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'nurse') return res.redirect('/auth/login');
    const { patientId, subject, message } = req.body;
    if (!patientId || !subject || !message) {
      req.flash('error_msg', 'Patient, subject, and message are required');
      return res.redirect('/nurse/nurse-messages');
    }
    const patient = await User.findById(patientId);
    if (!patient || patient.role !== 'patient') {
      req.flash('error_msg', 'Invalid patient selected');
      return res.redirect('/nurse/nurse-messages');
    }
    const profile = await Patient.findOne({ userId: patient._id });
    const phone = profile?.phone || 'N/A';

    const newMessage = new Message({
      patientId: patient._id,
      patientName: patient.name,
      patientEmail: patient.email,
      patientPhone: phone,
      subject: subject.trim(),
      message: message.trim(),
      senderRole: 'nurse',
      nurseId: req.session.user.id,
      nurseName: req.session.user.name,
      status: 'read',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    if (req.file) newMessage.imageUrl = '/uploads/messages/' + req.file.filename;
    await newMessage.save();

    const io = req.app.get('io');
    if (io) io.emit('data-updated', { type: 'message' });

    req.flash('success_msg', 'Message sent successfully');
    res.redirect('/nurse/nurse-messages');
  } catch (error) {
    console.error('Send message error:', error);
    req.flash('error_msg', 'Failed to send message');
    res.redirect('/nurse/nurse-messages');
  }
});

// ============ GET MESSAGES BY STATUS (API) ============
router.get('/messages/status/:status', async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    const status = req.params.status;
    const query = {};
    if (status !== 'all') query.status = status;
    const messages = await Message.find(query).sort({ createdAt: -1 });
    res.json({ success: true, messages: plainify(messages) });   // ✅ plainify
  } catch (error) {
    console.error('❌ Messages by status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;