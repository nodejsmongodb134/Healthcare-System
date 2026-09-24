// scripts/create-admin.js
// Creates (or upgrades) an admin account.
// Usage: node scripts/create-admin.js

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { blindIndex } = require('../utils/blindIndex');

const ADMIN = {
  name: 'System Administrator',
  email: 'valley.palm@yahoo.com',
  password: 'Admin@1234',
  role: 'admin'
};

(async () => {
  console.log('');
  console.log('======================================');
  console.log('  Create Admin Account');
  console.log('======================================');
  console.log('');

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing from .env');
    process.exit(1);
  }
  if (!process.env.ENCRYPTION_KEY) {
    console.error('ENCRYPTION_KEY missing from .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }

  try {
    const emailHash = blindIndex(ADMIN.email);
    console.log('emailHash: ' + emailHash.substring(0, 16) + '...');
    console.log('');

    const existing = await User.findOne({ emailHash });

    if (existing) {
      console.log('An account with this email already exists:');
      console.log('  _id    : ' + existing._id);
      console.log('  name   : ' + existing.name);
      console.log('  role   : ' + existing.role);
      console.log('  active : ' + existing.isActive);
      console.log('');
      console.log('Upgrading to admin and resetting password...');

      existing.role = 'admin';
      existing.isVerified = true;
      existing.profileComplete = true;
      existing.isActive = true;
      const salt = await bcrypt.genSalt(10);
      existing.password = await bcrypt.hash(ADMIN.password, salt);
      await existing.save();

      console.log('');
      console.log('Account upgraded to admin.');
    } else {
      console.log('No existing account. Creating fresh admin...');

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(ADMIN.password, salt);

      const user = new User({
        name: ADMIN.name,
        email: ADMIN.email,
        password: hashedPassword,
        role: 'admin',
        isVerified: true,
        profileComplete: true,
        isActive: true
      });

      await user.save();
      console.log('');
      console.log('Admin created:');
      console.log('  _id  : ' + user._id);
      console.log('  name : ' + user.name);
      console.log('  email: ' + user.email);
    }

    console.log('');
    console.log('======================================');
    console.log('  Admin Credentials');
    console.log('======================================');
    console.log('  Email    : ' + ADMIN.email);
    console.log('  Password : ' + ADMIN.password);
    console.log('  Role     : admin');
    console.log('  Login at : /auth/login');
    console.log('======================================');
    console.log('');
    console.log('Please change this password after first login.');
    console.log('');

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('Failed:', err.message);
    if (err.errors) {
      Object.keys(err.errors).forEach(function (k) {
        console.error('  ' + k + ': ' + err.errors[k].message);
      });
    }
    await mongoose.connection.close().catch(function () {});
    process.exit(1);
  }
})();
