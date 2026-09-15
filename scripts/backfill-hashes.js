require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

function hash(v) {
  if (!v) return null;
  return crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY)
    .update(String(v).toLowerCase().trim())
    .digest('hex');
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected');

  const models = [
    { name: 'User',    coll: 'users',    unique: ['email'] },
    { name: 'Patient', coll: 'patients', unique: ['email', 'idNumber'] },
    { name: 'Nurse',   coll: 'nurses',   unique: ['email', 'idNumber'] },
    { name: 'Driver',  coll: 'drivers',  unique: ['email', 'idNumber'] }
  ];

  for (const { name, coll, unique } of models) {
    // Read raw documents directly — bypasses Mongoose encrypted getters
    const collection = mongoose.connection.collection(coll);
    const docs = await collection.find({}).toArray();
    let updated = 0;

    for (const doc of docs) {
      const set = {};
      for (const field of unique) {
        // Only work with plaintext values (not already-encrypted strings)
        const raw = doc[field];
        if (typeof raw === 'string' && raw.length > 0 && !raw.includes('|')) {
          if (!doc[field + 'Hash']) {
            set[field + 'Hash'] = hash(raw);
          }
        }
      }
      if (Object.keys(set).length) {
        await collection.updateOne({ _id: doc._id }, { $set: set });
        updated++;
      }
    }

    console.log('  ' + name + ': ' + updated + '/' + docs.length + ' backfilled');
  }

  console.log('🎉 Done');
  process.exit(0);
})();
