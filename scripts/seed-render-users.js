// scripts/seed-render-users.js
// Creates verified test users (nurse + patient) directly in Atlas.
// Idempotent — safe to run repeatedly.

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// -------- CONFIG --------
const TEST_USERS = [
  {
    role: 'nurse',
    name: 'Nurse Test',
    email: 'nodejsmongodb12@gmail.com',
    password: 'Nurse@1234',
    profile: {
      idNumber: '9001015800088',
      phone: '0814725897',
      dateOfBirth: new Date('1990-01-01'),        // ✅ FIX: added
      gender: 'female',                            // ✅ likely required
      address: 'Windhoek, Namibia',                // ✅ likely required
      qualification: 'Registered Nurse',
      specialization: 'General Care',
      licenseNumber: 'NR-2024-001'
    }
  },
  {
    role: 'patient',
    name: 'Kevin Ngondo',
    email: 'kevinnngondo@gmail.com',
    password: 'Patient@1234',
    profile: {
      idNumber: '9505055800099',
      phone: '0814725890',
      dateOfBirth: new Date('1995-05-05'),
      gender: 'male',
      address: 'Windhoek, Namibia',
      isChronic: false,
      smsOptIn: true
    }
  }
];

// -------- MODELS --------
const User = require('../models/User');
const Patient = require('../models/Patient');
const Nurse = require('../models/Nurse');

// -------- HELPERS --------
const ok = (s) => console.log('\x1b[32m✅ ' + s + '\x1b[0m');
const warn = (s) => console.log('\x1b[33m⚠️  ' + s + '\x1b[0m');
const fail = (s) => console.log('\x1b[31m❌ ' + s + '\x1b[0m');
const info = (s) => console.log('\x1b[36mℹ️  ' + s + '\x1b[0m');
const head = (s) => console.log('\n\x1b[1m═══ ' + s + ' ═══\x1b[0m');

function blindIndex(value) {
  return crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY)
    .update(value.toLowerCase().trim())
    .digest('hex');
}

// -------- MAIN --------
(async () => {
  console.log('\n🌱 SEEDING TEST USERS INTO ATLAS\n');

  if (!process.env.MONGODB_URI) { fail('MONGODB_URI missing'); process.exit(1); }
  if (!process.env.ENCRYPTION_KEY) { fail('ENCRYPTION_KEY missing'); process.exit(1); }

  const isAtlas = process.env.MONGODB_URI.startsWith('mongodb+srv://');
  info('Target: ' + (isAtlas ? 'Atlas ☁️' : 'Local 🖥️'));
  info('Host: ' + process.env.MONGODB_URI.split('@')[1]?.split('/')[0]);

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    ok('Connected');
  } catch (err) {
    fail('Connection failed: ' + err.message);
    process.exit(1);
  }

  for (const spec of TEST_USERS) {
    head(`Creating ${spec.role.toUpperCase()}: ${spec.email}`);

    try {
      const emailHash = blindIndex(spec.email);
      info('emailHash: ' + emailHash.substring(0, 16) + '…');

      // Cleanup — look up by hash
      const existing = await User.findOne({ emailHash });
      if (existing) {
        warn('Existing user found — deleting');
        const uid = existing._id;
        // Delete profile first (in case of FK-like checks)
        await Patient.deleteMany({ userId: uid });
        await Nurse.deleteMany({ userId: uid });
        await User.deleteOne({ _id: uid });
        ok('Old records deleted');
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(spec.password, salt);

      // Create User
      const user = new User({
        name: spec.name,
        email: spec.email,
        password: passwordHash,
        role: spec.role,
        isVerified: true,
        profileComplete: true,
        isActive: true
      });
      await user.save();
      ok('User created: ' + user._id);
      ok('  name : ' + user.name);
      ok('  email: ' + user.email);

      // Create profile
      if (spec.role === 'patient') {
        const patient = new Patient({
          userId: user._id,
          name: spec.name,
          email: spec.email,
          phone: spec.profile.phone,
          idNumber: spec.profile.idNumber,
          dateOfBirth: spec.profile.dateOfBirth,
          gender: spec.profile.gender,
          address: spec.profile.address,
          isChronic: spec.profile.isChronic || false,
          smsOptIn: spec.profile.smsOptIn !== false
        });
        await patient.save();
        ok('Patient profile: ' + patient._id);
        ok('  phone: ' + patient.phone);
      } else if (spec.role === 'nurse') {
        const nurse = new Nurse({
          userId: user._id,
          name: spec.name,
          email: spec.email,
          phone: spec.profile.phone,
          idNumber: spec.profile.idNumber,
          dateOfBirth: spec.profile.dateOfBirth,      // ✅ FIX
          gender: spec.profile.gender,                 // ✅ FIX
          address: spec.profile.address,               // ✅ FIX
          qualification: spec.profile.qualification,
          specialization: spec.profile.specialization,
          licenseNumber: spec.profile.licenseNumber
        });
        await nurse.save();
        ok('Nurse profile: ' + nurse._id);
        ok('  phone: ' + nurse.phone);
      }

      console.log('');
      console.log('  📧 Email   : ' + spec.email);
      console.log('  🔑 Password: ' + spec.password);
      console.log('');

    } catch (err) {
      fail(`Failed to create ${spec.role}: ${err.message}`);
      if (err.errors) {
        Object.keys(err.errors).forEach(k => {
          fail('  ' + k + ': ' + err.errors[k].message);
        });
      }
    }
  }

  // ---- Verification ----
  head('VERIFICATION');
  let userCount = 0, patientCount = 0, nurseCount = 0;

  for (const spec of TEST_USERS) {
    const h = blindIndex(spec.email);
    const u = await User.findOne({ emailHash: h });
    if (u) {
      userCount++;
      console.log(`  ✅ ${spec.role.padEnd(8)} user: ${u._id} — "${u.name}"`);
      if (spec.role === 'patient') {
        const p = await Patient.findOne({ userId: u._id });
        if (p) { patientCount++; console.log(`     ✅ Patient profile: ${p._id}`); }
        else console.log('     ❌ Patient profile MISSING');
      } else if (spec.role === 'nurse') {
        const n = await Nurse.findOne({ userId: u._id });
        if (n) { nurseCount++; console.log(`     ✅ Nurse profile: ${n._id}`); }
        else console.log('     ❌ Nurse profile MISSING');
      }
    } else {
      console.log(`  ❌ ${spec.role.padEnd(8)} user NOT FOUND`);
    }
  }

  console.log('');
  console.log('  Users           : ' + userCount + ' / 2');
  console.log('  Patient profile : ' + patientCount + ' / 1');
  console.log('  Nurse profile   : ' + nurseCount + ' / 1');

  if (userCount === 2 && patientCount === 1 && nurseCount === 1) {
    console.log('');
    ok('🎉 Seed complete');
  } else {
    warn('Some records missing');
  }

  console.log('');
  console.log('  📧 Nurse  : nodejsmongodb12@gmail.com / Nurse@1234');
  console.log('  📧 Patient: kevinnngondo@gmail.com   / Patient@1234');
  console.log('');

  await mongoose.connection.close();
  process.exit(0);
})().catch(err => {
  console.error('\n❌ FATAL:', err);
  process.exit(1);
});
