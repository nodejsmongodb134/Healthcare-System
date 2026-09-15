const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');

// ============ VIEW ALL APPOINTMENTS ============
router.get('/view-appointments', async (req, res) => {
  try {
    // Check if user is logged in
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    // Check if user is a patient
    if (req.session.user.role !== 'patient') {
      req.flash('error_msg', 'Access denied. Patient only.');
      return res.redirect('/auth/login');
    }

    // Get all appointments for this patient
    const appointments = await Appointment.find({ 
      patientId: req.session.user.id 
    }).sort({ date: -1 });

    res.render('patient/view-appointments', {
      title: 'My Appointments',
      user: req.session.user,
      appointments: appointments,
    });
  } catch (error) {
    console.error('❌ View appointments error:', error);
    req.flash('error_msg', 'Failed to load appointments');
    res.redirect('/auth/patient-dashboard');
  }
});

// ============ VIEW APPOINTMENT DETAILS ============
router.get('/appointment/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const appointment = await Appointment.findOne({
      _id: req.params.id,
      patientId: req.session.user.id
    });

    if (!appointment) {
      req.flash('error_msg', 'Appointment not found');
      return res.redirect('/patient/view-appointments');
    }

    res.render('patient/appointment-details', {
      title: 'Appointment Details',
      user: req.session.user,
      appointment: appointment
    });
  } catch (error) {
    console.error('❌ Appointment details error:', error);
    req.flash('error_msg', 'Failed to load appointment details');
    res.redirect('/patient/view-appointments');
  }
});

// ============ CANCEL APPOINTMENT ============
router.post('/appointment/cancel/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const appointment = await Appointment.findOne({
      _id: req.params.id,
      patientId: req.session.user.id
    });

    if (!appointment) {
      req.flash('error_msg', 'Appointment not found');
      return res.redirect('/patient/view-appointments');
    }

    // Check if appointment can be cancelled
    if (appointment.status === 'cancelled') {
      req.flash('error_msg', 'Appointment is already cancelled');
      return res.redirect('/patient/view-appointments');
    }

    if (appointment.status === 'completed') {
      req.flash('error_msg', 'Cannot cancel a completed appointment');
      return res.redirect('/patient/view-appointments');
    }

    // Update status to cancelled
    appointment.status = 'cancelled';
    appointment.updatedAt = Date.now();
    await appointment.save();


        // In POST /appointment/cancel/:id, after appointment.save()
    const io = req.app.get('io');
    console.log('📤 Emitting appointment cancel event, io exists?', !!io);
    if (io) {
      io.emit('data-updated', { type: 'appointment' });
      console.log('✅ Emitted data-updated for appointment cancel');
    } else {
      console.error('❌ io is undefined in view-appointment.js');
    }


    console.log('🗑️ Appointment cancelled:', appointment._id);
    req.flash('success_msg', 'Appointment cancelled successfully');
    res.redirect('/patient/view-appointments');
  } catch (error) {
    console.error('❌ Cancel appointment error:', error);
    req.flash('error_msg', 'Failed to cancel appointment');
    res.redirect('/patient/view-appointments');
  }
});

// ============ GET APPOINTMENTS BY STATUS (API) ============
router.get('/appointments/status/:status', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = req.params.status;
    const query = { patientId: req.session.user.id };
    
    if (status !== 'all') {
      query.status = status;
    }

    const appointments = await Appointment.find(query).sort({ date: -1 });

    res.json({
      success: true,
      appointments: appointments
    });
  } catch (error) {
    console.error('❌ Appointments by status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ GET UPCOMING APPOINTMENTS (API) ============
router.get('/appointments/upcoming', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const appointments = await Appointment.find({
      patientId: req.session.user.id,
      date: { $gte: today },
      status: { $in: ['pending', 'confirmed'] }
    }).sort({ date: 1 });

    res.json({
      success: true,
      appointments: appointments
    });
  } catch (error) {
    console.error('❌ Upcoming appointments error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
