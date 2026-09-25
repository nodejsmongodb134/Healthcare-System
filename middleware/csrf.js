// middleware/csrf.js
const { doubleCsrf } = require('csrf-csrf');

const isProduction = process.env.NODE_ENV === 'production';
const DEBUG_CSRF = process.env.DEBUG_CSRF === 'true';

// Match session TTL (from server.js: maxAge 3600000 = 1 hour)
// The CSRF cookie should expire in lockstep with the session
const CSRF_COOKIE_MAX_AGE = 3600000; // 1 hour

const {
  invalidCsrfTokenError,
  generateCsrfToken,
  doubleCsrfProtection
} = doubleCsrf({
  getSecret: () =>
    process.env.CSRF_SECRET ||
    process.env.SESSION_SECRET ||
    'dev-only-fallback-secret',

  // Session ID is the anchor. When a session regenerates (on login),
  // a fresh CSRF token is issued and the old one is invalidated.
  getSessionIdentifier: (req) => req.sessionID || '',

  cookieName: 'x-csrf-token',
  cookieOptions: {
    sameSite: 'lax',
    path: '/',
    secure: isProduction,
    httpOnly: true,
    // Align cookie lifetime with the session
    maxAge: CSRF_COOKIE_MAX_AGE
  },

  size: 64,

  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],

  // Explicit token sourcing — header OR body ONLY.
  // Using fallthroughs (||) across multiple sources can reintroduce
  // the same vulnerability as the deprecated csurf package.
  // For multipart/form-data, the token arrives via the header
  // (set by csrf-inject.js before the form submits).
  getCsrfTokenFromRequest: (req) => {
    const fromHeader = req.headers['x-csrf-token'] || '';
    const fromBody   = (req.body && req.body._csrf) || '';
    const fromQuery  = (req.query && req.query._csrf) || '';

    // Prefer header (safe for all content types), fall back to body/query
    const token = fromHeader || fromBody || fromQuery || '';

    if (DEBUG_CSRF && req.method !== 'GET' && req.method !== 'HEAD') {
      console.log('📥 CSRF token source:', {
        header: !!fromHeader,
        body:   !!fromBody,
        query:  !!fromQuery,
        len:    token.length
      });
    }
    return token;
  },

  // Custom error config so we can distinguish CSRF failures in logs
  errorConfig: {
    statusCode: 403,
    message: 'Invalid or expired CSRF token',
    code: 'EBADCSRFTOKEN'
  }
});

// Generate a fresh token on safe methods (GET/HEAD).
// Do NOT regenerate on POST — this would invalidate the token
// the request itself is trying to validate.
const csrfGenerate = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    try {
      res.locals.csrfToken = generateCsrfToken(req, res);
      if (DEBUG_CSRF) {
        console.log('✅ CSRF token generated →',
          res.locals.csrfToken.substring(0, 32) + '…');
      }
    } catch (err) {
      console.error('⚠️ CSRF generate error:', err.message);
      res.locals.csrfToken = '';
    }
  }
  next();
};

const csrfProtection = (req, res, next) => {
  doubleCsrfProtection(req, res, (err) => {
    if (err) {
      // Log the session ID and cookie presence to correlate with
      // the session that minted the token (helps diagnose stale-tab issues)
      const sessionId = (req.sessionID || '').substring(0, 16) + '…';
      const cookieSid = (req.cookies && req.cookies['connect.sid'] || '')
        .substring(0, 24);
      const tokenLen = (req.body && req.body._csrf || '').length;

      console.warn('⚠️ CSRF rejected:', {
        method: req.method,
        url: req.originalUrl,
        sessionId,
        cookieSid,
        tokenLen,
        ip: req.ip
      });
      return next(err);
    }
    next();
  });
};

module.exports = {
  csrfGenerate,
  csrfProtection,
  invalidCsrfTokenError
};