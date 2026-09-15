const express = require('express');
const router = express.Router();
const { blindIndex } = require('../utils/blindIndex');
const Driver = require('../models/Driver');
const bcrypt = require('bcryptjs');

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

// ============ GET DRIVER PAGE (Create + List) ============
router.get('/create-driver', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const drivers = await Driver.find().sort({ createdAt: -1 });

    res.render('nurse/create-driver', {
      title: 'Manage Drivers',
      user: req.session.user,
      drivers: drivers,
    });
  } catch (error) {
    console.error('❌ Driver page error:', error);
    req.flash('error_msg', 'Failed to load driver page');
    res.redirect('/auth/nurse-dashboard');
  }
});

// ============ CREATE DRIVER ============
router.post('/driver/create', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const { 
      name, 
      idNumber, 
      phone, 
      email, 
      dateOfBirth, 
      licenseNumber, 
      vehicleType, 
      vehiclePlate 
    } = req.body;

    console.log('📝 Creating driver:', { name, email, idNumber, phone });

    // Validate required fields
    if (!name || !idNumber || !phone || !email || !dateOfBirth) {
      req.flash('error_msg', 'All required fields must be filled');
      return res.redirect('/nurse/create-driver');
    }

    // Validate phone
    if (!phone.match(/^[0-9+\-\s()]{10,15}$/)) {
      req.flash('error_msg', 'Please enter a valid phone number');
      return res.redirect('/nurse/create-driver');
    }

    // Validate email
    if (!email.match(/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/)) {
      req.flash('error_msg', 'Please enter a valid email address');
      return res.redirect('/nurse/create-driver');
    }

    // Check if ID number exists
    const existingId = await Driver.findOne({ idNumberHash: blindIndex(idNumber) });
    if (existingId) {
      console.log('❌ ID number already exists:', idNumber);
      req.flash('error_msg', `ID number "${idNumber}" is already registered to ${existingId.name}`);
      return res.redirect('/nurse/create-driver');
    }

    // Check if email exists
    const existingEmail = await Driver.findOne({ emailHash: blindIndex(email) });
    if (existingEmail) {
      console.log('❌ Email already exists:', email);
      req.flash('error_msg', `Email "${email}" is already registered to ${existingEmail.name}`);
      return res.redirect('/nurse/create-driver');
    }

    // Calculate age
    const age = calculateAge(new Date(dateOfBirth));

    // Generate random password
    const generatedPassword = generatePassword();
    console.log('🔑 Generated password:', generatedPassword);

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(generatedPassword, salt);

    // Create driver
    const driver = new Driver({
      name: name.trim(),
      idNumber: idNumber.trim(),
      phone: phone.trim(),
      email: email.toLowerCase().trim(),
      dateOfBirth: new Date(dateOfBirth),
      age: age,
      password: hashedPassword,
      licenseNumber: licenseNumber ? licenseNumber.trim() : null,
      vehicleType: vehicleType || null,
      vehiclePlate: vehiclePlate ? vehiclePlate.trim() : null,
      status: 'active',
      plainPassword: generatedPassword // stored for display (removable)
    });

    await driver.save();

    console.log('✅ Driver registered:', name);
    console.log('🔑 Password:', generatedPassword);
    
    req.flash('success_msg', `Driver ${name} registered successfully! Password: ${generatedPassword} (Please save this password)`);
    res.redirect('/nurse/create-driver');
  } catch (error) {
    console.error('❌ Create driver error:', error.message);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const value = error.keyValue[field];
      req.flash('error_msg', `${field.charAt(0).toUpperCase() + field.slice(1)} "${value}" already exists. Please use a different ${field}.`);
    } else if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      req.flash('error_msg', messages.join('. '));
    } else {
      req.flash('error_msg', `Failed to register driver: ${error.message}`);
    }
    res.redirect('/nurse/create-driver');
  }
});

// ============ VIEW DRIVER DETAILS ============
router.get('/driver/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/nurse/create-driver');
    }

    res.render('nurse/driver-details', {
      title: 'Driver Details',
      user: req.session.user,
      driver: driver
    });
  } catch (error) {
    console.error('❌ View driver error:', error);
    req.flash('error_msg', 'Failed to load driver details');
    res.redirect('/nurse/create-driver');
  }
});

// ============ EDIT DRIVER (GET) ============
router.get('/driver/edit/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/nurse/create-driver');
    }

    res.render('nurse/driver-edit', {
      title: 'Edit Driver',
      user: req.session.user,
      driver: driver,
    });
  } catch (error) {
    console.error('❌ Edit driver error:', error);
    req.flash('error_msg', 'Failed to load driver for editing');
    res.redirect('/nurse/create-driver');
  }
});

