const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/admin');
const AuditLog = require('../models/AuditLog');

// ===================== AUDIT LOG PAGE =====================
router.get('/audit', adminMiddleware, async (req, res) => {
  try {
    const { userId, action, entityType, startDate, endDate, page = 1, limit = 50 } = req.query;

    // Build filter
    const filter = {};
    if (userId) filter.userId = userId;
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    // Get distinct values for filter dropdowns
    const [users, actions, entityTypes] = await Promise.all([
      AuditLog.distinct('username', {}),
      AuditLog.distinct('action', {}),
      AuditLog.distinct('entityType', {})
    ]);

    // Paginate
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, totalCount] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        ,
      AuditLog.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.render('admin/audit', {
      title: 'Audit Log',
      user: req.session.user,
      logs,
      totalCount,
      currentPage: parseInt(page),
      totalPages,
      limit: parseInt(limit),
      filters: { userId, action, entityType, startDate, endDate },
      users,
      actions,
      entityTypes,
    });
  } catch (error) {
    console.error('Audit page error:', error);
    req.flash('error_msg', 'Failed to load audit log');
    res.redirect('/admin/dashboard');
  }
});

module.exports = router;
