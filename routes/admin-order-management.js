const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/admin');
const Order = require('../models/Order');
const Driver = require('../models/Driver');

// ===================== ORDER MANAGEMENT PAGE =====================
router.get('/orders/manage', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    const drivers = await Driver.find({ status: 'active' });

    res.render('admin/order-management', {
      title: 'Order Management',
      user: req.session.user,
      orders: orders,
      drivers: drivers,
      currentFilter: status || 'all',
    });
  } catch (error) {
    console.error('Order management error:', error);
    req.flash('error_msg', 'Failed to load orders');
    res.redirect('/admin/dashboard');
  }
});

// ===================== UPDATE ORDER STATUS =====================
router.post('/orders/status/:id', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'in-transit', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      req.flash('error_msg', 'Invalid status');
      return res.redirect('/admin/orders/manage');
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/admin/orders/manage');
    }

    order.status = status;
    if (status === 'delivered') {
      order.deliveryDate = Date.now();
    }
    order.updatedAt = Date.now();
    await order.save();

    // #1
    const io = req.app.get('io');
    if (io) {
    io.emit('data-updated', { type: 'order' });
    console.log('📦 Emitted order update for admin status change');
    }



    req.flash('success_msg', `Order status updated to ${status}`);
    res.redirect('/admin/orders/manage');
  } catch (error) {
    console.error('Update status error:', error);
    req.flash('error_msg', 'Failed to update status');
    res.redirect('/admin/orders/manage');
  }
});

// ===================== ASSIGN / REASSIGN DRIVER =====================
router.post('/orders/assign-driver/:id', adminMiddleware, async (req, res) => {
  try {
    const { driverId } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/admin/orders/manage');
    }

    if (order.status === 'delivered' || order.status === 'cancelled') {
      req.flash('error_msg', 'Cannot assign driver to delivered or cancelled order');
      return res.redirect('/admin/orders/manage');
    }

    if (driverId) {
      const driver = await Driver.findById(driverId);
      if (!driver || driver.status !== 'active') {
        req.flash('error_msg', 'Driver not found or not active');
        return res.redirect('/admin/orders/manage');
      }
      order.driverId = driver._id;
      order.driverName = driver.name;
      order.driverPhone = driver.phone;
      order.driverVehicle = driver.vehicleType || 'Not specified';
    } else {
      // Unassign driver (set to null)
      order.driverId = null;
      order.driverName = null;
      order.driverPhone = null;
      order.driverVehicle = null;
    }

    order.updatedAt = Date.now();
    await order.save();

    // #2
    const io = req.app.get('io');
    if (io) {
    io.emit('data-updated', { type: 'order' });
    console.log('📦 Emitted order update for admin driver assignment');
    }



    req.flash('success_msg', driverId ? 'Driver assigned successfully' : 'Driver unassigned');
    res.redirect('/admin/orders/manage');
  } catch (error) {
    console.error('Assign driver error:', error);
    req.flash('error_msg', 'Failed to assign driver');
    res.redirect('/admin/orders/manage');
  }
});

// ===================== DELETE ORDER =====================
router.post('/orders/delete/:id', adminMiddleware, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/admin/orders/manage');
    }
    req.flash('success_msg', `Order ${order._id} deleted successfully`);
    res.redirect('/admin/orders/manage');
  } catch (error) {
    console.error('Delete order error:', error);
    req.flash('error_msg', 'Failed to delete order');
    res.redirect('/admin/orders/manage');
  }
});

module.exports = router;
