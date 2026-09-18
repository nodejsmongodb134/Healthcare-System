const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { compressSingle } = require('../middleware/imageCompressor');
const Order = require('../models/Order');
const Patient = require('../models/Patient');
const User = require('../models/User');
const fs = require('fs');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './public/uploads/prescriptions';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'prescription-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept images only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

// ============ GET ORDER PAGE ============
router.get('/order', async (req, res) => {
  try {
    // Check if user is logged in
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    // Check if user is a patient
    if (req.session.user.role !== 'patient') {
      req.flash('error_msg', 'Access denied. Patient only.');
      return res.redirect('/auth/login');
    }

    // Get patient profile
    const patient = await Patient.findOne({ userId: req.session.user.id });
    
    // Get user's orders
    const orders = await Order.find({ 
      patientId: req.session.user.id 
    }).sort({ createdAt: -1 });

    res.render('patient/order', {
      title: 'Order Prescription',
      user: req.session.user,
      patient: patient || {},
      orders: orders || [],
    });
  } catch (error) {
    console.error('❌ Order page error:', error);
    req.flash('error_msg', 'Failed to load order page');
    res.redirect('/auth/patient-dashboard');
  }
});

// ============ PLACE ORDER ============
router.post('/order/place', upload.single('prescriptionPhoto'),compressSingle, async (req, res) => {
  try {
    // Check if user is logged in
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    console.log('📬 Order request body:', req.body);
    console.log('📬Ž File:', req.file);

    const { 
      patientName, 
      patientEmail, 
      patientPhone, 
      prescriptionName, 
      location, 
      latitude, 
      longitude, 
      notes 
    } = req.body;

    // Validate required fields
    if (!patientName || !patientEmail || !patientPhone || !prescriptionName || !location) {
      req.flash('error_msg', 'All required fields must be filled');
      return res.redirect('/patient/order');
    }

    // Validate phone number
    if (!patientPhone.match(/^[0-9+\-\s()]{10,15}$/)) {
      req.flash('error_msg', 'Please enter a valid phone number');
      return res.redirect('/patient/order');
    }

    // Validate prescription name length
    if (prescriptionName.length < 3) {
      req.flash('error_msg', 'Prescription name must be at least 3 characters');
      return res.redirect('/patient/order');
    }

    // Validate location
    if (location.length < 5) {
      req.flash('error_msg', 'Please enter a valid delivery location');
      return res.redirect('/patient/order');
    }

    // Get prescription photo path if uploaded
    let prescriptionPhoto = null;
    if (req.file) {
      prescriptionPhoto = (req.file.cloudinaryUrl || '/uploads/prescriptions/' + req.file.filename);
    }

    // Create order
    const newOrder = new Order({
      patientId: req.session.user.id,
      patientName: patientName.trim(),
      patientEmail: patientEmail.toLowerCase().trim(),
      patientPhone: patientPhone.trim(),
      prescriptionName: prescriptionName.trim(),
      prescriptionPhoto: prescriptionPhoto,
      location: location.trim(),
      latitude: latitude || null,
      longitude: longitude || null,
      notes: notes ? notes.trim() : null,
      status: 'pending',
      updatedAt: Date.now() // Set updatedAt manually
    });

    await newOrder.save();
    const io = req.app.get('io');
    if (io) {
    io.emit('data-updated', { type: 'order' });
    console.log('📦 Emitted order update for new order (patient)');
    }


    console.log('✅ Order placed by:', patientName);
    req.flash('success_msg', 'Order placed successfully! Your prescription will be delivered soon.');
    res.redirect('/patient/order');
  } catch (error) {
    console.error('❌ Place order error:', error);
    req.flash('error_msg', 'Failed to place order. Please try again.');
    res.redirect('/patient/order');
  }
});

// ============ VIEW ORDER DETAILS ============
router.get('/order/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const order = await Order.findOne({
      _id: req.params.id,
      patientId: req.session.user.id
    });

    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/patient/order');
    }

    res.render('patient/order-details', {
      title: 'Order Details',
      user: req.session.user,
      order: order
    });
  } catch (error) {
    console.error('❌ Order details error:', error);
    req.flash('error_msg', 'Failed to load order details');
    res.redirect('/patient/order');
  }
});

// ============ CANCEL ORDER ============
router.post('/order/cancel/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    const order = await Order.findOne({
      _id: req.params.id,
      patientId: req.session.user.id
    });

    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/patient/order');
    }

    // Only allow cancellation if order is pending or in-transit
    if (order.status === 'delivered') {
      req.flash('error_msg', 'Cannot cancel a delivered order');
      return res.redirect('/patient/order');
    }

    if (order.status === 'cancelled') {
      req.flash('error_msg', 'Order is already cancelled');
      return res.redirect('/patient/order');
    }

    order.status = 'cancelled';
    order.updatedAt = Date.now(); // Update timestamp
    await order.save();

    const io = req.app.get('io');
    if (io) {
    io.emit('data-updated', { type: 'order' });
    console.log('📦 Emitted order update for order cancellation');
    }

    console.log('🗑️ Order cancelled:', order._id);
    req.flash('success_msg', 'Order cancelled successfully');
    res.redirect('/patient/order');
  } catch (error) {
    console.error('❌ Cancel order error:', error);
    req.flash('error_msg', 'Failed to cancel order');
    res.redirect('/patient/order');
  }
});

// ============ GET ALL ORDERS (JSON) ============
router.get('/orders/json', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const orders = await Order.find({ 
      patientId: req.session.user.id 
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      orders: orders
    });
  } catch (error) {
    console.error('❌ Orders JSON error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ GET ORDERS BY STATUS (API) ============
router.get('/orders/status/:status', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = req.params.status;
    const query = { patientId: req.session.user.id };
    
    if (status !== 'all') {
      query.status = status;
    }

    const orders = await Order.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      orders: orders
    });
  } catch (error) {
    console.error('❌ Orders by status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
