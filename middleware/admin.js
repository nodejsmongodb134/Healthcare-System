// middleware/admin.js
const { requireAdmin } = require('./auth');

// Re-export the admin check for backward compatibility
module.exports = requireAdmin;