const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/admin');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const Order = require('../models/Order');
const Message = require('../models/Message');

// Helper: Convert array of objects to CSV
function arrayToCSV(data, headers) {
  if (!data || data.length === 0) return 'No data available';

  // If headers not provided, use Object.keys of first item
  if (!headers) {
    headers = Object.keys(data[0]);
  }

  // Escape values that contain commas, quotes, or newlines
  const escapeValue = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Build header row
  let csv = headers.join(',') + '\n';

  // Build data rows
  for (const row of data) {
    const values = headers.map(h => escapeValue(row[h] !== undefined ? row[h] : ''));
    csv += values.join(',') + '\n';
  }

  return csv;
}

// ===================== EXPORT PAGE =====================
router.get('/export', adminMiddleware, (req, res) => {
  res.render('admin/export-data', {
    title: 'Export Data',
    user: req.session.user,
  });
});

// ===================== EXPORT PATIENTS =====================
router.get('/export/patients', adminMiddleware, async (req, res) => {
  try {
    const patients = await User.find({ role: 'patient' })
      .select('name email isVerified isActive profileComplete createdAt')
      ;

    // Enrich with Patient profile phone if needed
    const enriched = await Promise.all(patients.map(async (p) => {
      const profile = await Patient.findOne({ userId: p._id });
      return {
        Name: p.name,
        Email: p.email,
        Phone: profile?.phone || 'N/A',
        IDNumber: profile?.idNumber || 'N/A',
        Verified: p.isVerified ? 'Yes' : 'No',
        Active: p.isActive !== undefined ? (p.isActive ? 'Yes' : 'No') : 'Yes',
        ProfileComplete: p.profileComplete ? 'Yes' : 'No',
        Joined: new Date(p.createdAt).toLocaleDateString()
      };
    }));

    const csv = arrayToCSV(enriched);
    res.header('Content-Type', 'text/csv');
    res.attachment(`patients-${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export patients error:', error);
    req.flash('error_msg', 'Failed to export patients');
    res.redirect('/admin/export');
  }
});

// ===================== EXPORT APPOINTMENTS =====================
router.get('/export/appointments', adminMiddleware, async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .sort({ date: -1 })
      ;

    const data = appointments.map(a => ({
      Patient: a.patientName,
      Email: a.patientEmail,
      Phone: a.patientPhone,
      Date: new Date(a.date).toLocaleDateString(),
      Time: a.time,
      Status: a.status,
      Description: a.description || '',
      Created: new Date(a.createdAt).toLocaleDateString()
    }));

    const csv = arrayToCSV(data);
    res.header('Content-Type', 'text/csv');
    res.attachment(`appointments-${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export appointments error:', error);
    req.flash('error_msg', 'Failed to export appointments');
    res.redirect('/admin/export');
  }
});

// ===================== EXPORT ORDERS =====================
router.get('/export/orders', adminMiddleware, async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ orderDate: -1 })
      ;

    const data = orders.map(o => ({
      Patient: o.patientName,
      Prescription: o.prescriptionName,
      Status: o.status,
      Location: o.location,
      Driver: o.driverName || 'Not assigned',
      Notes: o.notes || '',
      OrderDate: new Date(o.orderDate).toLocaleDateString(),
      DeliveryDate: o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString() : 'Pending'
    }));

    const csv = arrayToCSV(data);
    res.header('Content-Type', 'text/csv');
    res.attachment(`orders-${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export orders error:', error);
    req.flash('error_msg', 'Failed to export orders');
    res.redirect('/admin/export');
  }
});

// ===================== EXPORT MESSAGES =====================
router.get('/export/messages', adminMiddleware, async (req, res) => {
  try {
    const messages = await Message.find()
      .sort({ createdAt: -1 })
      ;

    const data = messages.map(m => ({
      Patient: m.patientName,
      Email: m.patientEmail,
      Phone: m.patientPhone,
      Subject: m.subject,
      Message: m.message,
      Status: m.status,
      NurseReply: m.nurseReply || 'No reply',
      Sent: new Date(m.createdAt).toLocaleDateString(),
      RepliedOn: m.replyDate ? new Date(m.replyDate).toLocaleDateString() : 'N/A'
    }));

    const csv = arrayToCSV(data);
    res.header('Content-Type', 'text/csv');
    res.attachment(`messages-${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export messages error:', error);
    req.flash('error_msg', 'Failed to export messages');
    res.redirect('/admin/export');
  }
});

module.exports = router;
