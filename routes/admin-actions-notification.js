const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/admin');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const notificationService = require('../services/notification.service');

// ===================== NOTIFICATION DASHBOARD =====================
router.get('/notifications', adminMiddleware, async (req, res) => {
  try {
    const totalPatients = await User.countDocuments({ role: 'patient' });
    const upcomingAppointments = await Appointment.countDocuments({
      date: { $gte: new Date() },
      status: { $in: ['pending', 'confirmed'] }
    });
    const todaysAppointments = await Appointment.countDocuments({
      date: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lt: new Date(new Date().setHours(23, 59, 59, 999))
      },
      status: { $in: ['pending', 'confirmed'] }
    });

    res.render('admin/actions-notification', {
      title: 'Send Notifications',
      user: req.session.user,
      totalPatients,
      upcomingAppointments,
      todaysAppointments,
    });
  } catch (error) {
    console.error('Notifications page error:', error);
    req.flash('error_msg', 'Failed to load notifications page');
    res.redirect('/admin/dashboard');
  }
});

// ===================== BROADCAST SMS TO ALL PATIENTS =====================
router.post('/notifications/broadcast', adminMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim().length < 5) {
      req.flash('error_msg', 'Message must be at least 5 characters');
      return res.redirect('/admin/notifications');
    }

    console.log('📢 [BROADCAST] Starting broadcast to all patients...');
    console.log(`📝 Message: "${message.trim().substring(0, 50)}${message.trim().length > 50 ? '…' : ''}"`);

    const patients = await Patient.find({ phone: { $ne: null, $ne: '' } });
    console.log(`👥 Found ${patients.length} patients with phone numbers`);

    if (patients.length === 0) {
      req.flash('error_msg', 'No patients with phone numbers found');
      return res.redirect('/admin/notifications');
    }

    const httpSMSService = require('../services/httpsms');
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (const [index, patient] of patients.entries()) {
      try {
        // Mask phone for logging (show only last 4 digits)
        const maskedPhone = patient.phone.replace(/\d(?=\d{4})/g, '*');
        console.log(`📱 [${index + 1}/${patients.length}] Sending to ${patient.name} (${maskedPhone})...`);

        const result = await httpSMSService.sendSms(patient.phone, message.trim());

        if (result.success) {
          successCount++;
          console.log(`✅ [${index + 1}/${patients.length}] Success: ${patient.name}`);
        } else {
          failCount++;
          const errorMsg = result.error || 'Unknown error';
          errors.push(`${patient.name}: ${errorMsg}`);
          console.log(`❌ [${index + 1}/${patients.length}] Failed: ${patient.name} - ${errorMsg}`);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        failCount++;
        errors.push(`${patient.name}: ${err.message}`);
        console.log(`⚠️ [${index + 1}/${patients.length}] Error: ${patient.name} - ${err.message}`);
      }
    }

    console.log(`📊 [BROADCAST] Summary: ${successCount} successful, ${failCount} failed`);
    if (errors.length > 0) {
      console.log('❌ Errors:', errors);
    }

    req.flash('success_msg', `Broadcast sent: ${successCount} successful, ${failCount} failed.${errors.length > 0 ? ' Errors: ' + errors.join('; ') : ''}`);
    res.redirect('/admin/notifications');
  } catch (error) {
    console.error('❌ Broadcast error:', error);
    req.flash('error_msg', 'Failed to send broadcast: ' + error.message);
    res.redirect('/admin/notifications');
  }
});

