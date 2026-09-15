// scripts/backfill-timestamps.js
require('dotenv').config();
const mongoose = require('mongoose');

const COLLECTIONS = [
  'users', 'patients', 'nurses', 'drivers',
  'appointments', 'orders', 'messages'
];

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');

    let grandTotal = 0;

    for (const name of COLLECTIONS) {
      const coll = mongoose.connection.collection(name);

      const missing = await coll.countDocuments({
        $or: [
          { createdAt: { $exists: false } },
          { createdAt: null },
          { updatedAt: { $exists: false } },
          { updatedAt: null }
        ]
      });

      if (missing === 0) {
        console.log(`✅ ${name.padEnd(15)} — all good`);
        continue;
      }

      // Fill missing createdAt from _id timestamp (or now)
      await coll.updateMany(
        { $or: [{ createdAt: { $exists: false } }, { createdAt: null }] },
        [{ $set: { createdAt: { $toDate: '$_id' } } }]
      );

      // Fill missing updatedAt with createdAt
      await coll.updateMany(
        { $or: [{ updatedAt: { $exists: false } }, { updatedAt: null }] },
        [{ $set: { updatedAt: '$createdAt' } }]
      );

      console.log(`✏️  ${name.padEnd(15)} — fixed ${missing} docs`);
      grandTotal += missing;
    }

    console.log(`\n✅ Total docs updated: ${grandTotal}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
})();
