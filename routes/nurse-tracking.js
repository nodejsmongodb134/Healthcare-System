// routes/nurse-tracking.js
const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');
const DriverLocation = require('../models/DriverLocation');

router.get('/track-drivers', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Access denied. Nurse only.');
      return res.redirect('/auth/login');
    }

    // ⚠️ NO .lean() — driver name is encrypted at rest.
    // .lean() would bypass the decryption getter and return ciphertext.
    const drivers = await Driver.find().select('name _id status');

    res.render('nurse/track-drivers', {
      title: 'Track Drivers',
      user: req.session.user,
      drivers: drivers,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('❌ Track drivers error:', error);
    req.flash('error_msg', 'Failed to load tracking page');
    res.redirect('/auth/nurse-dashboard');
  }
});

module.exports = router;