// ===================== SEND CUSTOM SMS TO SELECTED GROUP =====================
router.post('/notifications/custom', adminMiddleware, async (req, res) => {
  try {
    const { group, message } = req.body;
    if (!message || message.trim().length < 5) {
      req.flash('error_msg', 'Message must be at least 5 characters');
      return res.redirect('/admin/notifications');
    }

    console.log(`📢 [CUSTOM] Starting custom SMS to group: "${group}"`);
    console.log(`📝 Message: "${message.trim().substring(0, 50)}${message.trim().length > 50 ? '…' : ''}"`);

    let patients = [];

    if (group === 'upcoming') {
      const start = new Date();
      const end = new Date();
      end.setDate(end.getDate() + 7);
      const appointmentIds = await Appointment.find({
        date: { $gte: start, $lt: end },
        status: { $in: ['pending', 'confirmed'] }
      }).distinct('patientId');
      patients = await Patient.find({ userId: { $in: appointmentIds }, phone: { $ne: null, $ne: '' } });
      console.log(`📅 Found ${patients.length} patients with upcoming appointments (next 7 days)`);
    } else if (group === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const appointmentIds = await Appointment.find({
        date: { $gte: start, $lt: end },
        status: { $in: ['pending', 'confirmed'] }
      }).distinct('patientId');
      patients = await Patient.find({ userId: { $in: appointmentIds }, phone: { $ne: null, $ne: '' } });
      console.log(`📅 Found ${patients.length} patients with appointments today`);
    } else if (group === 'all') {
      patients = await Patient.find({ phone: { $ne: null, $ne: '' } });
      console.log(`👥 Found ${patients.length} patients with phone numbers`);
    } else {
      req.flash('error_msg', 'Invalid group selected');
      return res.redirect('/admin/notifications');
    }

    if (patients.length === 0) {
      req.flash('error_msg', 'No patients in selected group with phone numbers');
      return res.redirect('/admin/notifications');
    }

    const httpSMSService = require('../services/httpsms');
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (const [index, patient] of patients.entries()) {
      try {
        const maskedPhone = patient.phone.replace(/\d(?=\d{4})/g, '*');
        console.log(`📱 [${index + 1}/${patients.length}] Sending to ${patient.name} (${maskedPhone})...`);

        const result = await httpSMSService.sendSms(patient.phone, message.trim());

        if (result.success) {
          successCount++;
          console.log(`✅ [${index + 1}/${patients.length}] Success: ${patient.name}`);
        } else {
          failCount++;
          const errorMsg = result.error || 'Unknown error';
          errors.push(`${patient.name}: ${errorMsg}`);
          console.log(`❌ [${index + 1}/${patients.length}] Failed: ${patient.name} - ${errorMsg}`);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        failCount++;
        errors.push(`${patient.name}: ${err.message}`);
        console.log(`⚠️ [${index + 1}/${patients.length}] Error: ${patient.name} - ${err.message}`);
      }
    }

    console.log(`📊 [CUSTOM] Summary: ${successCount} successful, ${failCount} failed`);
    if (errors.length > 0) {
      console.log('❌ Errors:', errors);
    }

    req.flash('success_msg', `Custom SMS sent to ${successCount} patients (${failCount} failed).${errors.length > 0 ? ' Errors: ' + errors.join('; ') : ''}`);
    res.redirect('/admin/notifications');
  } catch (error) {
    console.error('❌ Custom SMS error:', error);
    req.flash('error_msg', 'Failed to send custom SMS: ' + error.message);
    res.redirect('/admin/notifications');
  }
});

// ===================== MANUAL APPOINTMENT REMINDERS =====================
router.post('/notifications/reminders', adminMiddleware, async (req, res) => {
  try {
    console.log('⏰ [REMINDERS] Manually triggering appointment reminders...');
    const results = await notificationService.sendAppointmentRemindersForToday();
    console.log(`📊 [REMINDERS] Results: ${results.length} reminders attempted`);
    if (results.length > 0) {
      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Successful: ${successCount}, ❌ Failed: ${results.length - successCount}`);
      // Log individual results for debugging
      results.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.patient} - ${r.success ? '✅' : '❌'}`);
      });
    } else {
      console.log('ℹ️ No appointments found for tomorrow');
    }

    if (results.length === 0) {
      req.flash('info_msg', 'No appointments found for tomorrow');
    } else {
      const successCount = results.filter(r => r.success).length;
      req.flash('success_msg', `Appointment reminders sent: ${successCount}/${results.length} successful`);
    }
    res.redirect('/admin/notifications');
  } catch (error) {
    console.error('❌ Manual reminders error:', error);
    req.flash('error_msg', 'Failed to send appointment reminders');
    res.redirect('/admin/notifications');
  }
});

// ===================== TEST SMS CONNECTION =====================
router.get('/notifications/test-sms', adminMiddleware, async (req, res) => {
  try {
    console.log('🔌 Testing SMS connection...');
    const httpSMSService = require('../services/httpsms');
    const result = await httpSMSService.testConnection();
    if (result.success) {
      console.log('✅ SMS connection successful!');
      req.flash('success_msg', 'SMS connection successful!');
    } else {
      console.log('❌ SMS connection failed:', result.error || 'Unknown error');
      req.flash('error_msg', 'SMS connection failed: ' + (result.error || 'Unknown error'));
    }
    res.redirect('/admin/notifications');
  } catch (error) {
    console.error('❌ Error testing SMS:', error.message);
    req.flash('error_msg', 'Error testing SMS: ' + error.message);
    res.redirect('/admin/notifications');
  }
});

module.exports = router;
