const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const adminMiddleware = require('../middleware/admin');
const User = require('../models/User');
const { blindIndex } = require('../utils/blindIndex');
const Nurse = require('../models/Nurse');

// ===================== LIST NURSES (MANAGE PAGE) =====================
router.get('/nurses/manage', adminMiddleware, async (req, res) => {
  try {
    // ✅ NO .lean() — User name & email are encrypted
    const nurses = await User.find({ role: 'nurse' })
      .sort({ createdAt: -1 })
      .select('-password');

    // Fetch nurse profile for each
    const nursesWithProfile = await Promise.all(nurses.map(async (nurse) => {
      // ✅ NO .lean() — Nurse profile fields are encrypted
      const profile = await Nurse.findOne({ userId: nurse._id });

      // ✅ Read each field explicitly — getters run → plaintext
      return {
        _id: nurse._id,
        name: nurse.name,               // ← decrypted
        email: nurse.email,             // ← decrypted
        role: nurse.role,
        isActive: nurse.isActive,
        isVerified: nurse.isVerified,
        createdAt: nurse.createdAt,
        updatedAt: nurse.updatedAt,
        profile: profile || null        // Mongoose doc — reads decrypt fine
      };
    }));

    res.render('admin/manage-nurse-accounts', {
      title: 'Manage Nurse Accounts',
      user: req.session.user,
      nurses: nursesWithProfile,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('❌ Admin nurses manage error:', error);
    req.flash('error_msg', 'Failed to load nurses');
    res.redirect('/admin/dashboard');
  }
});

// ===================== EDIT NURSE (GET) =====================
router.get('/nurses/edit/:id', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user || user.role !== 'nurse') {
      req.flash('error_msg', 'Nurse not found');
      return res.redirect('/admin/nurses/manage');
    }
    const profile = await Nurse.findOne({ userId: user._id });
    res.render('admin/edit-nurse', {
      title: 'Edit Nurse',
      user: req.session.user,
      nurse: user,
      profile: profile || {},
    });
  } catch (error) {
    console.error('Edit nurse error:', error);
    req.flash('error_msg', 'Failed to load nurse');
    res.redirect('/admin/nurses/manage');
  }
});

// ===================== UPDATE NURSE (POST) =====================
router.post('/nurses/update/:id', adminMiddleware, async (req, res) => {
  try {
    const {
      name, email, phone, idNumber, dateOfBirth,
      qualification, specialization, yearsOfExperience, licenseNumber,
      isActive
    } = req.body;

    if (!name || !email || !phone || !idNumber || !dateOfBirth) {
      req.flash('error_msg', 'All required fields must be filled');
      return res.redirect(`/admin/nurses/edit/${req.params.id}`);
    }

    // Check email uniqueness
    const existingUser = await User.findOne({
        emailHash: blindIndex(email),
      _id: { $ne: req.params.id }
    });
    if (existingUser) {
      req.flash('error_msg', 'Email already taken');
      return res.redirect(`/admin/nurses/edit/${req.params.id}`);
    }

    // Check ID uniqueness
    const existingNurse = await Nurse.findOne({
      idNumberHash: blindIndex(idNumber),
      userId: { $ne: req.params.id }
    });
    if (existingNurse) {
      req.flash('error_msg', 'ID number already registered to another nurse');
      return res.redirect(`/admin/nurses/edit/${req.params.id}`);
    }

    // Update User
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/admin/nurses/manage');
    }
    user.name = name.trim();
    user.email = email.toLowerCase().trim();
    user.isActive = isActive === 'true' || isActive === 'on';
    await user.save();

    // Calculate age
    const age = calculateAge(new Date(dateOfBirth));

    // Update Nurse profile
    await Nurse.findOneAndUpdate(
      { userId: user._id },
      {
        name: name.trim(),
        phone: phone.trim(),
        idNumber: idNumber.trim(),
        dateOfBirth: new Date(dateOfBirth),
        age: age,
        email: email.toLowerCase().trim(),
        qualification: qualification ? qualification.trim() : '',
        specialization: specialization ? specialization.trim() : '',
        yearsOfExperience: yearsOfExperience ? parseInt(yearsOfExperience) : 0,
        licenseNumber: licenseNumber ? licenseNumber.trim() : '',
        updatedAt: Date.now()
      },
      { upsert: true, new: true }
    );

    req.flash('success_msg', 'Nurse updated successfully');
    res.redirect('/admin/nurses/manage');
  } catch (error) {
    console.error('Update nurse error:', error);
    req.flash('error_msg', 'Failed to update nurse');
    res.redirect(`/admin/nurses/edit/${req.params.id}`);
  }
});

// ===================== CHANGE NURSE PASSWORD =====================
router.post('/nurses/change-password/:id', adminMiddleware, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      req.flash('error_msg', 'Password must be at least 6 characters');
      return res.redirect('/admin/nurses/manage');
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/admin/nurses/manage');
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    req.flash('success_msg', `Password changed successfully! New password: ${newPassword}`);
    res.redirect('/admin/nurses/manage');
  } catch (error) {
    console.error('Change password error:', error);
    req.flash('error_msg', 'Failed to change password');
    res.redirect('/admin/nurses/manage');
  }
});

// ===================== TOGGLE NURSE STATUS =====================
router.post('/nurses/toggle-status/:id', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/admin/nurses/manage');
    }
    user.isActive = !user.isActive;
    await user.save();
    req.flash('success_msg', `Nurse ${user.isActive ? 'activated' : 'deactivated'} successfully`);
    res.redirect('/admin/nurses/manage');
  } catch (error) {
    console.error('Toggle status error:', error);
    req.flash('error_msg', 'Failed to toggle status');
    res.redirect('/admin/nurses/manage');
  }
});

// ===================== Activity Log (Placeholder) =====================
// This is a placeholder – you can implement a logging system later.
// For now, we'll just show a message that it's coming soon.
router.get('/nurses/activity/:id', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user || user.role !== 'nurse') {
      req.flash('error_msg', 'Nurse not found');
      return res.redirect('/admin/nurses/manage');
    }
    // Placeholder: we'll render a simple page with a message
    res.render('admin/nurse-activity', {
      title: `Activity Log: ${user.name}`,
      user: req.session.user,
      nurse: user,
      message: 'Activity log feature coming soon.',
    });
  } catch (error) {
    console.error('Activity log error:', error);
    req.flash('error_msg', 'Failed to load activity log');
    res.redirect('/admin/nurses/manage');
  }
});

// Helper function (must be defined before use)
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

module.exports = router;
