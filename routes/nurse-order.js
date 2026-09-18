const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { compressSingle } = require('../middleware/imageCompressor');
const Order = require('../models/Order');
const Driver = require('../models/Driver');
const User = require('../models/User');
const Patient = require('../models/Patient');

// ============ MULTER CONFIGURATION ============
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './public/uploads/prescriptions';
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
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter
});

// ============ NURSE ORDERS PAGE ============
router.get('/nurse-orders', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const orders = await Order.find().sort({ createdAt: -1 });
    const drivers = await Driver.find();

    const patients = await User.find({ role: 'patient' })
      .select('name email')
      .sort({ name: 1 })
      ;

    const patientIds = patients.map(p => p._id);
    const profiles = await Patient.find({ userId: { $in: patientIds } })
      .select('userId phone')
      ;

    const profileMap = {};
    profiles.forEach(p => { profileMap[p.userId.toString()] = p.phone; });

    const patientsWithPhone = patients.map(p => ({
      _id: p._id,
      name: p.name,
      email: p.email,
      phone: profileMap[p._id.toString()] || 'N/A'
    }));

    const patientId = req.query.patientId || null;
    const patientName = req.query.patientName || '';

    res.render('nurse/nurse-order', {
      title: 'Manage Orders',
      user: req.session.user,
      orders: orders,
      drivers: drivers,
      patients: patientsWithPhone,
      prefillPatientId: patientId,
      prefillPatientName: patientName,
    });
  } catch (error) {
    console.error('❌ Nurse orders error:', error);
    req.flash('error_msg', 'Failed to load orders');
    res.redirect('/auth/nurse-dashboard');
  }
});

// ============ CREATE ORDER (NURSE) ============
router.post('/order/create', upload.single('prescriptionPhoto'),compressSingle, async (req, res) => {
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
      patientId,
      patientName,
      patientEmail,
      patientPhone,
      prescriptionName,
      location,
      latitude,
      longitude,
      notes,
      priority
    } = req.body;

    if (!patientId || !patientName || !patientEmail || !patientPhone || !prescriptionName || !location) {
      req.flash('error_msg', 'All required fields must be filled');
      return res.redirect('/nurse/nurse-orders');
    }

    const validPriorities = ['high', 'medium', 'low'];
    const orderPriority = validPriorities.includes(priority) ? priority : 'medium';

    if (!patientPhone.match(/^[0-9+\-\s()]{10,15}$/)) {
      req.flash('error_msg', 'Please enter a valid phone number');
      return res.redirect('/nurse/nurse-orders');
    }

    if (prescriptionName.length < 3) {
      req.flash('error_msg', 'Prescription name must be at least 3 characters');
      return res.redirect('/nurse/nurse-orders');
    }

    if (location.length < 5) {
      req.flash('error_msg', 'Please enter a valid delivery location');
      return res.redirect('/nurse/nurse-orders');
    }

    const orderData = {
      patientId: patientId,
      patientName: patientName.trim(),
      patientEmail: patientEmail.toLowerCase().trim(),
      patientPhone: patientPhone.trim(),
      prescriptionName: prescriptionName.trim(),
      location: location.trim(),
      latitude: latitude || null,
      longitude: longitude || null,
      notes: notes ? notes.trim() : null,
      priority: orderPriority,
      status: 'pending',
      updatedAt: Date.now()
    };

    if (req.file) {
      orderData.prescriptionPhoto = (req.file.cloudinaryUrl || '/uploads/prescriptions/' + req.file.filename);
    }

    const newOrder = new Order(orderData);
    await newOrder.save();

    // #1
    const io = req.app.get('io');
    if (io) {
    io.emit('data-updated', { type: 'order' });
    console.log('📦 Emitted order update for new order (nurse)');
    }

    console.log('✅ Order created by nurse for patient:', patientName);
    req.flash('success_msg', `Order created successfully for ${patientName}!`);
    res.redirect('/nurse/nurse-orders');
  } catch (error) {
    console.error('❌ Create order error:', error);
    req.flash('error_msg', 'Failed to create order: ' + error.message);
    res.redirect('/nurse/nurse-orders');
  }
});

