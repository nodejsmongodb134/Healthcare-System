const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const adminMiddleware = require('../middleware/admin');
const { blindIndex } = require('../utils/blindIndex');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Nurse = require('../models/Nurse');
const Driver = require('../models/Driver');
const Appointment = require('../models/Appointment');
const Message = require('../models/Message');
const Order = require('../models/Order');
const { logAdminAction } = require('../utils/auditLogger');

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

// ===================== DASHBOARD =====================
router.get('/dashboard', adminMiddleware, async (req, res) => {
  try {
    const [
      totalUsers,
      totalPatients,
      totalNurses,
      totalDrivers,
      totalAppointments,
      totalMessages,
      totalOrders
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'patient' }),
      User.countDocuments({ role: 'nurse' }),
      Driver.countDocuments(),
      Appointment.countDocuments(),
      Message.countDocuments(),
      Order.countDocuments()
    ]);

    const recentAppointments = await Appointment.find().sort({ createdAt: -1 }).limit(10);
    const recentMessages = await Message.find().sort({ createdAt: -1 }).limit(10);
    const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(10);
    const recentPatients = await User.find({ role: 'patient' }).sort({ createdAt: -1 }).limit(10).select('-password');
    const recentDrivers = await Driver.find().sort({ createdAt: -1 }).limit(10);
    const nurses = await User.find({ role: 'nurse' }).select('-password');

    res.render('dashboard/admin', {
      title: 'Admin Dashboard',
      user: req.session.user,
      stats: {
        totalUsers,
        totalPatients,
        totalNurses,
        totalDrivers,
        totalAppointments,
        totalMessages,
        totalOrders
      },
      recentAppointments,
      recentMessages,
      recentOrders,
      recentPatients,
      recentDrivers,
      nurses,
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    req.flash('error_msg', 'Failed to load admin dashboard');
    res.redirect('/auth/login');
  }
});

// ===================== APPOINTMENTS =====================
// LIST
router.get('/appointments', adminMiddleware, async (req, res) => {
  try {
    const appointments = await Appointment.find().sort({ createdAt: -1 });
    res.render('admin/list', {
      title: 'All Appointments',
      user: req.session.user,
      items: appointments,
      type: 'appointments',
      columns: ['Patient', 'Date', 'Time', 'Status', 'Description'],
    });
  } catch (error) {
    console.error('Appointments list error:', error);
    req.flash('error_msg', 'Failed to load appointments');
    res.redirect('/admin/dashboard');
  }
});

// DETAIL
router.get('/appointments/:id', adminMiddleware, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      req.flash('error_msg', 'Appointment not found');
      return res.redirect('/admin/appointments');
    }
    res.render('admin/appointment-details', {
      title: `Appointment: ${appointment.patientName}`,
      user: req.session.user,
      appointment: appointment,
    });
  } catch (error) {
    console.error('Appointment details error:', error);
    req.flash('error_msg', 'Failed to load appointment details');
    res.redirect('/admin/appointments');
  }
});

// ===================== MESSAGES =====================
// LIST
router.get('/messages', adminMiddleware, async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 });
    res.render('admin/list', {
      title: 'All Messages',
      user: req.session.user,
      items: messages,
      type: 'messages',
      columns: ['Patient', 'Subject', 'Status', 'Date'],
    });
  } catch (error) {
    console.error('Messages list error:', error);
    req.flash('error_msg', 'Failed to load messages');
    res.redirect('/admin/dashboard');
  }
});

// DETAIL
router.get('/messages/:id', adminMiddleware, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) {
      req.flash('error_msg', 'Message not found');
      return res.redirect('/admin/messages');
    }
    res.render('admin/message-details', {
      title: `Message: ${message.subject}`,
      user: req.session.user,
      message: message,
    });
  } catch (error) {
    console.error('Message details error:', error);
    req.flash('error_msg', 'Failed to load message details');
    res.redirect('/admin/messages');
  }
});

// ===================== ORDERS =====================
// LIST
router.get('/orders', adminMiddleware, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.render('admin/list', {
      title: 'All Orders',
      user: req.session.user,
      items: orders,
      type: 'orders',
      columns: ['Patient', 'Prescription', 'Status', 'Location', 'Date'],
    });
  } catch (error) {
    console.error('Orders list error:', error);
    req.flash('error_msg', 'Failed to load orders');
    res.redirect('/admin/dashboard');
  }
});

// DETAIL
router.get('/orders/:id', adminMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/admin/orders');
    }
    res.render('admin/order-details', {
      title: `Order: ${order.prescriptionName}`,
      user: req.session.user,
      order: order,
    });
  } catch (error) {
    console.error('Order details error:', error);
    req.flash('error_msg', 'Failed to load order details');
    res.redirect('/admin/orders');
  }
});

