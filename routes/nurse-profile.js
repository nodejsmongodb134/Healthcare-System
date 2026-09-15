// routes/nurse-profile.js
const express = require('express');
const router = express.Router();
const Nurse = require('../models/Nurse');
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

// ============ GET NURSE PROFILE PAGE ============
router.get('/profile', async (req, res) => {
  console.log('📋 GET /nurse/profile called');
  console.log('👤 Session user:', req.session.user);
  
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    let nurse = await Nurse.findOne({ userId: req.session.user.id });
    
    if (!nurse) {
      nurse = {
        name: req.session.user.name,
        email: req.session.user.email,
        idNumber: '',
        phone: '',
        dateOfBirth: null,
        age: '',
        qualification: '',
        specialization: '',
        yearsOfExperience: '',
        licenseNumber: ''
      };
    } else {
      if (nurse.dateOfBirth) {
        nurse.age = calculateAge(nurse.dateOfBirth);
      }
    }

    const user = await User.findById(req.session.user.id);
    const isProfileComplete = user ? user.profileComplete : false;

    console.log('📋 isProfileComplete:', isProfileComplete);

    res.render('nurse/profile', {
      title: 'Nurse Profile',
      user: req.session.user,
      nurse: nurse,
      isProfileComplete: isProfileComplete,
    });
  } catch (error) {
    console.error('❌ Nurse profile error:', error);
    req.flash('error_msg', 'Failed to load profile');
    res.redirect('/auth/nurse-dashboard');
  }
});

// ============ UPDATE NURSE PROFILE ============
router.post('/profile/update', async (req, res) => {
  console.log('📝 POST /nurse/profile/update called');
  console.log('📦 Request body:', req.body);
  
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const { 
      name, idNumber, phone, email, dateOfBirth,
      qualification, specialization, yearsOfExperience, licenseNumber 
    } = req.body;

    // Validate required fields
    if (!name || !idNumber || !phone || !email || !dateOfBirth) {
      req.flash('error_msg', 'All required fields must be filled');
      return res.redirect('/nurse/profile');
    }

    if (!phone.match(/^[0-9+\-\s()]{10,15}$/)) {
      req.flash('error_msg', 'Please enter a valid phone number');
      return res.redirect('/nurse/profile');
    }

    if (idNumber.length < 5) {
      req.flash('error_msg', 'Please enter a valid ID number');
      return res.redirect('/nurse/profile');
    }

    // Check if email exists for another user
    const existingUser = await User.findOne({
      emailHash: blindIndex(email),
      _id: { $ne: req.session.user.id }
    });
    if (existingUser) {
      req.flash('error_msg', 'Email is already taken by another user');
      return res.redirect('/nurse/profile');
    }

    // Check if ID number exists for another nurse
    const existingNurse = await Nurse.findOne({
      idNumberHash: blindIndex(idNumber),
      userId: { $ne: req.session.user.id }
    });
    if (existingNurse) {
      req.flash('error_msg', 'ID number is already registered');
      return res.redirect('/nurse/profile');
    }

    const age = calculateAge(new Date(dateOfBirth));

    // Find or create nurse
    let nurse = await Nurse.findOne({ userId: req.session.user.id });
    
    if (nurse) {
      nurse.name = name.trim();
      nurse.idNumber = idNumber.trim();
      nurse.phone = phone.trim();
      nurse.email = email.toLowerCase().trim();
      nurse.dateOfBirth = new Date(dateOfBirth);
      nurse.age = age;
      nurse.qualification = qualification ? qualification.trim() : '';
      nurse.specialization = specialization ? specialization.trim() : '';
      nurse.yearsOfExperience = yearsOfExperience ? parseInt(yearsOfExperience) : 0;
      nurse.licenseNumber = licenseNumber ? licenseNumber.trim() : '';
      nurse.updatedAt = Date.now();
      await nurse.save();
    } else {
      nurse = new Nurse({
        userId: req.session.user.id,
        name: name.trim(),
        idNumber: idNumber.trim(),
        phone: phone.trim(),
        email: email.toLowerCase().trim(),
        dateOfBirth: new Date(dateOfBirth),
        age: age,
        qualification: qualification ? qualification.trim() : '',
        specialization: specialization ? specialization.trim() : '',
        yearsOfExperience: yearsOfExperience ? parseInt(yearsOfExperience) : 0,
        licenseNumber: licenseNumber ? licenseNumber.trim() : ''
      });
      await nurse.save();
    }

    // Update user's name and email
    req.session.user.name = name.trim();
    req.session.user.email = email.toLowerCase().trim();
    
    // FIX: Mark profile as complete and VERIFY it was saved
    const updatedUser = await User.findByIdAndUpdate(
      req.session.user.id, 
      {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        profileComplete: true
      },
      { new: true } // Return the updated document
    );

    console.log('📋 Updated user profileComplete:', updatedUser.profileComplete);

    // FIX: Update session with profileComplete
    req.session.user.profileComplete = true;
    
    // FIX: Save session explicitly
    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error:', err);
      } else {
        console.log('✅ Session saved with profileComplete: true');
        console.log('📋 Session user after save:', req.session.user);
      }
    });

    console.log('✅ Nurse profile updated for:', email);
    req.flash('success_msg', 'Profile completed successfully! You can now access all features.');
    
    // FIX: Redirect to dashboard
    return res.redirect('/auth/nurse-dashboard');
  } catch (error) {
    console.error('❌ Nurse profile update error:', error);
    
    if (error.code === 11000) {
      if (error.keyPattern && error.keyPattern.idNumber) {
        req.flash('error_msg', 'ID number is already registered');
      } else {
        req.flash('error_msg', 'Profile update failed. Please try again.');
      }
    } else {
      req.flash('error_msg', 'Failed to update profile. Please try again.');
    }
    res.redirect('/nurse/profile');
  }
});

