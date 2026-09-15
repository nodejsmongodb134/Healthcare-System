// routes/admin-driver.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const adminMiddleware = require('../middleware/admin');
const Driver = require('../models/Driver');
const { blindIndex } = require('../utils/blindIndex');

// Helper: calculate age
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

// Generate random password
function generatePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// ============ EDIT DRIVER (GET) ============
router.get('/drivers/edit/:id', adminMiddleware, async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/admin/drivers');
    }
    res.render('admin/edit-driver', {
      title: 'Edit Driver',
      user: req.session.user,
      driver: driver
    });
  } catch (error) {
    console.error('Edit driver error:', error);
    req.flash('error_msg', 'Failed to load driver');
    res.redirect('/admin/drivers');
  }
});

// ============ UPDATE DRIVER (POST) ============
router.post('/drivers/update/:id', adminMiddleware, async (req, res) => {
  try {
    const {
      name,
      idNumber,
      phone,
      email,
      dateOfBirth,
      licenseNumber,
      vehicleType,
      vehiclePlate,
      status
    } = req.body;

    // Validation
    if (!name || !idNumber || !phone || !email || !dateOfBirth) {
      req.flash('error_msg', 'All required fields must be filled');
      return res.redirect(`/admin/drivers/edit/${req.params.id}`);
    }

    if (!phone.match(/^[0-9+\-\s()]{10,15}$/)) {
      req.flash('error_msg', 'Please enter a valid phone number');
      return res.redirect(`/admin/drivers/edit/${req.params.id}`);
    }

    if (!email.match(/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/)) {
      req.flash('error_msg', 'Please enter a valid email address');
      return res.redirect(`/admin/drivers/edit/${req.params.id}`);
    }

    // Check duplicate ID (blind index)
    const existingId = await Driver.findOne({
      idNumberHash: blindIndex(idNumber),
      _id: { $ne: req.params.id }
    });
    if (existingId) {
      req.flash('error_msg', 'ID number already registered to another driver');
      return res.redirect(`/admin/drivers/edit/${req.params.id}`);
    }

    // Check duplicate email (blind index)
    const existingEmail = await Driver.findOne({
      emailHash: blindIndex(email),
      _id: { $ne: req.params.id }
    });
    if (existingEmail) {
      req.flash('error_msg', 'Email already registered to another driver');
      return res.redirect(`/admin/drivers/edit/${req.params.id}`);
    }

    const age = calculateAge(new Date(dateOfBirth));

    await Driver.findByIdAndUpdate(req.params.id, {
      name: name.trim(),
      idNumber: idNumber.trim(),
      phone: phone.trim(),
      email: email.toLowerCase().trim(),
      dateOfBirth: new Date(dateOfBirth),
      age: age,
      licenseNumber: licenseNumber ? licenseNumber.trim() : null,
      vehicleType: vehicleType || null,
      vehiclePlate: vehiclePlate ? vehiclePlate.trim() : null,
      status: status || 'active',
      updatedAt: Date.now()
    });

    req.flash('success_msg', 'Driver updated successfully');
    res.redirect('/admin/drivers');
  } catch (error) {
    console.error('Update driver error:', error);
    req.flash('error_msg', 'Failed to update driver');
    res.redirect(`/admin/drivers/edit/${req.params.id}`);
  }
});

// ============ DELETE DRIVER ============
router.post('/drivers/delete/:id', adminMiddleware, async (req, res) => {
  try {
    const driver = await Driver.findByIdAndDelete(req.params.id);
    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/admin/drivers');
    }
    req.flash('success_msg', `Driver ${driver.name} deleted successfully`);
    res.redirect('/admin/drivers');
  } catch (error) {
    console.error('Delete driver error:', error);
    req.flash('error_msg', 'Failed to delete driver');
    res.redirect('/admin/drivers');
  }
});

// ============ RESET DRIVER PASSWORD ============
router.post('/drivers/reset-password/:id', adminMiddleware, async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/admin/drivers');
    }

    const newPassword = generatePassword();
    const salt = await bcrypt.genSalt(10);
    driver.password = await bcrypt.hash(newPassword, salt);
    driver.updatedAt = Date.now();
    await driver.save();

    req.flash(
      'success_msg',
      `Password reset for ${driver.name}. New temporary password: ${newPassword} — send securely.`
    );
    res.redirect('/admin/drivers');
  } catch (error) {
    console.error('Reset password error:', error);
    req.flash('error_msg', 'Failed to reset password');
    res.redirect('/admin/drivers');
  }
});

// ============ TOGGLE DRIVER STATUS ============
router.post('/drivers/status/:id', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['active', 'inactive', 'on-leave'];
    if (!validStatuses.includes(status)) {
      req.flash('error_msg', 'Invalid status');
      return res.redirect('/admin/drivers');
    }

    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/admin/drivers');
    }

    driver.status = status;
    driver.updatedAt = Date.now();
    await driver.save();

    req.flash('success_msg', `Driver status updated to ${status}`);
    res.redirect('/admin/drivers');
  } catch (error) {
    console.error('Status update error:', error);
    req.flash('error_msg', 'Failed to update status');
    res.redirect('/admin/drivers');
  }
});

module.exports = router;