// ===================== PATIENTS =====================
router.get('/patients', adminMiddleware, async (req, res) => {
  try {
    const patients = await User.find({ role: 'patient' }).sort({ createdAt: -1 }).select('-password');
    res.render('admin/list', {
      title: 'All Patients',
      user: req.session.user,
      items: patients,
      type: 'patients',
      columns: ['Name', 'Email', 'Verified', 'Joined'],
    });
  } catch (error) {
    console.error('Patients list error:', error);
    req.flash('error_msg', 'Failed to load patients');
    res.redirect('/admin/dashboard');
  }
});

router.get('/patients/:id', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user || user.role !== 'patient') {
      req.flash('error_msg', 'Patient not found');
      return res.redirect('/admin/patients');
    }
    const profile = await Patient.findOne({ userId: user._id });
    const appointments = await Appointment.find({ patientId: user._id }).sort({ date: -1 });
    const messages = await Message.find({ patientId: user._id }).sort({ createdAt: -1 });
    const orders = await Order.find({ patientId: user._id }).sort({ createdAt: -1 });

    res.render('admin/patient-details', {
      title: `Patient: ${user.name}`,
      user: req.session.user,
      patient: user,
      profile,
      appointments,
      messages,
      orders,
    });
  } catch (error) {
    console.error('Patient details error:', error);
    req.flash('error_msg', 'Failed to load patient details');
    res.redirect('/admin/patients');
  }
});

// ===================== DRIVERS =====================
router.get('/drivers', adminMiddleware, async (req, res) => {
  try {
    const drivers = await Driver.find().sort({ createdAt: -1 });
    res.render('admin/list', {
      title: 'All Drivers',
      user: req.session.user,
      items: drivers,
      type: 'drivers',
      columns: ['Name', 'Email', 'Phone', 'Status', 'Vehicle'],
    });
  } catch (error) {
    console.error('Drivers list error:', error);
    req.flash('error_msg', 'Failed to load drivers');
    res.redirect('/admin/dashboard');
  }
});

router.get('/drivers/:id', adminMiddleware, async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/admin/drivers');
    }
    const orders = await Order.find({ driverId: driver._id }).sort({ createdAt: -1 });

    res.render('admin/driver-details', {
      title: `Driver: ${driver.name}`,
      user: req.session.user,
      driver: driver,
      orders: orders,
    });
  } catch (error) {
    console.error('Driver details error:', error);
    req.flash('error_msg', 'Failed to load driver details');
    res.redirect('/admin/drivers');
  }
});

// ===================== NURSES =====================
// LIST
router.get('/nurses', adminMiddleware, async (req, res) => {
  try {
    const nurses = await User.find({ role: 'nurse' }).sort({ createdAt: -1 }).select('-password');
    res.render('admin/list', {
      title: 'All Nurses',
      user: req.session.user,
      items: nurses,
      type: 'nurses',
      columns: ['Name', 'Email', 'Verified', 'Joined'],
    });
  } catch (error) {
    console.error('Nurses list error:', error);
    req.flash('error_msg', 'Failed to load nurses');
    res.redirect('/admin/dashboard');
  }
});

// CREATE (GET) – MUST COME BEFORE /:id
router.get('/nurses/create', adminMiddleware, (req, res) => {
  res.render('admin/create-nurse', {
    title: 'Create Nurse Account',
    user: req.session.user,
  });
});

