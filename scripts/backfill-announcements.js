// scripts/backfill-announcements.js
require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('../models/Message');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const candidates = await Message.find({
      senderRole: 'nurse',
      parentId: null,
      isAnnouncement: { $ne: true }
    }).sort({ createdAt: 1 }).lean();

    console.log(`🔍 Found ${candidates.length} candidate messages`);

    if (candidates.length === 0) {
      console.log('✅ Nothing to backfill.');
      process.exit(0);
    }

    // Group by nurseId + subject + message + 2-minute bucket
    const groups = {};
    for (const m of candidates) {
      const bucket = Math.floor(new Date(m.createdAt).getTime() / (2 * 60 * 1000));
      const key = `${m.nurseId}_${m.subject}_${m.message}_${bucket}`;
      if (!groups[key]) {
        groups[key] = { announcementId: new mongoose.Types.ObjectId(), ids: [] };
      }
      groups[key].ids.push(m._id);
    }

    console.log(`📦 Grouped into ${Object.keys(groups).length} announcements`);

    let updatedTotal = 0;
    for (const key of Object.keys(groups)) {
      const { announcementId, ids } = groups[key];
      const result = await Message.updateMany(
        { _id: { $in: ids } },
        { $set: { isAnnouncement: true, announcementId } }
      );
      updatedTotal += result.modifiedCount;
    }

    console.log(`🎉 Backfill complete: ${updatedTotal} messages updated`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();