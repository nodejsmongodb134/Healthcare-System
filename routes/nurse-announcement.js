// routes/nurse-announcement.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');                    // 🆕 ADD THIS
const User = require('../models/User');
const Patient = require('../models/Patient');
const Message = require('../models/Message');
const httpSMSService = require('../services/httpsms');

// ============ HELPER: Check SMS is enabled ============
function smsEnabled() {
  return process.env.SMS_ENABLED === 'true' && !!process.env.HTTPSMS_API_KEY;
}

// ============ GET ANNOUNCEMENT PAGE ============
router.get('/announcement', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }
    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const totalPatients = await Patient.countDocuments({
      phone: { $ne: null, $ne: '' }
    });

    res.render('nurse/announcement', {
      title: 'Send Announcement',
      user: req.session.user,
      totalPatients,
      smsEnabled: smsEnabled(),
      mockMode: process.env.SMS_MOCK === 'true'
    });
  } catch (error) {
    console.error('❌ Announcement page error:', error);
    req.flash('error_msg', 'Failed to load announcement page');
    res.redirect('/auth/nurse-dashboard');
  }
});

// ============ SEND ANNOUNCEMENT (SMS + IN-APP MESSAGE) ============
router.post('/announcement/send', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }
    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const { subject, message } = req.body;

    // ===== Validate =====
    if (!subject || !message) {
      req.flash('error_msg', 'Subject and message are required');
      return res.redirect('/nurse/announcement');
    }
    if (subject.trim().length < 3) {
      req.flash('error_msg', 'Subject must be at least 3 characters');
      return res.redirect('/nurse/announcement');
    }
    if (message.trim().length < 10) {
      req.flash('error_msg', 'Message must be at least 10 characters');
      return res.redirect('/nurse/announcement');
    }

    // ===== Check SMS config =====
    if (!smsEnabled()) {
      req.flash('error_msg', 'SMS is disabled or API key is missing');
      return res.redirect('/nurse/announcement');
    }

    // ===== Get all patients with a valid phone =====
    const patients = await Patient.find({
      phone: { $ne: null, $ne: '' }
    });

    console.log(`📢 Sending announcement to ${patients.length} patients...`);
    console.log(`   Subject: "${subject.trim()}"`);

    if (patients.length === 0) {
      req.flash('error_msg', 'No patients with phone numbers found');
      return res.redirect('/nurse/announcement');
    }

    // 🆕 Generate ONE shared announcementId for the whole broadcast
    const announcementId = new mongoose.Types.ObjectId();
    console.log(`   Announcement ID: ${announcementId}`);

    // ===== Build the SMS text =====
    const fullSmsText = `📢 ${subject.trim()}\n\n${message.trim()}`;

    // ===== Send SMS + create in-app message for each patient =====
    let smsSuccessCount = 0;
    let smsFailCount = 0;
    let inAppSuccessCount = 0;
    let inAppFailCount = 0;
    let quotaExceeded = false;
    const errors = [];

    for (let i = 0; i < patients.length; i++) {
      const patient = patients[i];

      // ---------- 1. Send SMS ----------
      try {
        const result = await httpSMSService.sendSms(patient.phone, fullSmsText);

        if (result.success) {
          smsSuccessCount++;
          console.log(`✅ SMS [${i + 1}/${patients.length}] ${patient.name}`);
        } else {
          smsFailCount++;
          const errMsg = result.error || 'Unknown error';
          if (result.quotaExceeded) quotaExceeded = true;
          errors.push(`SMS ${patient.name}: ${errMsg}`);
          console.log(`❌ SMS [${i + 1}/${patients.length}] ${patient.name} - ${errMsg}`);
        }
      } catch (err) {
        smsFailCount++;
        errors.push(`SMS ${patient.name}: ${err.message}`);
        console.log(`⚠️ SMS [${i + 1}/${patients.length}] ${patient.name} - ${err.message}`);
      }

      // ---------- 2. Create in-app message ----------
      try {
        await Message.create({
          patientId: patient.userId,               // ← User._id (not Patient._id)
          patientName: patient.name,
          patientEmail: patient.email,
          patientPhone: patient.phone,
          subject: subject.trim(),
          message: message.trim(),
          senderRole: 'nurse',
          nurseId: req.session.user.id,
          nurseName: req.session.user.name,
          status: 'unread',

          // 🆕 Announcement flags
          isAnnouncement: true,
          announcementId: announcementId,          // ← NOW DEFINED

          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        inAppSuccessCount++;
        console.log(`💬 In-app [${i + 1}/${patients.length}] ${patient.name}`);
      } catch (err) {
        inAppFailCount++;
        errors.push(`In-app ${patient.name}: ${err.message}`);
        console.log(`❌ In-app [${i + 1}/${patients.length}] ${patient.name} - ${err.message}`);
      }

      // 1‑second delay between SMS to respect the API rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`📊 Announcement complete:`);
    console.log(`   SMS: ${smsSuccessCount}/${patients.length} sent`);
    console.log(`   In-app: ${inAppSuccessCount}/${patients.length} created`);

    // ===== Emit socket event so all connected clients refresh =====
    const io = req.app.get('io');
    if (io) {
      io.emit('data-updated', { type: 'message' });
      console.log('📩 Emitted data-updated (message)');
    }

    // ===== Flash result =====
    if (quotaExceeded) {
      req.flash(
        'error_msg',
        `SMS quota exceeded. Please upgrade your httpSMS plan at ` +
        `https://httpsms.com/billing. ` +
        `(${inAppSuccessCount} in-app messages were still delivered.)`
      );
    } else if (smsFailCount === 0 && inAppFailCount === 0) {
      req.flash(
        'success_msg',
        `Announcement sent to all ${patients.length} patients (SMS + in-app).`
      );
    } else {
      req.flash(
        'warning_msg',
        `Announcement sent: SMS ${smsSuccessCount}/${patients.length}, In-app ${inAppSuccessCount}/${patients.length}.`
      );
    }

    res.redirect('/nurse/announcement');
  } catch (error) {
    console.error('❌ Send announcement error:', error);
    req.flash('error_msg', 'Failed to send announcement: ' + error.message);
    res.redirect('/nurse/announcement');
  }
});

module.exports = router;