// ============ UPDATE ORDER PRIORITY ============
router.post('/order/priority', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const { orderId, priority } = req.body;

    if (!orderId || !priority) {
      req.flash('error_msg', 'Order ID and priority are required');
      return res.redirect('/nurse/nurse-orders');
    }

    const validPriorities = ['high', 'medium', 'low'];
    if (!validPriorities.includes(priority)) {
      req.flash('error_msg', 'Invalid priority');
      return res.redirect('/nurse/nurse-orders');
    }

    const order = await Order.findById(orderId);
    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/nurse/nurse-orders');
    }

    order.priority = priority;
    order.updatedAt = Date.now();
    await order.save();

    // #2
    const io = req.app.get('io');
    if (io) {
    io.emit('data-updated', { type: 'order' });
    console.log('📦 Emitted order update for priority change');
    }

    console.log(`🔧 Priority updated to ${priority} for order ${orderId}`);
    req.flash('success_msg', `Priority updated to ${priority.charAt(0).toUpperCase() + priority.slice(1)}`);
    res.redirect('/nurse/nurse-orders');
  } catch (error) {
    console.error('❌ Update priority error:', error);
    req.flash('error_msg', 'Failed to update priority');
    res.redirect('/nurse/nurse-orders');
  }
});

// ============ ASSIGN DRIVER ============
router.post('/order/assign-driver', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const { orderId, driverId } = req.body;

    if (!orderId || !driverId) {
      req.flash('error_msg', 'Please select a driver');
      return res.redirect('/nurse/nurse-orders');
    }

    const order = await Order.findById(orderId);
    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/nurse/nurse-orders');
    }

    if (order.status === 'delivered' || order.status === 'cancelled') {
      req.flash('error_msg', 'Cannot assign driver to delivered or cancelled orders');
      return res.redirect('/nurse/nurse-orders');
    }

    const driver = await Driver.findById(driverId);
    if (!driver) {
      req.flash('error_msg', 'Driver not found');
      return res.redirect('/nurse/nurse-orders');
    }

    if (driver.status !== 'active') {
      req.flash('error_msg', 'Driver is not active');
      return res.redirect('/nurse/nurse-orders');
    }

    order.driverId = driver._id;
    order.driverName = driver.name;
    order.driverPhone = driver.phone;
    order.driverVehicle = driver.vehicleType || 'Not specified';
    order.status = 'in-transit';
    order.updatedAt = Date.now();
    await order.save();

    // #3
    const io = req.app.get('io');
    if (io) {
    io.emit('data-updated', { type: 'order' });
    console.log('📦 Emitted order update for driver assignment');
    }

    req.flash('success_msg', `Driver ${driver.name} assigned successfully! Order is now in transit.`);
    res.redirect('/nurse/nurse-orders');
  } catch (error) {
    console.error('❌ Assign driver error:', error);
    req.flash('error_msg', 'Failed to assign driver');
    res.redirect('/nurse/nurse-orders');
  }
});

// ============ UPDATE ORDER STATUS ============
router.post('/order/status', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const { orderId, status } = req.body;

    if (!orderId || !status) {
      req.flash('error_msg', 'Order ID and status are required');
      return res.redirect('/nurse/nurse-orders');
    }

    const validStatuses = ['pending', 'in-transit', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      req.flash('error_msg', 'Invalid status');
      return res.redirect('/nurse/nurse-orders');
    }

    const order = await Order.findById(orderId);
    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/nurse/nurse-orders');
    }

    if (status === 'delivered') {
      order.deliveryDate = Date.now();
    }

    order.status = status;
    order.updatedAt = Date.now();
    await order.save();

    // #4
    const io = req.app.get('io');
    if (io) {
    io.emit('data-updated', { type: 'order' });
    console.log('📦 Emitted order update for status change');
    }


    req.flash('success_msg', `Order status updated to ${status.charAt(0).toUpperCase() + status.slice(1)}`);
    res.redirect('/nurse/nurse-orders');
  } catch (error) {
    console.error('❌ Update order status error:', error);
    req.flash('error_msg', 'Failed to update order status');
    res.redirect('/nurse/nurse-orders');
  }
});

// ============ VIEW ORDER DETAILS (PAGE) ============
router.get('/order/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/nurse/nurse-orders');
    }

    res.render('nurse/order-details', {
      title: 'Order Details',
      user: req.session.user,
      order: order
    });
  } catch (error) {
    console.error('❌ View order error:', error);
    req.flash('error_msg', 'Failed to load order details');
    res.redirect('/nurse/nurse-orders');
  }
});

// ============ GET ORDERS BY STATUS (API) ============
router.get('/orders/status/:status', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = req.params.status;
    const query = {};
    
    if (status !== 'all') {
      query.status = status;
    }

    const orders = await Order.find(query).sort({ createdAt: -1 });

    res.json({ success: true, orders });
  } catch (error) {
    console.error('❌ Orders by status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ GET AVAILABLE DRIVERS (API) ============
router.get('/drivers/available', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const drivers = await Driver.find({ status: 'active' });

    res.json({ success: true, drivers });
  } catch (error) {
    console.error('❌ Available drivers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
