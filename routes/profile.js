const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Order = require('../models/Order');
const bcrypt = require('bcryptjs');

// ============================================================
// HELPERS
// ============================================================

// Calculate age from date of birth
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

// ============================================================
// GET /patient/profile
// ============================================================
router.get('/profile', async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') {
      req.flash('error_msg', 'Access denied');
      return res.redirect('/auth/login');
    }

    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/auth/login');
    }

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
      user,
      patient: patient || {},              // safe fallback if Patient doc missing
      stats: {
        totalAppointments,
        pendingAppointments,
        confirmedAppointments,
        totalOrders
      }
    });
  } catch (err) {
    console.error('Profile error:', err);
    req.flash('error_msg', 'Failed to load profile');
    res.redirect('/auth/patient-dashboard');
  }
});

// ============================================================
// POST /patient/profile/update
// ============================================================
router.post('/profile/update', async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') {
      req.flash('error_msg', 'Access denied');
      return res.redirect('/auth/login');
    }

    const { phone, idNumber, dateOfBirth, gender, address } = req.body;

    // ---------- Validation ----------
    if (!phone || !phone.trim()) {
      req.flash('error_msg', 'Phone number is required');
      return res.redirect('/patient/profile');
    }

    if (!phone.match(/^[0-9+\-\s()]{10,15}$/)) {
      req.flash('error_msg', 'Please enter a valid phone number');
      return res.redirect('/patient/profile');
    }

    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/auth/login');
    }

    // ---------- Find or create the Patient document ----------
    // Registration only creates a User; the Patient doc may not exist yet.
    let patient = await Patient.findOne({ userId: user._id });

    if (!patient) {
      console.log(`Auto-creating Patient profile for ${user.email}`);
      patient = new Patient({
        userId: user._id,
        name: user.name,
        email: user.email,
        // Required fields get placeholder values that we overwrite below
        idNumber: (idNumber && idNumber.trim()) ? idNumber.trim() : ('PENDING-' + user._id),
        phone: phone.trim(),
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : new Date('1900-01-01')
      });
    }

    // ---------- Apply every editable field ----------
    patient.phone = phone.trim();

    if (idNumber !== undefined && idNumber.trim()) {
      patient.idNumber = idNumber.trim();
    }

    if (dateOfBirth) {
      patient.dateOfBirth = new Date(dateOfBirth);
      patient.age = calculateAge(patient.dateOfBirth);
    }

    if (gender !== undefined) {
      patient.gender = gender;
    }

    if (address !== undefined) {
      patient.address = address.trim();
    }

    patient.updatedAt = Date.now();
    await patient.save();
    console.log(`Patient profile saved for ${user.email}`);

    // ---------- Mark the user's profile as complete ----------
    if (!user.profileComplete) {
      user.profileComplete = true;
      await user.save();

      req.session.user.profileComplete = true;
      req.session.save((err) => {
        if (err) console.error('Session save error:', err);
      });

      console.log(`Marked profileComplete=true for ${user.email}`);
    }

    req.flash('success_msg', 'Profile updated successfully');
    res.redirect('/patient/profile');
  } catch (err) {
    console.error('Profile update error:', err);
    req.flash('error_msg', 'Failed to update profile: ' + err.message);
    res.redirect('/patient/profile');
  }
});

// ============================================================
// GET /patient/change-password
// ============================================================
router.get('/change-password', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'patient') {
    req.flash('error_msg', 'Access denied');
    return res.redirect('/auth/login');
  }
  res.render('patient/change-password', {
    title: 'Change Password',
    user: req.session.user
  });
});

// ============================================================
// POST /patient/change-password
// ============================================================
router.post('/change-password', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      req.flash('error_msg', 'All fields are required');
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
      req.flash('error_msg', 'Password must contain lowercase, uppercase, number, and special character (!@#$%^&*)');
      return res.redirect('/patient/change-password');
    }

    if (newPassword !== confirmPassword) {
      req.flash('error_msg', 'Passwords do not match');
      return res.redirect('/patient/change-password');
    }

    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/patient/change-password');
    }

    if (!(await bcrypt.compare(currentPassword, user.password))) {
      req.flash('error_msg', 'Current password is incorrect');
      return res.redirect('/patient/change-password');
    }

    if (await bcrypt.compare(newPassword, user.password)) {
      req.flash('error_msg', 'New password cannot be the same as current password');
      return res.redirect('/patient/change-password');
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    console.log('Password changed for:', user.email);
    req.flash('success_msg', 'Password changed successfully!');
    res.redirect('/patient/profile');
  } catch (error) {
    console.error('Change password error:', error);
    req.flash('error_msg', 'Failed to change password. Please try again.');
    res.redirect('/patient/change-password');
  }
});

// ============================================================
// GET /patient/profile/json
// ============================================================
router.get('/profile/json', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const patient = await Patient.findOne({ userId: req.session.user.id });
    if (!patient) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const profile = patient.toObject();
    if (patient.dateOfBirth) {
      profile.age = calculateAge(patient.dateOfBirth);
    }

    res.json({ success: true, profile });
  } catch (error) {
    console.error('Profile JSON error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================================
// DELETE /patient/profile/delete
// ============================================================
router.delete('/profile/delete', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    await Patient.findOneAndDelete({ userId: req.session.user.id });
    console.log('Profile deleted for user:', req.session.user.email);

    req.flash('success_msg', 'Profile deleted successfully');
    res.redirect('/patient/profile');
  } catch (error) {
    console.error('Profile deletion error:', error);
    req.flash('error_msg', 'Failed to delete profile');
    res.redirect('/patient/profile');
  }
});

module.exports = router;