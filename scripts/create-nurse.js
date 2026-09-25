// scripts/create-nurse.js
// Creates (or updates) a nurse account with User + Nurse profile.
// Idempotent — safe to run repeatedly.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Nurse = require('../models/Nurse');
const { blindIndex } = require('../utils/blindIndex');

const NURSE = {
  name: 'Test Nurse',
  email: 'nodejsmongodb12@gmail.com',
  password: 'Nurse@1234',
  idNumber: '9001015800088',
  phone: '0814725897',
  dateOfBirth: new Date('1990-01-01'),
  qualification: 'Registered Nurse',
  specialization: 'General Care',
  yearsOfExperience: 5,
  licenseNumber: 'NR-2024-001'
};

function calculateAge(dob) {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

(async () => {
  console.log('');
  console.log('========================================');
  console.log('  Create Nurse Account');
  console.log('========================================');
  console.log('');

  if (!process.env.MONGODB_URI)   { console.error('MONGODB_URI missing');   process.exit(1); }
  if (!process.env.ENCRYPTION_KEY) { console.error('ENCRYPTION_KEY missing'); process.exit(1); }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }

  try {
    const emailHash = blindIndex(NURSE.email);
    const idNumberHash = blindIndex(NURSE.idNumber);

    // ---- 1. User document ----
    let user = await User.findOne({ emailHash });
    let action = 'created';

    if (user) {
      action = 'updated';
      console.log('Existing user found — updating:');
      console.log('  _id  : ' + user._id);
      console.log('  role : ' + user.role + ' -> nurse');
      user.role = 'nurse';
      user.isVerified = true;
      user.profileComplete = true;
      user.isActive = true;
      user.name = NURSE.name;
      // Reset password
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(NURSE.password, salt);
      await user.save();
    } else {
      console.log('Creating fresh User document...');
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(NURSE.password, salt);
      user = new User({
        name: NURSE.name,
        email: NURSE.email,
        password: hashed,
        role: 'nurse',
        isVerified: true,
        profileComplete: true,
        isActive: true
      });
      await user.save();
    }

    console.log('User ' + action + ': ' + user._id);

    // ---- 2. Nurse profile ----
    let nurse = await Nurse.findOne({ userId: user._id });
    const age = calculateAge(NURSE.dateOfBirth);

    if (nurse) {
      console.log('Existing Nurse profile found — updating');
      nurse.name = NURSE.name;
      nurse.idNumber = NURSE.idNumber;
      nurse.idNumberHash = idNumberHash;
      nurse.phone = NURSE.phone;
      nurse.email = NURSE.email;
      nurse.emailHash = emailHash;
      nurse.dateOfBirth = NURSE.dateOfBirth;
      nurse.age = age;
      nurse.qualification = NURSE.qualification;
      nurse.specialization = NURSE.specialization;
      nurse.yearsOfExperience = NURSE.yearsOfExperience;
      nurse.licenseNumber = NURSE.licenseNumber;
      await nurse.save();
    } else {
      console.log('Creating Nurse profile...');
      nurse = new Nurse({
        userId: user._id,
        name: NURSE.name,
        idNumber: NURSE.idNumber,
        phone: NURSE.phone,
        email: NURSE.email,
        dateOfBirth: NURSE.dateOfBirth,
        age: age,
        qualification: NURSE.qualification,
        specialization: NURSE.specialization,
        yearsOfExperience: NURSE.yearsOfExperience,
        licenseNumber: NURSE.licenseNumber
      });
      await nurse.save();
    }

    console.log('Nurse profile: ' + nurse._id);
    console.log('');

    // ---- 3. Verify ----
    const check = await User.findOne({ emailHash });
    const profile = await Nurse.findOne({ userId: user._id });

    console.log('========================================');
    console.log('  Nurse Account Ready');
    console.log('========================================');
    console.log('  Email    : ' + NURSE.email);
    console.log('  Password : ' + NURSE.password);
    console.log('  Role     : nurse');
    console.log('  User ID  : ' + user._id);
    console.log('  Nurse ID : ' + nurse._id);
    console.log('  Verified : ' + check.isVerified);
    console.log('  Active   : ' + check.isActive);
    console.log('  Profile  : ' + (profile ? 'OK' : 'MISSING'));
    console.log('  Login at : /auth/login');
    console.log('========================================');
    console.log('');
    console.log('Note: Nurse is already verified + profileComplete=true.');
    console.log('      You will land on /auth/nurse-dashboard after login.');
    console.log('');

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('Failed:', err.message);
    if (err.errors) {
      Object.keys(err.errors).forEach(k => console.error('  ' + k + ': ' + err.errors[k].message));
    }
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
  }
})();
