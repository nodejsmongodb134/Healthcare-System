const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/admin');
const Appointment = require('../models/Appointment');
const Order = require('../models/Order');
const User = require('../models/User');
const Nurse = require('../models/Nurse');

// ===================== ANALYTICS PAGE =====================
router.get('/analytics', adminMiddleware, (req, res) => {
  res.render('admin/analytics', {
    title: 'Analytics Dashboard',
    user: req.session.user,
  });
});

// ===================== API: Appointments Over Time =====================
router.get('/api/analytics/appointments-over-time', adminMiddleware, async (req, res) => {
  try {
    const { period = 'daily' } = req.query; // daily, weekly, monthly
    let groupBy;
    let dateFormat;
    const now = new Date();

    if (period === 'daily') {
      // Last 30 days
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      const appointments = await Appointment.find({
        date: { $gte: start }
      });
      // Group by day
      const grouped = {};
      appointments.forEach(a => {
        const key = a.date.toISOString().slice(0,10);
        grouped[key] = (grouped[key] || 0) + 1;
      });
      // Generate all days in range
      const labels = [];
      const data = [];
      for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0,10);
        labels.push(key);
        data.push(grouped[key] || 0);
      }
      return res.json({ labels, data, period });
    } else if (period === 'weekly') {
      // Last 12 weeks
      const start = new Date(now);
      start.setDate(start.getDate() - 84);
      const appointments = await Appointment.find({
        date: { $gte: start }
      });
      const grouped = {};
      appointments.forEach(a => {
        // Get week number (ISO week)
        const d = new Date(a.date);
        const week = `${d.getFullYear()}-W${String(Math.ceil((d.getDate() - 1 - d.getDay() + 1) / 7)).padStart(2, '0')}`;
        grouped[week] = (grouped[week] || 0) + 1;
      });
      // Generate all weeks
      const labels = [];
      const data = [];
      for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 7)) {
        const week = `${d.getFullYear()}-W${String(Math.ceil((d.getDate() - 1 - d.getDay() + 1) / 7)).padStart(2, '0')}`;
        labels.push(week);
        data.push(grouped[week] || 0);
      }
      return res.json({ labels, data, period });
    } else if (period === 'monthly') {
      // Last 12 months
      const start = new Date(now);
      start.setMonth(start.getMonth() - 12);
      const appointments = await Appointment.find({
        date: { $gte: start }
      });
      const grouped = {};
      appointments.forEach(a => {
        const key = a.date.toISOString().slice(0,7);
        grouped[key] = (grouped[key] || 0) + 1;
      });
      const labels = [];
      const data = [];
      for (let d = new Date(start); d <= now; d.setMonth(d.getMonth() + 1)) {
        const key = d.toISOString().slice(0,7);
        labels.push(key);
        data.push(grouped[key] || 0);
      }
      return res.json({ labels, data, period });
    }
  } catch (error) {
    console.error('Appointments-over-time error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===================== API: Order Status Breakdown (Pie Chart) =====================
router.get('/api/analytics/order-status', adminMiddleware, async (req, res) => {
  try {
    const statuses = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const labels = statuses.map(s => s._id || 'Unknown');
    const data = statuses.map(s => s.count);
    const colors = ['#ffc107', '#17a2b8', '#28a745', '#dc3545']; // pending, in-transit, delivered, cancelled
    res.json({ labels, data, colors });
  } catch (error) {
    console.error('Order status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===================== API: New Users Per Day (Last 14 Days) =====================
router.get('/api/analytics/new-users', adminMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 14);
    const users = await User.find({
      createdAt: { $gte: start }
    });
    const grouped = {};
    users.forEach(u => {
      const key = u.createdAt.toISOString().slice(0,10);
      grouped[key] = (grouped[key] || 0) + 1;
    });
    const labels = [];
    const data = [];
    for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0,10);
      labels.push(key);
      data.push(grouped[key] || 0);
    }
    res.json({ labels, data });
  } catch (error) {
    console.error('New users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===================== API: Most Active Nurses =====================
router.get('/api/analytics/most-active-nurses', adminMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    // Count appointments assigned to each nurse
    const nurseAppointments = await Appointment.aggregate([
      { $match: { nurseId: { $ne: null } } },
      { $group: { _id: '$nurseId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);
    // Fetch nurse names
    const nurseIds = nurseAppointments.map(n => n._id);
    const nurses = await User.find({ _id: { $in: nurseIds }, role: 'nurse' })
      .select('name')
      ;
    const nurseMap = {};
    nurses.forEach(n => { nurseMap[n._id] = n.name; });
    const labels = [];
    const data = [];
    nurseAppointments.forEach(n => {
      const name = nurseMap[n._id] || 'Unknown Nurse';
      labels.push(name);
      data.push(n.count);
    });
    res.json({ labels, data });
  } catch (error) {
    console.error('Most active nurses error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
