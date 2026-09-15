// middleware/auth.js

/**
 * Require the user to be logged in.
 * Redirects to /auth/login if not authenticated.
 */
function requireAuth(req, res, next) {
  if (!req.session.user && !req.session.driver) {
    req.flash('error_msg', 'Please login first');
    return res.redirect('/auth/login');
  }
  next();
}

/**
 * Require the user to be logged in as a specific role.
 * @param {string|string[]} roles - e.g., 'admin' or ['admin', 'nurse']
 */
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }
    const allowed = Array.isArray(roles) ? roles : [roles];
    if (!allowed.includes(req.session.user.role)) {
      console.warn(`🚫 Access denied for role "${req.session.user.role}" on ${req.originalUrl}`);
      req.flash('error_msg', 'Access denied. Insufficient permissions.');
      return res.redirect('/auth/login');
    }
    next();
  };
}

/**
 * Require the user to be logged in as a driver.
 */
function requireDriver(req, res, next) {
  if (!req.session.driver) {
    req.flash('error_msg', 'Please login first');
    return res.redirect('/driver/login');
  }
  next();
}

module.exports = {
  requireAuth,
  requireRole,
  requireDriver,
  // Convenience shortcuts
  requireAdmin:   requireRole('admin'),
  requireNurse:   requireRole('nurse'),
  requirePatient: requireRole('patient'),
  requireNurseOrAdmin: requireRole(['admin', 'nurse']),
};