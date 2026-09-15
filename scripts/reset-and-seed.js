// scripts/reset-and-seed.js
// ⚠️ DANGER: Deletes ALL users, profiles, and sessions.
// Then re-seeds test users (nurse, patient, driver).

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// -------- MODELS --------
const User = require('../models/User');
const Patient = require('../models/Patient');
const Nurse = require('../models/Nurse');
const Driver = require('../models/Driver');

// Optional — uncomment if you want to also wipe these:
// const Appointment = require('../models/Appointment');
// const Order = require('../models/Order');
// const Message = require('../models/Message');
// const DriverLocation = require('../models/DriverLocation');

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
      dateOfBirth: new Date('1990-01-01'),
      gender: 'female',
      address: 'Windhoek, Namibia',
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
  },
  {
    role: 'driver',
    name: 'Driver Test',
    email: 'driver@test.com',
    password: 'Driver@1234',
    profile: {
      idNumber: '8808085800077',
      phone: '0814725800',
      dateOfBirth: new Date('1988-08-08'),
      gender: 'male',
      address: 'Windhoek, Namibia',
      licenseNumber: 'DL-2024-001',
      vehiclePlate: 'N-12345-W',
      vehicleType: 'Motorcycle',
      status: 'active'
    }
  }
];

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
  console.log('\n🗑️  RESET & RESEED TEST DATABASE\n');

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

  // ==========================================
  //  PHASE 1 — WIPE EVERYTHING
  // ==========================================
  head('PHASE 1 — Wiping data');

  // --- Sessions (THE KEY FIX) ---
  const sessionsColl = mongoose.connection.collection('sessions');
  const sessionsDeleted = (await sessionsColl.deleteMany({})).deletedCount;
  ok('Sessions deleted: ' + sessionsDeleted + '  ← clears stale browser sessions');

  // --- Users and profiles ---
  const usersDeleted = (await User.deleteMany({})).deletedCount;
  const patientsDeleted = (await Patient.deleteMany({})).deletedCount;
  const nursesDeleted = (await Nurse.deleteMany({})).deletedCount;
  const driversDeleted = (await Driver.deleteMany({})).deletedCount;

  ok('Users deleted    : ' + usersDeleted);
  ok('Patients deleted : ' + patientsDeleted);
  ok('Nurses deleted   : ' + nursesDeleted);
  ok('Drivers deleted  : ' + driversDeleted);

  // --- Optional: wipe dependent data ---
  // Uncomment to also reset appointments/orders/messages:
  //
  // const apptsDeleted = (await Appointment.deleteMany({})).deletedCount;
  // const ordersDeleted = (await Order.deleteMany({})).deletedCount;
  // const msgsDeleted = (await Message.deleteMany({})).deletedCount;
  // const locsDeleted = (await DriverLocation.deleteMany({})).deletedCount;
  // ok('Appointments deleted : ' + apptsDeleted);
  // ok('Orders deleted       : ' + ordersDeleted);
  // ok('Messages deleted     : ' + msgsDeleted);
  // ok('Driver locations     : ' + locsDeleted);

  // ==========================================
  //  PHASE 2 — RESEED
  // ==========================================
  head('PHASE 2 — Seeding fresh users');

  for (const spec of TEST_USERS) {
    console.log('\n▸ ' + spec.role.toUpperCase() + ': ' + spec.email);

    try {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(spec.password, salt);

      if (spec.role === 'driver') {
        const driver = new Driver({
          name: spec.name,
          email: spec.email,
          password: passwordHash,
          phone: spec.profile.phone,
          idNumber: spec.profile.idNumber,
          dateOfBirth: spec.profile.dateOfBirth,
          gender: spec.profile.gender,
          address: spec.profile.address,
          licenseNumber: spec.profile.licenseNumber,
          vehiclePlate: spec.profile.vehiclePlate,
          vehicleType: spec.profile.vehicleType,
          status: spec.profile.status || 'active',
          isActive: true,
          isVerified: true
        });
        await driver.save();
        ok('  Driver: ' + driver._id);
      } else {
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
        ok('  User: ' + user._id);

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
          ok('  Patient profile: ' + patient._id);
        } else if (spec.role === 'nurse') {
          const nurse = new Nurse({
            userId: user._id,
            name: spec.name,
            email: spec.email,
            phone: spec.profile.phone,
            idNumber: spec.profile.idNumber,
            dateOfBirth: spec.profile.dateOfBirth,
            gender: spec.profile.gender,
            address: spec.profile.address,
            qualification: spec.profile.qualification,
            specialization: spec.profile.specialization,
            licenseNumber: spec.profile.licenseNumber
          });
          await nurse.save();
          ok('  Nurse profile: ' + nurse._id);
        }
      }

      console.log('    📧 ' + spec.email);
      console.log('    🔑 ' + spec.password);
    } catch (err) {
      fail('  ' + err.message);
      if (err.errors) Object.keys(err.errors).forEach(k => fail('    ' + k + ': ' + err.errors[k].message));
    }
  }

  // ==========================================
  //  PHASE 3 — VERIFY
  // ==========================================
  head('PHASE 3 — Verification');

  const finalUsers = await User.countDocuments({});
  const finalPatients = await Patient.countDocuments({});
  const finalNurses = await Nurse.countDocuments({});
  const finalDrivers = await Driver.countDocuments({});
  const finalSessions = await sessionsColl.countDocuments({});

  console.log('  Users           : ' + finalUsers);
  console.log('  Patients        : ' + finalPatients);
  console.log('  Nurses          : ' + finalNurses);
  console.log('  Drivers         : ' + finalDrivers);
  console.log('  Sessions        : ' + finalSessions + '  ← should be 0');

  console.log('');
  if (finalUsers === 2 && finalPatients === 1 && finalNurses === 1 && finalDrivers === 1) {
    ok('🎉 Reset & reseed complete');
  } else {
    warn('Counts unexpected — check above');
  }

  console.log('');
  console.log('  🚨 IMPORTANT — Clear your browser cookies for localhost:3000');
  console.log('      or open the site in an incognito window.');
  console.log('      The stale session is what caused "User from DB: Not found".');
  console.log('');
  console.log('  Test credentials:');
  console.log('  📧 Nurse  : nodejsmongodb12@gmail.com  / Nurse@1234    → /auth/login');
  console.log('  📧 Patient: kevinnngondo@gmail.com    / Patient@1234  → /auth/login');
  console.log('  📧 Driver : driver@test.com           / Driver@1234   → /driver/login');
  console.log('');

  await mongoose.connection.close();
  process.exit(0);
})().catch(err => {
  console.error('\n❌ FATAL:', err);
  process.exit(1);
});
