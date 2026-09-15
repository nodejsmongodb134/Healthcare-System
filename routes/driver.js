// routes/driver.js
const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');
const Order = require('../models/Order');
const bcrypt = require('bcryptjs');

// ============ DRIVER LOGIN PAGE ============
router.get('/login', (req, res) => {
  console.log('🔐 Driver login page accessed');
  if (req.session.driver) {
    return res.redirect('/driver/dashboard');
  }
  res.render('driver/login', {
    title: 'Driver Login',
    success_msg: req.flash('success_msg'),
    error_msg: req.flash('error_msg')
  });
});

// ============ DRIVER LOGIN ============
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      req.flash('error_msg', 'Email and password are required');
      return res.redirect('/driver/login');
    }

    // ⚠️ Blind-index lookup (email is encrypted at rest)
    const { blindIndex } = require('../utils/blindIndex');
    const driver = await Driver.findOne({ emailHash: blindIndex(email) });

    if (!driver) {
      req.flash('error_msg', 'Invalid email or password');
      return res.redirect('/driver/login');
    }

    if (driver.status !== 'active') {
      req.flash('error_msg', 'Your account is not active. Please contact administration.');
      return res.redirect('/driver/login');
    }

    const isMatch = await bcrypt.compare(password, driver.password);
    if (!isMatch) {
      req.flash('error_msg', 'Invalid email or password');
      return res.redirect('/driver/login');
    }

    req.session.driver = {
      id: driver._id,
      name: driver.name,
      email: driver.email,
      phone: driver.phone,
      status: driver.status
    };

    req.flash('success_msg', `Welcome back, ${driver.name}!`);
    res.redirect('/driver/dashboard');
  } catch (error) {
    console.error('❌ Driver login error:', error);
    req.flash('error_msg', 'Login failed. Please try again.');
    res.redirect('/driver/login');
  }
});

// ============ DRIVER DASHBOARD (SORTED BY PRIORITY) ============
router.get('/dashboard', async (req, res) => {
  try {
    if (!req.session.driver) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/driver/login');
    }

    const driver = await Driver.findById(req.session.driver.id);
    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/driver/login');
    }

    // ✅ NO .lean() — keeps Mongoose documents so decryption works
    const orders = await Order.find({ driverId: driver._id });

    // Priority sort: high = 1, medium = 2, low = 3 (missing → medium)
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    orders.sort((a, b) => {
      const aP = priorityOrder[a.priority] || 2;
      const bP = priorityOrder[b.priority] || 2;
      if (aP !== bP) return aP - bP;
      return new Date(b.orderDate) - new Date(a.orderDate);
    });

    res.render('driver/dashboard', {
      title: 'Driver Dashboard',
      driver: driver,
      orders: orders,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('❌ Driver dashboard error:', error);
    req.flash('error_msg', 'Failed to load dashboard');
    res.redirect('/driver/login');
  }
});

// ============ CHANGE PASSWORD PAGE ============
router.get('/change-password', async (req, res) => {
  try {
    if (!req.session.driver) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/driver/login');
    }

    const driver = await Driver.findById(req.session.driver.id);
    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/driver/login');
    }

    res.render('driver/change-password', {
      title: 'Change Password',
      driver: driver,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('❌ Change password page error:', error);
    req.flash('error_msg', 'Failed to load page');
    res.redirect('/driver/dashboard');
  }
});

// ============ CHANGE PASSWORD - POST ============
router.post('/change-password', async (req, res) => {
  try {
    if (!req.session.driver) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/driver/login');
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      req.flash('error_msg', 'All fields are required');
      return res.redirect('/driver/change-password');
    }

    if (newPassword.length < 6) {
      req.flash('error_msg', 'New password must be at least 6 characters');
      return res.redirect('/driver/change-password');
    }

    if (newPassword !== confirmPassword) {
      req.flash('error_msg', 'Passwords do not match');
      return res.redirect('/driver/change-password');
    }

    const driver = await Driver.findById(req.session.driver.id);
    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/driver/change-password');
    }

    const isMatch = await bcrypt.compare(currentPassword, driver.password);
    if (!isMatch) {
      req.flash('error_msg', 'Current password is incorrect');
      return res.redirect('/driver/change-password');
    }

    const isSame = await bcrypt.compare(newPassword, driver.password);
    if (isSame) {
      req.flash('error_msg', 'New password cannot be the same as current password');
      return res.redirect('/driver/change-password');
    }

    const salt = await bcrypt.genSalt(10);
    driver.password = await bcrypt.hash(newPassword, salt);
    driver.updatedAt = Date.now();
    await driver.save();

    req.flash('success_msg', 'Password changed successfully!');
    res.redirect('/driver/dashboard');
  } catch (error) {
    console.error('❌ Change password error:', error);
    req.flash('error_msg', 'Failed to change password');
    res.redirect('/driver/change-password');
  }
});

// ============ VIEW ORDER DETAILS (safe for driver — no PII leakage) ============
router.get('/order/:id', async (req, res) => {
  try {
    if (!req.session.driver) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ✅ NO .lean() — need decryption
    const order = await Order.findOne({
      _id: req.params.id,
      driverId: req.session.driver.id
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // 🛡️ Return ONLY delivery-related info — no prescription, no priority, no notes
    const safeOrder = {
      patientName: order.patientName,
      patientPhone: order.patientPhone,
      location: order.location,
      status: order.status,
      deliveryDate: order.deliveryDate
    };

    res.json({ success: true, order: safeOrder });
  } catch (error) {
    console.error('❌ View order error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ UPDATE ORDER STATUS ============
router.post('/order/status', async (req, res) => {
  try {
    if (!req.session.driver) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/driver/login');
    }

    const { orderId, status } = req.body;
    if (!orderId || !status) {
      req.flash('error_msg', 'Order ID and status are required');
      return res.redirect('/driver/dashboard');
    }

    const validStatuses = ['in-transit', 'delivered'];
    if (!validStatuses.includes(status)) {
      req.flash('error_msg', 'Invalid status');
      return res.redirect('/driver/dashboard');
    }

    // ✅ NO .lean() — need to save and re-encrypt
    const order = await Order.findOne({
      _id: orderId,
      driverId: req.session.driver.id
    });

    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/driver/dashboard');
    }

    if (status === 'delivered') {
      order.deliveryDate = Date.now();
    }

    order.status = status;
    order.updatedAt = Date.now();
    await order.save();

    // Real-time broadcast
    const io = req.app.get('io');
    if (io) {
      io.emit('data-updated', { type: 'order' });
      console.log('📦 Emitted order update for driver status change');
    }

    req.flash('success_msg', `Order marked as ${status}`);
    res.redirect('/driver/dashboard');
  } catch (error) {
    console.error('❌ Update order status error:', error);
    req.flash('error_msg', 'Failed to update order status');
    res.redirect('/driver/dashboard');
  }
});

// ============ DRIVER LOGOUT ============
router.get('/logout', (req, res) => {
  req.session.driver = null;
  req.flash('success_msg', 'Logged out successfully');
  res.redirect('/driver/login');
});

module.exports = router;