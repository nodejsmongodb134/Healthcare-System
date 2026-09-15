const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const User = require('../models/User');

// ============ GET APPOINTMENT PAGE ============
router.get('/appointment', async (req, res) => {
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

    // Get patient profile
    const patient = await Patient.findOne({ userId: req.session.user.id });
    
    // Check if patient has complete profile (has phone number)
    if (!patient || !patient.phone) {
      req.flash('warning_msg', 'Please complete your profile with a phone number before booking an appointment.');
      // Still render the page but show warning
    }

    // Get user's appointments
    const appointments = await Appointment.find({ 
      patientId: req.session.user.id 
    }).sort({ createdAt: -1 }).limit(5);

    res.render('patient/appointment', {
      title: 'Book Appointment',
      user: req.session.user,
      patient: patient || {},
      appointments: appointments || [],
    });
  } catch (error) {
    console.error('❌ Appointment page error:', error);
    req.flash('error_msg', 'Failed to load appointment page');
    res.redirect('/auth/patient-dashboard');
  }
});

// ============ BOOK APPOINTMENT ============
router.post('/appointment/book', async (req, res) => {
  try {
    // Check if user is logged in
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const { patientName, patientEmail, patientPhone, date, time, description } = req.body;

    // Validate required fields
    if (!patientName || !patientEmail || !patientPhone || !date || !time || !description) {
      req.flash('error_msg', 'All fields are required');
      return res.redirect('/patient/appointment');
    }

    // Validate phone number
    if (!patientPhone.match(/^[0-9+\-\s()]{10,15}$/)) {
      req.flash('error_msg', 'Please enter a valid phone number');
      return res.redirect('/patient/appointment');
    }

    // Validate description length
    if (description.length < 10) {
      req.flash('error_msg', 'Description must be at least 10 characters');
      return res.redirect('/patient/appointment');
    }

    if (description.length > 500) {
      req.flash('error_msg', 'Description cannot exceed 500 characters');
      return res.redirect('/patient/appointment');
    }

    // Check if appointment already exists for this date and time
    const existingAppointment = await Appointment.findOne({
      date: new Date(date),
      time: time,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (existingAppointment) {
      req.flash('error_msg', 'This time slot is already booked. Please choose another time.');
      return res.redirect('/patient/appointment');
    }

    // Create appointment
    const appointment = new Appointment({
      patientId: req.session.user.id,
      patientName: patientName.trim(),
      patientEmail: patientEmail.toLowerCase().trim(),
      patientPhone: patientPhone.trim(),
      date: new Date(date),
      time: time,
      description: description.trim(),
      status: 'pending',
      updatedAt: Date.now()
    });

    await appointment.save();
    req.app.get('io').emit('data-updated', { type: 'appointment' });


    // Log the booking
    // In the POST /appointment/book handler, after await appointment.save()
    const io = req.app.get('io');
    console.log('📤 Emitting appointment book event, io exists?', !!io);
    if (io) {
      io.emit('data-updated', { type: 'appointment' });
      console.log('✅ Emitted data-updated for appointment');
    } else {
      console.error('❌ io is undefined in appointment.js');
    }



    console.log('✅ Appointment booked for:', patientName);
    req.flash('success_msg', 'Appointment booked successfully! You will receive a confirmation soon.');
    res.redirect('/patient/appointment');
  } catch (error) {
    console.error('❌ Book appointment error:', error);
    req.flash('error_msg', 'Failed to book appointment. Please try again.');
    res.redirect('/patient/appointment');
  }
});

// ============ GET APPOINTMENT DETAILS ============
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
      return res.redirect('/patient/appointment');
    }

    res.render('patient/appointment-details', {
      title: 'Appointment Details',
      user: req.session.user,
      appointment: appointment
    });
  } catch (error) {
    console.error('❌ Appointment details error:', error);
    req.flash('error_msg', 'Failed to load appointment details');
    res.redirect('/patient/appointment');
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
      return res.redirect('/patient/appointment');
    }

    // Check if appointment can be cancelled (only pending or confirmed)
    if (appointment.status === 'cancelled') {
      req.flash('error_msg', 'Appointment is already cancelled');
      return res.redirect('/patient/appointment');
    }

    if (appointment.status === 'completed') {
      req.flash('error_msg', 'Cannot cancel completed appointment');
      return res.redirect('/patient/appointment');
    }

    appointment.status = 'cancelled';
    appointment.updatedAt = Date.now();
    await appointment.save();
    req.app.get('io').emit('data-updated', { type: 'appointment' });
    

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
    res.redirect('/patient/appointment');
  }
});

// ============ GET ALL APPOINTMENTS (JSON) ============
router.get('/appointments/json', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const appointments = await Appointment.find({ 
      patientId: req.session.user.id 
    }).sort({ date: 1 });

    res.json({
      success: true,
      appointments: appointments
    });
  } catch (error) {
    console.error('❌ Appointments JSON error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ----------------- Nurse Routes -----------------



module.exports = router;