// ============ UPDATE DRIVER (POST) ============
router.post('/driver/update/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

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

    if (!name || !idNumber || !phone || !email || !dateOfBirth) {
      req.flash('error_msg', 'All required fields must be filled');
      return res.redirect(`/nurse/driver/edit/${req.params.id}`);
    }

    if (!phone.match(/^[0-9+\-\s()]{10,15}$/)) {
      req.flash('error_msg', 'Please enter a valid phone number');
      return res.redirect(`/nurse/driver/edit/${req.params.id}`);
    }

    // Check for duplicate ID/email
    const existingId = await Driver.findOne({ idNumberHash: blindIndex(idNumber), _id: { $ne: req.params.id } });
    if (existingId) {
      req.flash('error_msg', 'ID number already registered to another driver');
      return res.redirect(`/nurse/driver/edit/${req.params.id}`);
    }

    const existingEmail = await Driver.findOne({ emailHash: blindIndex(email), _id: { $ne: req.params.id } });
    if (existingEmail) {
      req.flash('error_msg', 'Email already registered to another driver');
      return res.redirect(`/nurse/driver/edit/${req.params.id}`);
    }

    const age = calculateAge(new Date(dateOfBirth));

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      {
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
      },
      { new: true }
    );

    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/nurse/create-driver');
    }

    console.log('✅ Driver updated:', driver.name);
    req.flash('success_msg', `Driver ${driver.name} updated successfully!`);
    res.redirect('/nurse/create-driver');
  } catch (error) {
    console.error('❌ Update driver error:', error);
    req.flash('error_msg', 'Failed to update driver');
    res.redirect(`/nurse/driver/edit/${req.params.id}`);
  }
});

// ============ DELETE DRIVER ============
router.post('/driver/delete/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const driver = await Driver.findByIdAndDelete(req.params.id);
    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/nurse/create-driver');
    }

    console.log('🗑️ Driver deleted:', driver.name);
    req.flash('success_msg', `Driver ${driver.name} deleted successfully!`);
    res.redirect('/nurse/create-driver');
  } catch (error) {
    console.error('❌ Delete driver error:', error);
    req.flash('error_msg', 'Failed to delete driver');
    res.redirect('/nurse/create-driver');
  }
});

// ============ VIEW ALL DRIVERS (FIXED) ============
// This route now renders the same view as /create-driver (list + form)
// You can keep it separate or redirect; we'll render the same view.
router.get('/drivers', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const drivers = await Driver.find().sort({ createdAt: -1 });

    // Render the same view as /create-driver (includes form and list)
    // If you want a separate view without the form, create 'dashboard/driver' and update.
    res.render('nurse/create-driver', {
      title: 'Driver Management',
      user: req.session.user,
      drivers: drivers,
    });
  } catch (error) {
    console.error('❌ View drivers error:', error);
    req.flash('error_msg', 'Failed to load drivers');
    res.redirect('/auth/nurse-dashboard');
  }
});

// ============ UPDATE DRIVER STATUS ============
router.post('/driver/status/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const { status } = req.body;
    const validStatuses = ['active', 'inactive', 'on-leave'];
    if (!validStatuses.includes(status)) {
      req.flash('error_msg', 'Invalid status');
      return res.redirect(`/nurse/driver/${req.params.id}`);
    }

    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/nurse/create-driver');
    }

    driver.status = status;
    driver.updatedAt = Date.now();
    await driver.save();

    console.log(`✅ Driver ${driver.name} status updated to ${status}`);
    req.flash('success_msg', `Driver status updated to ${status.charAt(0).toUpperCase() + status.slice(1)} successfully!`);
    res.redirect(`/nurse/driver/${driver._id}`);
  } catch (error) {
    console.error('❌ Update status error:', error);
    req.flash('error_msg', 'Failed to update driver status');
    res.redirect(`/nurse/driver/${req.params.id}`);
  }
});

// ============ RESET DRIVER PASSWORD (Single route, fixed) ============
router.post('/driver/reset-password/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      req.flash('error_msg', 'Password must be at least 6 characters');
      return res.redirect(`/nurse/driver/${req.params.id}`);
    }

    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/nurse/create-driver');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    driver.password = hashedPassword;
    driver.plainPassword = newPassword; // store for display
    driver.updatedAt = Date.now();
    await driver.save();

    console.log('✅ Password reset for driver:', driver.name);
    req.flash('success_msg', `Password reset successfully! New password: ${newPassword}`);
    res.redirect(`/nurse/driver/${driver._id}`);
  } catch (error) {
    console.error('❌ Reset password error:', error);
    req.flash('error_msg', 'Failed to reset password');
    res.redirect(`/nurse/driver/${req.params.id}`);
  }
});

module.exports = router;
