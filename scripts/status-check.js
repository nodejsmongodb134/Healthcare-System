require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected\n');

  const collections = [
    { name: 'Users',        coll: 'users',        hashFields: ['emailHash'] },
    { name: 'Patients',     coll: 'patients',     hashFields: ['emailHash', 'idNumberHash'] },
    { name: 'Nurses',       coll: 'nurses',       hashFields: ['emailHash', 'idNumberHash'] },
    { name: 'Drivers',      coll: 'drivers',      hashFields: ['emailHash', 'idNumberHash'] },
    { name: 'Appointments', coll: 'appointments', hashFields: [] },
    { name: 'Orders',       coll: 'orders',       hashFields: [] },
    { name: 'Messages',     coll: 'messages',     hashFields: [] },
    { name: 'AuditLogs',    coll: 'auditlogs',    hashFields: [] }
  ];

  for (const { name, coll, hashFields } of collections) {
    const c = mongoose.connection.collection(coll);
    const docs = await c.find({}).toArray();

    let hashedOK = 0;
    let hashedMissing = 0;
    let encryptedCount = 0;
    let plaintextCount = 0;

    for (const d of docs) {
      // Check hash fields
      let hashesOK = true;
      for (const hf of hashFields) {
        if (!d[hf]) hashesOK = false;
      }
      if (hashesOK && hashFields.length > 0) hashedOK++;
      else if (hashFields.length > 0) hashedMissing++;

      // Check if any field looks encrypted (contains | and splits into 3 parts)
      const isEnc = Object.values(d).some(
        v => typeof v === 'string' && v.includes('|') && v.split('|').length === 3
      );
      if (isEnc) encryptedCount++;
      else plaintextCount++;
    }

    let line = '  ' + name.padEnd(14) + ': ' + docs.length + ' total';
    if (hashFields.length > 0) {
      line += ' | hashes: ' + hashedOK + ' OK, ' + hashedMissing + ' missing';
    }
    line += ' | ' + encryptedCount + ' encrypted, ' + plaintextCount + ' plaintext';
    console.log(line);
  }

  console.log('\n🎉 Status check complete');
  process.exit(0);
})();
