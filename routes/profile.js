const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const User = require('../models/User');
const { blindIndex } = require('../utils/blindIndex');
const bcrypt = require('bcryptjs');

// Helper function to calculate age
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const today = new Date();
  const dob = new Date(dateOfBirth);
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

// ============ GET PROFILE PAGE ============
router.get('/profile', async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') {
      req.flash('error_msg', 'Access denied');
      return res.redirect('/auth/login');
    }

    const User = require('../models/User');
    const Patient = require('../models/Patient');
    const Appointment = require('../models/Appointment');
    const Order = require('../models/Order');

    const user = await User.findById(req.session.user.id);
    const patient = await Patient.findOne({ userId: user._id });

    const [
      totalAppointments,
      pendingAppointments,
      confirmedAppointments,
      totalOrders
    ] = await Promise.all([
      Appointment.countDocuments({ patientId: user._id }),
      Appointment.countDocuments({ patientId: user._id, status: 'pending' }),
      Appointment.countDocuments({ patientId: user._id, status: 'confirmed' }),
      Order.countDocuments({ patientId: user._id })
    ]);

    res.render('patient/profile', {
      title: 'My Profile',
      user: user,
      patient: patient,
      stats: {
        totalAppointments,
        pendingAppointments,
        confirmedAppointments,
        totalOrders
      },
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (err) {
    console.error('❌ Profile error:', err);
    req.flash('error_msg', 'Failed to load profile');
    res.redirect('/auth/patient-dashboard');
  }
});

// POST /patient/profile/update
router.post('/profile/update', async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') {
      req.flash('error_msg', 'Access denied');
      return res.redirect('/auth/login');
    }

    const User = require('../models/User');
    const Patient = require('../models/Patient');

    const {
      phone,
      idNumber,
      dateOfBirth,
      gender,
      address
    } = req.body;

    // Basic validation
    if (!phone || !phone.trim()) {
      req.flash('error_msg', 'Phone number is required');
      return res.redirect('/patient/profile');
    }

    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/auth/login');
    }

    const patient = await Patient.findOne({ userId: user._id });
    if (!patient) {
      req.flash('error_msg', 'Patient profile not found');
      return res.redirect('/patient/profile');
    }

    // ✅ Assign every editable field
    patient.phone = phone.trim();

    if (idNumber !== undefined) {
      patient.idNumber = idNumber.trim();
    }

    if (dateOfBirth) {
      patient.dateOfBirth = new Date(dateOfBirth);
      // Optionally recompute age
      const diffMs = Date.now() - patient.dateOfBirth.getTime();
      patient.age = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25));
    }

    // ✅ THE TWO FIELDS THAT WERE MISSING
    if (gender !== undefined) {
      patient.gender = gender;
    }
    if (address !== undefined) {
      patient.address = address.trim();
    }

    patient.updatedAt = Date.now();
    await patient.save();

    req.flash('success_msg', 'Profile updated successfully');
    res.redirect('/patient/profile');
  } catch (err) {
    console.error('❌ Profile update error:', err);
    req.flash('error_msg', 'Failed to update profile: ' + err.message);
    res.redirect('/patient/profile');
  }
});

// ============ GET CHANGE PASSWORD PAGE ============
router.get('/change-password', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'patient') {
      req.flash('error_msg', 'Access denied. Patient only.');
      return res.redirect('/auth/login');
    }

    res.render('patient/change-password', {
      title: 'Change Password',
      user: req.session.user,
    });
  } catch (error) {
    console.error('❌ Change password page error:', error);
    req.flash('error_msg', 'Failed to load change password page');
    res.redirect('/patient/profile');
  }
});

// ============ POST CHANGE PASSWORD ============
router.post('/change-password', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      req.flash('error_msg', 'All fields are required: Current Password, New Password, and Confirm Password');
      return res.redirect('/patient/change-password');
    }

    if (newPassword.length < 6) {
      req.flash('error_msg', 'New password must be at least 6 characters long');
      return res.redirect('/patient/change-password');
    }

    const hasLowercase = /[a-z]/.test(newPassword);
    const hasUppercase = /[A-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecial = /[!@#$%^&*]/.test(newPassword);

    if (!hasLowercase || !hasUppercase || !hasNumber || !hasSpecial) {
      req.flash('error_msg', 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character (!@#$%^&*)');
      return res.redirect('/patient/change-password');
    }

    if (newPassword !== confirmPassword) {
      req.flash('error_msg', 'New password and confirm password do not match');
      return res.redirect('/patient/change-password');
    }

    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/patient/change-password');
    }

    const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordCorrect) {
      req.flash('error_msg', 'Current password is incorrect');
      return res.redirect('/patient/change-password');
    }

    const isSameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (isSameAsCurrent) {
      req.flash('error_msg', 'New password cannot be the same as current password');
      return res.redirect('/patient/change-password');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    console.log('✅ Password changed successfully for user:', user.email);
    req.flash('success_msg', 'Password changed successfully!');
    res.redirect('/patient/profile');
  } catch (error) {
    console.error('❌ Change password error:', error);
    req.flash('error_msg', 'Failed to change password. Please try again.');
    res.redirect('/patient/change-password');
  }
});

// ============ GET PROFILE JSON (for API) ============
router.get('/profile/json', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const patient = await Patient.findOne({ userId: req.session.user.id });
    if (!patient) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (patient.dateOfBirth) {
      patient.age = calculateAge(patient.dateOfBirth);
    }

    res.json({
      success: true,
      profile: patient
    });
  } catch (error) {
    console.error('❌ Profile JSON error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ DELETE PROFILE ============
router.delete('/profile/delete', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    await Patient.findOneAndDelete({ userId: req.session.user.id });
    console.log('🗑️ Profile deleted for user:', req.session.user.email);
    
    req.flash('success_msg', 'Profile deleted successfully');
    res.redirect('/patient/profile');
  } catch (error) {
    console.error('❌ Profile deletion error:', error);
    req.flash('error_msg', 'Failed to delete profile');
    res.redirect('/patient/profile');
  }
});

module.exports = router;
