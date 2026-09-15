const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const User = require('../models/User');

// ============ NURSE APPOINTMENTS PAGE ============
router.get('/nurse-appointments', async (req, res) => {
  try {
    // Check if user is logged in
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    // Check if user is a nurse
    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    // Get all appointments
    const appointments = await Appointment.find().sort({ createdAt: -1 });

    res.render('nurse/nurse-appointment', {
      title: 'Manage Appointments',
      user: req.session.user,
      appointments: appointments,
    });
  } catch (error) {
    console.error('❌ Nurse appointments error:', error);
    req.flash('error_msg', 'Failed to load appointments');
    res.redirect('/auth/nurse-dashboard');
  }
});

// ============ UPDATE APPOINTMENT STATUS ============
router.post('/appointment/status', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const { appointmentId, status } = req.body;

    // Validate status
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
    if (!validStatuses.includes(status)) {
      req.flash('error_msg', 'Invalid status');
      return res.redirect('/nurse/nurse-appointments');
    }

    // Find and update appointment
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      req.flash('error_msg', 'Appointment not found');
      return res.redirect('/nurse/nurse-appointments');
    }

    appointment.status = status;
    appointment.updatedAt = Date.now();
    await appointment.save();
    req.app.get('io').emit('data-updated', { type: 'appointment' });



    // After appointment.save() in status update
    const io = req.app.get('io');
    console.log('📤 Emitting appointment status update, io exists?', !!io);
    if (io) {
      io.emit('data-updated', { type: 'appointment' });
      console.log('✅ Emitted data-updated for appointment status');
    } else {
      console.error('❌ io is undefined in nurse-appointment.js (status)');
    }





    console.log(`✅ Appointment ${appointmentId} updated to ${status}`);
    req.flash('success_msg', `Appointment status updated to ${status.charAt(0).toUpperCase() + status.slice(1)}`);
    res.redirect('/nurse/nurse-appointments');
  } catch (error) {
    console.error('❌ Update appointment status error:', error);
    req.flash('error_msg', 'Failed to update appointment status');
    res.redirect('/nurse/nurse-appointments');
  }
});

// ============ RESCHEDULE APPOINTMENT ============
router.post('/appointment/reschedule', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const { appointmentId, date, time } = req.body;

    // Validate required fields
    if (!appointmentId || !date || !time) {
      req.flash('error_msg', 'Please provide new date and time');
      return res.redirect('/nurse/nurse-appointments');
    }

    // Find appointment
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      req.flash('error_msg', 'Appointment not found');
      return res.redirect('/nurse/nurse-appointments');
    }

    // Check if appointment is cancelled
    if (appointment.status === 'cancelled') {
      req.flash('error_msg', 'Cannot reschedule a cancelled appointment');
      return res.redirect('/nurse/nurse-appointments');
    }

    // Check if new time slot is available
    const existingAppointment = await Appointment.findOne({
      _id: { $ne: appointmentId },
      date: new Date(date),
      time: time,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (existingAppointment) {
      req.flash('error_msg', 'This time slot is already booked. Please choose another time.');
      return res.redirect('/nurse/nurse-appointments');
    }

    // Update appointment
    appointment.date = new Date(date);
    appointment.time = time;
    appointment.updatedAt = Date.now();
    await appointment.save();
    req.app.get('io').emit('data-updated', { type: 'appointment' });


    // After appointment.save() in reschedule
    const io2 = req.app.get('io');
    console.log('📤 Emitting appointment reschedule, io exists?', !!io2);
    if (io2) {
      io2.emit('data-updated', { type: 'appointment' });
      console.log('✅ Emitted data-updated for appointment reschedule');
    } else {
      console.error('❌ io is undefined in nurse-appointment.js (reschedule)');
    }



    console.log(`🔄 Appointment ${appointmentId} rescheduled to ${date} at ${time}`);
    req.flash('success_msg', `Appointment rescheduled successfully to ${new Date(date).toLocaleDateString()} at ${time}`);
    res.redirect('/nurse/nurse-appointments');
  } catch (error) {
    console.error('❌ Reschedule appointment error:', error);
    req.flash('error_msg', 'Failed to reschedule appointment');
    res.redirect('/nurse/nurse-appointments');
  }
});

// ============ VIEW APPOINTMENT DETAILS ============
router.get('/appointment/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      req.flash('error_msg', 'Appointment not found');
      return res.redirect('/nurse/nurse-appointments');
    }

    res.render('nurse/appointment-details', {
      title: 'Appointment Details',
      user: req.session.user,
      appointment: appointment
    });
  } catch (error) {
    console.error('❌ View appointment error:', error);
    req.flash('error_msg', 'Failed to load appointment details');
    res.redirect('/nurse/nurse-appointments');
  }
});

// ============ GET APPOINTMENTS BY STATUS (API) ============
router.get('/appointments/status/:status', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = req.params.status;
    const query = {};
    
    if (status !== 'all') {
      query.status = status;
    }

    const appointments = await Appointment.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      appointments: appointments
    });
  } catch (error) {
    console.error('❌ Appointments by status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
