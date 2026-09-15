const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const adminMiddleware = require('../middleware/admin');
const User = require('../models/User');
const { blindIndex } = require('../utils/blindIndex');
const Patient = require('../models/Patient');

// Helper: calculate age (same as other routes)
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

// ===================== LIST PATIENTS (MANAGE PAGE) =====================
router.get('/patients/manage', adminMiddleware, async (req, res) => {
  try {
    const patients = await User.find({ role: 'patient' }).sort({ createdAt: -1 }).select('-password');
    res.render('admin/manage-patient-accounts', {
      title: 'Manage Patients',
      user: req.session.user,
      patients: patients,
    });
  } catch (error) {
    console.error('Manage patients error:', error);
    req.flash('error_msg', 'Failed to load patients');
    res.redirect('/admin/dashboard');
  }
});

// ===================== EDIT PATIENT (GET) =====================
router.get('/patients/edit/:id', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user || user.role !== 'patient') {
      req.flash('error_msg', 'Patient not found');
      return res.redirect('/admin/patients/manage');
    }
    const profile = await Patient.findOne({ userId: user._id });
    res.render('admin/edit-patient', {
      title: 'Edit Patient',
      user: req.session.user,
      patient: user,
      profile: profile || {},
    });
  } catch (error) {
    console.error('Edit patient error:', error);
    req.flash('error_msg', 'Failed to load patient');
    res.redirect('/admin/patients/manage');
  }
});

// ===================== UPDATE PATIENT (POST) =====================
router.post('/patients/update/:id', adminMiddleware, async (req, res) => {
  try {
    const { name, email, phone, idNumber, dateOfBirth, isActive } = req.body;

    if (!name || !email || !phone || !idNumber || !dateOfBirth) {
      req.flash('error_msg', 'All required fields must be filled');
      return res.redirect(`/admin/patients/edit/${req.params.id}`);
    }

    // Check email uniqueness
    const existingUser = await User.findOne({
      emailHash: blindIndex(email),
      _id: { $ne: req.params.id }
    });
    if (existingUser) {
      req.flash('error_msg', 'Email already taken');
      return res.redirect(`/admin/patients/edit/${req.params.id}`);
    }

    // Update User
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/admin/patients/manage');
    }
    user.name = name.trim();
    user.email = email.toLowerCase().trim();
    user.isActive = isActive === 'true' || isActive === 'on'; // handle checkbox
    await user.save();

    // Update Patient profile
    const age = calculateAge(new Date(dateOfBirth));
    await Patient.findOneAndUpdate(
      { userId: user._id },
      {
        name: name.trim(),
        phone: phone.trim(),
        idNumber: idNumber.trim(),
        dateOfBirth: new Date(dateOfBirth),
        age: age,
        email: email.toLowerCase().trim(),
        updatedAt: Date.now()
      },
      { upsert: true, new: true }
    );

    req.flash('success_msg', 'Patient updated successfully');
    res.redirect('/admin/patients/manage');
  } catch (error) {
    console.error('Update patient error:', error);
    req.flash('error_msg', 'Failed to update patient');
    res.redirect(`/admin/patients/edit/${req.params.id}`);
  }
});

// ===================== CHANGE PATIENT PASSWORD =====================
router.post('/patients/change-password/:id', adminMiddleware, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      req.flash('error_msg', 'Password must be at least 6 characters');
      return res.redirect('/admin/patients/manage');
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/admin/patients/manage');
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    req.flash('success_msg', `Password changed successfully! New password: ${newPassword}`);
    res.redirect('/admin/patients/manage');
  } catch (error) {
    console.error('Change password error:', error);
    req.flash('error_msg', 'Failed to change password');
    res.redirect('/admin/patients/manage');
  }
});

// ===================== TOGGLE PATIENT STATUS =====================
router.post('/patients/toggle-status/:id', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/admin/patients/manage');
    }
    user.isActive = !user.isActive;
    await user.save();
    req.flash('success_msg', `Patient ${user.isActive ? 'activated' : 'deactivated'} successfully`);
    res.redirect('/admin/patients/manage');
  } catch (error) {
    console.error('Toggle status error:', error);
    req.flash('error_msg', 'Failed to toggle status');
    res.redirect('/admin/patients/manage');
  }
});

// ===================== DELETE PATIENT =====================
router.post('/patients/delete/:id', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/admin/patients/manage');
    }
    if (user.role !== 'patient') {
      req.flash('error_msg', 'User is not a patient');
      return res.redirect('/admin/patients/manage');
    }
    // Delete profile
    await Patient.findOneAndDelete({ userId: user._id });
    await user.deleteOne();
    req.flash('success_msg', 'Patient deleted successfully');
    res.redirect('/admin/patients/manage');
  } catch (error) {
    console.error('Delete patient error:', error);
    req.flash('error_msg', 'Failed to delete patient');
    res.redirect('/admin/patients/manage');
  }
});

module.exports = router;
