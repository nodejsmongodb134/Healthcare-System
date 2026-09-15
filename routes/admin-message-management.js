const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/admin');
const Message = require('../models/Message');
const User = require('../models/User');

// ===================== MESSAGE MANAGEMENT PAGE =====================
router.get('/messages/manage', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    const messages = await Message.find(filter).sort({ createdAt: -1 });

    res.render('admin/message-management', {
      title: 'Message Management',
      user: req.session.user,
      messages: messages,
      currentFilter: status || 'all',
    });
  } catch (error) {
    console.error('Message management error:', error);
    req.flash('error_msg', 'Failed to load messages');
    res.redirect('/admin/dashboard');
  }
});

// ===================== REPLY TO MESSAGE =====================
router.post('/messages/reply/:id', adminMiddleware, async (req, res) => {
  try {
    const { reply } = req.body;
    if (!reply || reply.trim().length < 3) {
      req.flash('error_msg', 'Reply must be at least 3 characters');
      return res.redirect('/admin/messages/manage');
    }

    const message = await Message.findById(req.params.id);
    if (!message) {
      req.flash('error_msg', 'Message not found');
      return res.redirect('/admin/messages/manage');
    }

    // Admin reply – we use the nurse fields but set admin as replier
    message.nurseId = req.session.user.id;
    message.nurseName = req.session.user.name + ' (Admin)';
    message.nurseReply = reply.trim();
    message.replyDate = Date.now();
    message.status = 'replied';
    message.updatedAt = Date.now();
    await message.save();

    req.flash('success_msg', 'Reply sent successfully');
    res.redirect('/admin/messages/manage');
  } catch (error) {
    console.error('Reply error:', error);
    req.flash('error_msg', 'Failed to send reply');
    res.redirect('/admin/messages/manage');
  }
});

// ===================== DELETE MESSAGE =====================
router.post('/messages/delete/:id', adminMiddleware, async (req, res) => {
  try {
    const message = await Message.findByIdAndDelete(req.params.id);
    if (!message) {
      req.flash('error_msg', 'Message not found');
      return res.redirect('/admin/messages/manage');
    }
    req.flash('success_msg', 'Message deleted successfully');
    res.redirect('/admin/messages/manage');
  } catch (error) {
    console.error('Delete message error:', error);
    req.flash('error_msg', 'Failed to delete message');
    res.redirect('/admin/messages/manage');
  }
});

// ===================== MARK AS READ =====================
router.post('/messages/mark-read/:id', adminMiddleware, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) {
      req.flash('error_msg', 'Message not found');
      return res.redirect('/admin/messages/manage');
    }
    message.status = 'read';
    message.updatedAt = Date.now();
    await message.save();
    req.flash('success_msg', 'Message marked as read');
    res.redirect('/admin/messages/manage');
  } catch (error) {
    console.error('Mark read error:', error);
    req.flash('error_msg', 'Failed to mark as read');
    res.redirect('/admin/messages/manage');
  }
});

// ===================== MARK AS UNREAD =====================
router.post('/messages/mark-unread/:id', adminMiddleware, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) {
      req.flash('error_msg', 'Message not found');
      return res.redirect('/admin/messages/manage');
    }
    message.status = 'unread';
    message.updatedAt = Date.now();
    await message.save();
    req.flash('success_msg', 'Message marked as unread');
    res.redirect('/admin/messages/manage');
  } catch (error) {
    console.error('Mark unread error:', error);
    req.flash('error_msg', 'Failed to mark as unread');
    res.redirect('/admin/messages/manage');
  }
});

module.exports = router;
