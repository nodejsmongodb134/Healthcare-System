const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { compressSingle } = require('../middleware/imageCompressor');
const Message = require('../models/Message');
const Patient = require('../models/Patient');
const User = require('../models/User');

// ============ MULTER CONFIGURATION ============
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './public/uploads/messages';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'msg-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter
});

// ============ GET MESSAGE PAGE ============
router.get('/message', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'patient') {
      req.flash('error_msg', 'Access denied. Patient only.');
      return res.redirect('/auth/login');
    }

    const patient = await Patient.findOne({ userId: req.session.user.id });
    const messages = await Message.find({
      patientId: req.session.user.id
    }).sort({ createdAt: -1 });

    // Get query params for reply
    const replyTo = req.query.replyTo || null;
    const replySubject = req.query.subject || '';
    const parentId = req.query.parentId || null;

    console.log('📝 Reply context:', { replyTo, replySubject, parentId });

    res.render('patient/message', {
      title: 'Send Message',
      user: req.session.user,
      patient: patient || {},
      messages: messages || [],
      replyTo: replyTo,
      replySubject: replySubject,
      parentId: parentId,
    });
  } catch (error) {
    console.error('❌ Message page error:', error);
    req.flash('error_msg', 'Failed to load message page');
    res.redirect('/auth/patient-dashboard');
  }
});

// ============ DATA API (for real-time refresh) ============
router.get('/messages/data', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'patient') return res.status(401).json({ error: 'Unauthorized' });
  const messages = await Message.find({ patientId: req.session.user.id }).sort({ createdAt: -1 });
  res.json({ messages });
});

// ============ REPLY TO MESSAGE - GET ============
router.get('/message/reply/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'patient') {
      req.flash('error_msg', 'Access denied. Patient only.');
      return res.redirect('/auth/login');
    }

    const original = await Message.findOne({
      _id: req.params.id,
      patientId: req.session.user.id
    });

    if (!original) {
      req.flash('error_msg', 'Message not found or you do not have permission to reply.');
      return res.redirect('/patient/message');
    }

    const subject = original.subject.startsWith('Re: ') ? original.subject : `Re: ${original.subject}`;
    
    console.log('➡️ Redirecting to reply for message:', original._id);
    res.redirect(`/patient/message?replyTo=${original._id}&subject=${encodeURIComponent(subject)}&parentId=${original._id}`);
  } catch (error) {
    console.error('❌ Reply error:', error);
    req.flash('error_msg', 'Failed to load reply page');
    res.redirect('/patient/message');
  }
});

// ============ SEND MESSAGE ============
router.post('/message/send', upload.single('image'), compressSingle,async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') return res.redirect('/auth/login');
    const { patientName, patientEmail, patientPhone, subject, message, parentId } = req.body;
    if (!patientName || !patientEmail || !patientPhone || !subject || !message) {
      req.flash('error_msg', 'All fields are required');
      return res.redirect('/patient/message');
    }
    const newMessage = new Message({
      patientId: req.session.user.id,
      patientName: patientName.trim(),
      patientEmail: patientEmail.toLowerCase().trim(),
      patientPhone: patientPhone.trim(),
      subject: subject.trim(),
      message: message.trim(),
      senderRole: 'patient',
      status: 'unread',
      updatedAt: Date.now()
    });
    if (parentId) {
      const parent = await Message.findById(parentId);
      if (parent) {
        newMessage.parentId = parent._id;
        newMessage.threadId = parent.threadId || parent._id;
      }
    }
    if (req.file) newMessage.imageUrl = '/uploads/messages/' + req.file.filename;
    await newMessage.save();
    req.app.get('io').emit('data-updated', { type: 'message' });
    
    req.flash('success_msg', 'Message sent successfully!');
    res.redirect('/patient/message');
  } catch (error) {
    console.error('Send message error:', error);
    req.flash('error_msg', 'Failed to send message');
    res.redirect('/patient/message');
  }
});

// ============ VIEW MESSAGE DETAILS ============
router.get('/message/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const message = await Message.findOne({
      _id: req.params.id,
      patientId: req.session.user.id
    });

    if (!message) {
      req.flash('error_msg', 'Message not found');
      return res.redirect('/patient/message');
    }

    // Mark as read if unread
    if (message.status === 'unread') {
      message.status = 'read';
      message.updatedAt = Date.now();
      await message.save();
      req.app.get('io').emit('data-updated', { type: 'message' });

    }

    res.render('patient/message-details', {
      title: 'Message Details',
      user: req.session.user,
      message: message
    });
  } catch (error) {
    console.error('❌ Message details error:', error);
    req.flash('error_msg', 'Failed to load message details');
    res.redirect('/patient/message');
  }
});

