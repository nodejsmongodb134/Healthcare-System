const AuditLog = require('../models/AuditLog');

/**
 * Log an admin action
 * @param {Object} req - Express request object (to get user and IP)
 * @param {string} action - e.g., 'create', 'update', 'delete', 'assign', 'revoke', 'change_password', 'toggle_status', 'send_sms'
 * @param {string} entityType - e.g., 'nurse', 'driver', 'patient', 'appointment', 'order', 'message', 'user'
 * @param {string|null} entityId - MongoDB ObjectId of the affected entity (optional)
 * @param {Object} details - Additional details (e.g., old/new values)
 */
async function logAdminAction(req, action, entityType, entityId = null, details = {}) {
  try {
    // Get user from session
    const user = req.session.user;
    if (!user) {
      console.warn('⚠️ Cannot log action: no user in session');
      return;
    }

    // Determine role (admin or nurse) – we mainly log admin actions
    const role = user.role === 'admin' ? 'admin' : 'nurse';

    // Get IP address
    const ipAddress = req.ip || req.connection.remoteAddress || null;

    // Build audit log entry
    const logEntry = new AuditLog({
      userId: user.id,
      username: user.name,
      role: role,
      action: action,
      entityType: entityType,
      entityId: entityId || null,
      details: details,
      ipAddress: ipAddress
    });

    await logEntry.save();
    console.log(`✅ Audit log: ${user.name} (${role}) ${action} ${entityType}${entityId ? ' ID '+entityId : ''}`);
  } catch (error) {
    console.error('❌ Failed to save audit log:', error);
  }
}

module.exports = { logAdminAction };