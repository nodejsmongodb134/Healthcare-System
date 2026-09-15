// routes/nurse-patients.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const Message = require('../models/Message');
const Order = require('../models/Order');
const { plainify } = require('../utils/plainify');

// ============ NURSE PATIENTS PAGE ============
router.get('/nurse-patients', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    // ✅ NO .lean() — name & email are encrypted
    const patients = await User.find({ role: 'patient' }).sort({ createdAt: -1 });

    const patientsWithProfile = await Promise.all(patients.map(async (patient) => {
      // ✅ NO .lean() — profile fields are encrypted
      const profile = await Patient.findOne({ userId: patient._id });

      // ✅ Read each field explicitly — getters run → plaintext
      return {
        _id: patient._id,
        name: patient.name,               // ← decrypted plaintext
        email: patient.email,             // ← decrypted plaintext
        role: patient.role,
        isVerified: patient.isVerified,
        createdAt: patient.createdAt,
        hasProfile: !!profile,
        profile: profile || null          // Mongoose doc — safe, getters run in view
      };
    }));

    res.render('nurse/nurse-patient', {
      title: 'Patient Management',
      user: req.session.user,
      patients: patientsWithProfile,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('❌ Nurse patients error:', error);
    req.flash('error_msg', 'Failed to load patients');
    res.redirect('/auth/nurse-dashboard');
  }
});

// ============ UPDATE CHRONIC MEDICATION ============
router.post('/patient/chronic/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const patient = await User.findById(req.params.id);
    if (!patient || patient.role !== 'patient') {
      req.flash('error_msg', 'Patient not found');
      return res.redirect('/nurse/nurse-patients');
    }

    const { isChronic, medicationName, refillIntervalDays, startTimer } = req.body;

    let profile = await Patient.findOne({ userId: patient._id });
    if (!profile) {
      profile = new Patient({
        userId: patient._id,
        name: patient.name,       // ← decrypted via getter
        email: patient.email,     // ← decrypted via getter
        idNumber: req.body.idNumber || 'N/A',
        phone: req.body.phone || 'N/A',
        dateOfBirth: req.body.dateOfBirth || new Date()
      });
    }

    profile.isChronic = isChronic === 'true' || isChronic === 'on';
    profile.medicationName = medicationName ? medicationName.trim() : null;
    profile.refillIntervalDays = refillIntervalDays ? parseInt(refillIntervalDays) : null;

    if (startTimer === 'true' && profile.refillIntervalDays) {
      profile.lastRefillDate = new Date();
      profile.nextRefillDate = new Date(Date.now() + profile.refillIntervalDays * 24 * 60 * 60 * 1000);
    }

    profile.updatedAt = Date.now();
    await profile.save();

    req.flash('success_msg', 'Patient chronic medication updated successfully');
    res.redirect('/nurse/nurse-patients');
  } catch (error) {
    console.error('❌ Chronic medication update error:', error);
    req.flash('error_msg', 'Failed to update chronic medication');
    res.redirect('/nurse/nurse-patients');
  }
});

// ============ VIEW PATIENT DETAILS (API) ============
router.get('/patient/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.session.user.role !== 'nurse') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const patient = await User.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const profile = await Patient.findOne({ userId: patient._id });
    const appointments = await Appointment.find({ patientId: patient._id }).sort({ createdAt: -1 }).limit(10);
    const messages = await Message.find({ patientId: patient._id }).sort({ createdAt: -1 }).limit(10);
    const orders = await Order.find({ patientId: patient._id }).sort({ createdAt: -1 }).limit(10);

    // ✅ plainify forces getters → plaintext in JSON
    res.json({
      success: true,
      patient: plainify(patient),
      profile: profile ? plainify(profile) : null,
      appointments: plainify(appointments),
      messages: plainify(messages),
      orders: plainify(orders)
    });
  } catch (error) {
    console.error('❌ View patient error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ GET PATIENT PROFILE ============
router.get('/patient/profile/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const profile = await Patient.findOne({ userId: req.params.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({
      success: true,
      profile: plainify(profile)
    });
  } catch (error) {
    console.error('❌ Patient profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ GET PATIENT APPOINTMENTS ============
router.get('/patient/appointments/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const appointments = await Appointment.find({ patientId: req.params.id }).sort({ createdAt: -1 });
    res.json({ success: true, appointments: plainify(appointments) });
  } catch (error) {
    console.error('❌ Patient appointments error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ GET PATIENT MESSAGES ============
router.get('/patient/messages/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const messages = await Message.find({ patientId: req.params.id }).sort({ createdAt: -1 });
    res.json({ success: true, messages: plainify(messages) });
  } catch (error) {
    console.error('❌ Patient messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ GET PATIENT ORDERS ============
router.get('/patient/orders/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const orders = await Order.find({ patientId: req.params.id }).sort({ createdAt: -1 });
    res.json({ success: true, orders: plainify(orders) });
  } catch (error) {
    console.error('❌ Patient orders error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;