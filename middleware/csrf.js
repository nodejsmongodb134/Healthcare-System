// middleware/csrf.js
const { doubleCsrf } = require('csrf-csrf');

const isProduction = process.env.NODE_ENV === 'production';

// Debug logs only when DEBUG_CSRF=true in .env
const DEBUG_CSRF = process.env.DEBUG_CSRF === 'true';

const {
  invalidCsrfTokenError,
  generateCsrfToken,
  doubleCsrfProtection
} = doubleCsrf({
  getSecret: () =>
    process.env.CSRF_SECRET ||
    process.env.SESSION_SECRET ||
    'dev-only-fallback-secret',

  getSessionIdentifier: (req) => req.sessionID || '',

  cookieName: 'x-csrf-token',
  cookieOptions: {
    sameSite: 'lax',
    path: '/',
    secure: isProduction,
    httpOnly: true
  },

  size: 64,

  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],

  // Accept token from header, body, query, OR cookie
  // (cookie fallback is essential for multipart/form-data uploads
  //  because multer parses the body AFTER csrf middleware runs)
  getCsrfTokenFromRequest: (req) => {
    const fromHeader = req.headers['x-csrf-token'] || '';
    const fromBody   = (req.body && req.body._csrf) || '';
    const fromQuery  = (req.query && req.query._csrf) || '';
    const fromCookie = (req.cookies && req.cookies['x-csrf-token']) || '';

    const token = fromHeader || fromBody || fromQuery || fromCookie || '';

    if (DEBUG_CSRF && req.method !== 'GET' && req.method !== 'HEAD') {
      console.log('📥 CSRF token source:', {
        header: !!fromHeader,
        body:   !!fromBody,
        query:  !!fromQuery,
        cookie: !!fromCookie,
        len:    token.length
      });
    }
    return token;
  }
});

// Only generate on GET/HEAD — don't invalidate on POST
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
      console.warn('⚠️ CSRF rejected:', req.method, req.originalUrl, '| IP:', req.ip);
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