// ============ EDIT MESSAGE - GET ============
router.get('/message/edit/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const message = await Message.findOne({
      _id: req.params.id,
      patientId: req.session.user.id
    });

    if (!message) {
      req.flash('error_msg', 'Message not found');
      return res.redirect('/patient/message');
    }

    if (message.status === 'replied') {
      req.flash('error_msg', 'Cannot edit a message that has been replied to');
      return res.redirect('/patient/message');
    }

    res.render('patient/message-edit', {
      title: 'Edit Message',
      user: req.session.user,
      message: message,
    });
  } catch (error) {
    console.error('❌ Edit message error:', error);
    req.flash('error_msg', 'Failed to load message for editing');
    res.redirect('/patient/message');
  }
});

// ============ EDIT MESSAGE - POST ============
router.post('/message/edit/:id', upload.single('image'),compressSingle, async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const { subject, message, removeImage } = req.body;

    if (!subject || !message) {
      req.flash('error_msg', 'Subject and message are required');
      return res.redirect(`/patient/message/edit/${req.params.id}`);
    }

    if (subject.length < 3 || subject.length > 100) {
      req.flash('error_msg', 'Subject must be between 3 and 100 characters');
      return res.redirect(`/patient/message/edit/${req.params.id}`);
    }

    if (message.length < 10 || message.length > 1000) {
      req.flash('error_msg', 'Message must be between 10 and 1000 characters');
      return res.redirect(`/patient/message/edit/${req.params.id}`);
    }

    const existingMessage = await Message.findOne({
      _id: req.params.id,
      patientId: req.session.user.id
    });

    if (!existingMessage) {
      req.flash('error_msg', 'Message not found');
      return res.redirect('/patient/message');
    }

    const updateData = {
      subject: subject.trim(),
      message: message.trim(),
      updatedAt: Date.now()
    };

    if (req.file) {
      if (existingMessage.imageUrl) {
        const oldPath = path.join(__dirname, '..', 'public', existingMessage.imageUrl);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      updateData.imageUrl = '/uploads/messages/' + req.file.filename;
    } else if (removeImage === 'true') {
      if (existingMessage.imageUrl) {
        const oldPath = path.join(__dirname, '..', 'public', existingMessage.imageUrl);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      updateData.imageUrl = null;
    }

    const updatedMessage = await Message.findOneAndUpdate(
      { _id: req.params.id, patientId: req.session.user.id },
      updateData,
      { returnDocument: 'after' }
    );

    if (!updatedMessage) {
      req.flash('error_msg', 'Message not found');
      return res.redirect('/patient/message');
    }

    req.flash('success_msg', 'Message updated successfully!');
    res.redirect('/patient/message');
  } catch (error) {
    console.error('❌ Update message error:', error);
    req.flash('error_msg', 'Failed to update message');
    res.redirect(`/patient/message/edit/${req.params.id}`);
  }
});

// ============ DELETE MESSAGE ============
router.post('/message/delete/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const message = await Message.findOne({
      _id: req.params.id,
      patientId: req.session.user.id
    });

    if (!message) {
      req.flash('error_msg', 'Message not found');
      return res.redirect('/patient/message');
    }

    if (message.status === 'replied') {
      req.flash('error_msg', 'Cannot delete a message that has been replied to');
      return res.redirect('/patient/message');
    }

    if (message.imageUrl) {
      const imagePath = path.join(__dirname, '..', 'public', message.imageUrl);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }

    await Message.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Message deleted successfully!');
    res.redirect('/patient/message');
  } catch (error) {
    console.error('❌ Delete message error:', error);
    req.flash('error_msg', 'Failed to delete message');
    res.redirect('/patient/message');
  }
});

// ============ GET ALL MESSAGES (JSON) ============
router.get('/messages/json', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const messages = await Message.find({
      patientId: req.session.user.id
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      messages: messages
    });
  } catch (error) {
    console.error('❌ Messages JSON error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ GET UNREAD MESSAGES COUNT (API) ============
router.get('/messages/unread/count', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const count = await Message.countDocuments({
      patientId: req.session.user.id,
      status: 'unread'
    });

    res.json({
      success: true,
      unreadCount: count
    });
  } catch (error) {
    console.error('❌ Unread count error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
