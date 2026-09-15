// routes/nurse-sms.js
const express = require('express');
const router = express.Router();
const notificationService = require('../services/notification.service');

// ============ MANUAL BIRTHDAY SMS ============
router.post('/sms/birthday/send', async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied');
      return res.redirect('/auth/login');
    }

    const results = await notificationService.sendBirthdaySmsToAll();
    
    if (results && results.length > 0) {
      const successCount = results.filter(r => r.success).length;
      req.flash('success_msg', `Birthday SMS sent to ${successCount} out of ${results.length} patients`);
    } else {
      req.flash('info_msg', 'No patients have birthdays today');
    }
    
    res.redirect('/auth/nurse-dashboard');
  } catch (error) {
    console.error('Birthday SMS error:', error);
    req.flash('error_msg', 'Failed to send birthday SMS');
    res.redirect('/auth/nurse-dashboard');
  }
});

// ============ MANUAL APPOINTMENT REMINDERS ============
router.post('/sms/appointments/remind', async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied');
      return res.redirect('/auth/login');
    }

    const results = await notificationService.sendAppointmentRemindersForToday();
    
    if (results && results.length > 0) {
      const successCount = results.filter(r => r.success).length;
      req.flash('success_msg', `Appointment reminders sent to ${successCount} out of ${results.length} patients`);
    } else {
      req.flash('info_msg', 'No appointments scheduled for tomorrow');
    }
    
    res.redirect('/auth/nurse-dashboard');
  } catch (error) {
    console.error('Appointment reminders error:', error);
    req.flash('error_msg', 'Failed to send appointment reminders');
    res.redirect('/auth/nurse-dashboard');
  }
});

// ============ TEST SMS ============
router.get('/sms/test', async (req, res) => {
  try {
    const httpSMSService = require('../services/httpsms');
    const result = await httpSMSService.testConnection();
    res.json(result);
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ============ GET TODAY'S BIRTHDAYS ============
router.get('/sms/birthday/today', async (req, res) => {
  try {
    const Patient = require('../models/Patient');
    const today = new Date();
    const patients = await Patient.find({
      $expr: {
        $and: [
          { $eq: [{ $dayOfMonth: '$dateOfBirth' }, today.getDate()] },
          { $eq: [{ $month: '$dateOfBirth' }, today.getMonth() + 1] }
        ]
      },
      smsOptIn: true,
      phone: { $ne: null, $ne: '' }
    });

    res.json({
      success: true,
      count: patients.length,
      patients: patients.map(p => ({
        name: p.name,
        phone: p.phone,
        email: p.email
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;