// ============ CHANGE PASSWORD ============
router.get('/change-password', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    res.render('nurse/change-password', {
      title: 'Change Password',
      user: req.session.user,
    });
  } catch (error) {
    console.error('❌ Change password page error:', error);
    req.flash('error_msg', 'Failed to load change password page');
    res.redirect('/nurse/profile');
  }
});

router.post('/change-password', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      req.flash('error_msg', 'All fields are required');
      return res.redirect('/nurse/change-password');
    }

    if (newPassword.length < 6) {
      req.flash('error_msg', 'New password must be at least 6 characters');
      return res.redirect('/nurse/change-password');
    }

    const hasLowercase = /[a-z]/.test(newPassword);
    const hasUppercase = /[A-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecial = /[!@#$%^&*]/.test(newPassword);

    if (!hasLowercase || !hasUppercase || !hasNumber || !hasSpecial) {
      req.flash('error_msg', 'Password must contain at least one lowercase, uppercase, number, and special character');
      return res.redirect('/nurse/change-password');
    }

    if (newPassword !== confirmPassword) {
      req.flash('error_msg', 'Passwords do not match');
      return res.redirect('/nurse/change-password');
    }

    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/nurse/change-password');
    }

    const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordCorrect) {
      req.flash('error_msg', 'Current password is incorrect');
      return res.redirect('/nurse/change-password');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    console.log('✅ Password changed for nurse:', user.email);
    req.flash('success_msg', 'Password changed successfully!');
    res.redirect('/nurse/profile');
  } catch (error) {
    console.error('❌ Change password error:', error);
    req.flash('error_msg', 'Failed to change password');
    res.redirect('/nurse/change-password');
  }
});

// ============ CHECK PROFILE STATUS ============
router.get('/check-status', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.json({ error: 'Not logged in' });
    }
    
    const user = await User.findById(req.session.user.id);
    res.json({
      userId: user._id,
      email: user.email,
      profileComplete: user.profileComplete,
      sessionProfileComplete: req.session.user.profileComplete,
      session: req.session.user
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

module.exports = router;
