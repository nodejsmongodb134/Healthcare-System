// routes/admin-announcement.js
const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

// ============ LIST ALL ANNOUNCEMENTS ============
router.get('/announcements', async (req, res) => {
  try {
    // NO .lean() and NO .aggregate() — both bypass encryption getters
    const messages = await Message.find({
      isAnnouncement: true,
      announcementId: { $ne: null }
    }).sort({ createdAt: -1 });

    // Group in JavaScript by announcementId
    const groupMap = new Map();
    for (const msg of messages) {
      const id = msg.announcementId;
      if (!id) continue;
      if (!groupMap.has(id)) {
        groupMap.set(id, {
          _id: id,
          subject: msg.subject,
          message: msg.message,
          nurseName: msg.nurseName,
          nurseId: msg.nurseId,
          sentAt: msg.createdAt,
          recipientCount: 0
        });
      }
      groupMap.get(id).recipientCount += 1;
    }

    const announcements = Array.from(groupMap.values())
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

    const totalAnnouncements = announcements.length;
    const totalMessages = announcements.reduce((sum, a) => sum + a.recipientCount, 0);
    const uniqueNurses = new Set(announcements.map(a => a.nurseName).filter(Boolean)).size;

    res.render('admin/announcement', {
      title: 'Announcements',
      user: req.session.user,
      announcements,
      stats: { totalAnnouncements, totalMessages, uniqueNurses },
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('❌ Announcements error:', error);
    req.flash('error_msg', 'Failed to load announcements');
    res.redirect('/admin/dashboard');
  }
});

// ============ GET ANNOUNCEMENT DETAILS (API) ============
router.get('/announcements/:id', async (req, res) => {
  try {
    const messages = await Message.find({
      isAnnouncement: true,
      announcementId: req.params.id
    }).sort({ patientName: 1 });

    if (!messages || messages.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({
      success: true,
      announcement: {
        subject: messages[0].subject,
        message: messages[0].message,
        nurseName: messages[0].nurseName,
        sentAt: messages[0].createdAt,
        recipientCount: messages.length,
        recipients: messages.map(m => ({
          name: m.patientName,
          email: m.patientEmail,
          phone: m.patientPhone,
          status: m.status
        }))
      }
    });
  } catch (error) {
    console.error('❌ Announcement details error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ DELETE ANNOUNCEMENT ============
router.post('/announcements/delete/:id', async (req, res) => {
  try {
    const result = await Message.deleteMany({
      isAnnouncement: true,
      announcementId: req.params.id
    });

    if (result.deletedCount === 0) {
      req.flash('error_msg', 'Announcement not found');
      return res.redirect('/admin/announcements');
    }

    console.log('🗑️ Deleted announcement ' + req.params.id + ' (' + result.deletedCount + ' messages)');
    req.flash('success_msg', 'Announcement deleted (' + result.deletedCount + ' messages removed)');
    res.redirect('/admin/announcements');
  } catch (error) {
    console.error('❌ Delete announcement error:', error);
    req.flash('error_msg', 'Failed to delete announcement');
    res.redirect('/admin/announcements');
  }
});

module.exports = router;