// CREATE (POST)
router.post('/nurses', adminMiddleware, async (req, res) => {
  try {
    const { 
      name, email, password, idNumber, phone, dateOfBirth, 
      qualification, specialization, yearsOfExperience, licenseNumber 
    } = req.body;

    if (!name || !email || !password || !idNumber || !phone || !dateOfBirth) {
      req.flash('error_msg', 'All required fields must be filled');
      return res.redirect('/admin/nurses/create');
    }
    if (password.length < 6) {
      req.flash('error_msg', 'Password must be at least 6 characters');
      return res.redirect('/admin/nurses/create');
    }

    const existingUser = await User.findOne({ emailHash: blindIndex(email) });
    if (existingUser) {
      req.flash('error_msg', 'Email already registered');
      return res.redirect('/admin/nurses/create');
    }

    const existingNurse = await Nurse.findOne({ idNumberHash: blindIndex(idNumber) });
    if (existingNurse) {
      req.flash('error_msg', 'ID number already registered');
      return res.redirect('/admin/nurses/create');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: 'nurse',
      isVerified: true,
      profileComplete: true
    });
    await user.save();

    const age = calculateAge(new Date(dateOfBirth));

    const nurse = new Nurse({
      userId: user._id,
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

    req.flash('success_msg', `✅ Nurse ${name} created successfully! Password: ${password}`);
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error('Create nurse error:', error);
    req.flash('error_msg', 'Failed to create nurse: ' + error.message);
    res.redirect('/admin/nurses/create');
  }
});

// DETAIL – COMES AFTER STATIC ROUTES
router.get('/nurses/:id', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user || user.role !== 'nurse') {
      req.flash('error_msg', 'Nurse not found');
      return res.redirect('/admin/nurses');
    }
    const profile = await Nurse.findOne({ userId: user._id });
    const appointments = await Appointment.find({ nurseId: user._id }).sort({ date: -1 });
    const messages = await Message.find({ nurseId: user._id }).sort({ createdAt: -1 });
    const drivers = await Driver.find({ createdBy: user._id }).sort({ createdAt: -1 });

    res.render('admin/nurse-details', {
      title: `Nurse: ${user.name}`,
      user: req.session.user,
      nurse: user,
      profile,
      appointments,
      messages,
      drivers,
    });
  } catch (error) {
    console.error('Nurse details error:', error);
    req.flash('error_msg', 'Failed to load nurse details');
    res.redirect('/admin/nurses');
  }
});

// REVOKE NURSE
router.post('/nurses/:id/revoke', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/admin/dashboard');
    }
    if (user.role !== 'nurse') {
      req.flash('error_msg', 'User is not a nurse');
      return res.redirect('/admin/dashboard');
    }
    if (user._id.toString() === req.session.user.id) {
      req.flash('error_msg', 'You cannot revoke your own access');
      return res.redirect('/admin/dashboard');
    }

    user.role = 'patient';
    user.profileComplete = false;
    await user.save();

    req.flash('success_msg', `🔒 Nurse ${user.name} access revoked. They are now a patient.`);
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error('Revoke nurse error:', error);
    req.flash('error_msg', 'Failed to revoke nurse access');
    res.redirect('/admin/dashboard');
  }
});

// DELETE USER
router.post('/users/:id/delete', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/admin/dashboard');
    }
    if (user.role === 'admin') {
      req.flash('error_msg', 'Cannot delete admin user');
      return res.redirect('/admin/dashboard');
    }
    if (user._id.toString() === req.session.user.id) {
      req.flash('error_msg', 'You cannot delete your own account');
      return res.redirect('/admin/dashboard');
    }

    if (user.role === 'patient') {
      await Patient.findOneAndDelete({ userId: user._id });
    } else if (user.role === 'nurse') {
      await Nurse.findOneAndDelete({ userId: user._id });
    }

    await user.deleteOne();
    req.flash('success_msg', `🗑️ User ${user.name} deleted successfully.`);
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error('Delete user error:', error);
    req.flash('error_msg', 'Failed to delete user');
    res.redirect('/admin/dashboard');
  }
});

// UPDATE NURSE STATUS
router.post('/nurses/:id/status', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/admin/dashboard');
    }
    if (user.role !== 'nurse') {
      req.flash('error_msg', 'User is not a nurse');
      return res.redirect('/admin/dashboard');
    }

    user.profileComplete = status === 'active';
    await user.save();

    req.flash('success_msg', `👤 Nurse ${user.name} ${status === 'active' ? 'activated' : 'deactivated'}.`);
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error('Update nurse status error:', error);
    req.flash('error_msg', 'Failed to update nurse status');
    res.redirect('/admin/dashboard');
  }
});

// ===================== TEST ROUTE =====================
router.get('/test', (req, res) => {
  res.send('Admin router is working!');
});



// ===================== CHANGE PASSWORD =====================
router.get('/change-password', adminMiddleware, (req, res) => {
  res.render('admin/change-password', {
    title: 'Change Password',
    user: req.session.user,
  });
});

router.post('/change-password', adminMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      req.flash('error_msg', 'All fields are required');
      return res.redirect('/admin/change-password');
    }
    if (newPassword.length < 6) {
      req.flash('error_msg', 'New password must be at least 6 characters');
      return res.redirect('/admin/change-password');
    }
    if (newPassword !== confirmPassword) {
      req.flash('error_msg', 'Passwords do not match');
      return res.redirect('/admin/change-password');
    }

    // Find admin user
    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/admin/change-password');
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      req.flash('error_msg', 'Current password is incorrect');
      return res.redirect('/admin/change-password');
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    req.flash('success_msg', 'Password changed successfully!');
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error('Change password error:', error);
    req.flash('error_msg', 'Failed to change password');
    res.redirect('/admin/change-password');
  }
});


console.log('✅ Admin router fully loaded (all list & detail routes)');
module.exports = router;
