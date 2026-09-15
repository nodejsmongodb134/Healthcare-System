require('dotenv').config();
const mongoose = require('mongoose');

const ENCRYPTED_FIELDS = {
  users:        ['name', 'email'],
  patients:     ['name', 'idNumber', 'phone', 'email', 'medicationName'],
  nurses:       ['name', 'idNumber', 'phone', 'email', 'qualification', 'specialization', 'licenseNumber'],
  drivers:      ['name', 'idNumber', 'phone', 'email', 'licenseNumber', 'vehiclePlate'],
  appointments: ['patientName', 'patientEmail', 'patientPhone', 'description', 'nurseName'],
  orders:       ['patientName', 'patientEmail', 'patientPhone', 'prescriptionName', 'location', 'driverName', 'driverPhone', 'notes'],
  messages:     ['patientName', 'patientEmail', 'patientPhone', 'subject', 'message', 'nurseName', 'nurseReply']
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected\n');

  const models = [
    { name: 'User',        coll: 'users',        path: '../models/User' },
    { name: 'Patient',     coll: 'patients',     path: '../models/Patient' },
    { name: 'Nurse',       coll: 'nurses',       path: '../models/Nurse' },
    { name: 'Driver',      coll: 'drivers',      path: '../models/Driver' },
    { name: 'Appointment', coll: 'appointments', path: '../models/Appointment' },
    { name: 'Order',       coll: 'orders',       path: '../models/Order' },
    { name: 'Message',     coll: 'messages',     path: '../models/Message' },
    { name: 'AuditLog',    coll: 'auditlogs',    path: '../models/AuditLog' }
  ];

  for (const { name, coll, path } of models) {
    const collection = mongoose.connection.collection(coll);
    const rawDocs = await collection.find({}).toArray();
    const Model = require(path);
    const fields = ENCRYPTED_FIELDS[coll] || [];

    let count = 0, skipped = 0, failed = 0;

    for (const raw of rawDocs) {
      // Skip if already encrypted
      const isEncrypted = Object.values(raw).some(
        v => typeof v === 'string' && v.includes('|') && v.split('|').length === 3
      );
      if (isEncrypted) { skipped++; continue; }

      try {
        const doc = await Model.findById(raw._id);
        if (!doc) { failed++; continue; }

        // 🔑 Force a "set" on each encrypted field using the raw plaintext value
        for (const field of fields) {
          const rawValue = raw[field];
          if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
            doc.set(field, rawValue);   // triggers the plugin's encryption setter
          }
        }

        if (doc.schema.path('updatedAt')) doc.updatedAt = Date.now();

        await doc.save();
        count++;
      } catch (e) {
        failed++;
        if (failed <= 3) console.log('  ⚠️ ' + name + ': ' + e.message);
      }
    }

    console.log('  ' + name.padEnd(14) + ': ' + count + ' encrypted, ' + skipped + ' already, ' + failed + ' failed');
  }

  console.log('\n🎉 Done');
  process.exit(0);
})();
