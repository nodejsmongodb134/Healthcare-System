require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const MongoStore = require('connect-mongo');

const {
  requireAuth,
  requireRole,
  requireDriver,
  requireAdmin,
  requireNurse,
  requirePatient
} = require('./middleware/auth');

const {
  loginLimiter,
  registerLimiter,
  forgotLimiter,
  driverLoginLimiter
} = require('./middleware/rateLimiter');

const {
  csrfGenerate,
  csrfProtection,
  invalidCsrfTokenError
} = require('./middleware/csrf');

// ============ Models ============
const DriverLocation = require('./models/DriverLocation');
const Driver = require('./models/Driver');

// ============ Routes ============
const nurseAnnouncementRoutes = require('./routes/nurse-announcement');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const appointmentRoutes = require('./routes/appointment');
const viewAppointmentRoutes = require('./routes/view-appointment');
const messageRoutes = require('./routes/message');
const orderRoutes = require('./routes/order');
const nurseAppointmentRoutes = require('./routes/nurse-appointment');
const nurseMessageRoutes = require('./routes/nurse-message');
const createDriverRoutes = require('./routes/create-driver');
const nursePatientRoutes = require('./routes/nurse.patient');
const nurseOrderRoutes = require('./routes/nurse-order');
const driverRoutes = require('./routes/driver');
const nurseProfileRoutes = require('./routes/nurse-profile');
const nurseSmsRoutes = require('./routes/nurse-sms');
const nurseTrackingRoutes = require('./routes/nurse-tracking');
require('./cron/automated-notifications');

const adminAuditRoutes = require('./routes/admin-audit');
const adminAnalyticsRoutes = require('./routes/admin-analytics');
const adminExportDataRoutes = require('./routes/admin-export-data');
const adminActionsNotificationRoutes = require('./routes/admin-actions-notification');
const adminRoutes = require('./routes/admin');
const adminDriverRoutes = require('./routes/admin-driver');
const adminCreateDriverRoutes = require('./routes/admin-create-driver');
const adminOrderManagementRoutes = require('./routes/admin-order-management');
const adminMessageManagementRoutes = require('./routes/admin-message-management');
const managePatientAccountsRoutes = require('./routes/admin-manage-patient-accounts');
const adminNurseAccountsRoutes = require('./routes/admin-nurse-accounts');
const adminAnnouncementRoutes = require('./routes/admin-announcement');

const app = express();

// ============ TRUST PROXY (required for Render HTTPS) ============
app.set('trust proxy', 1);

// ============ MongoDB ============
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ============ View Engine ============
app.set('view engine', 'ejs');

// ============ Body Parser ============
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ============ Cookie Parser ============
app.use(cookieParser());

// ============ Static Files ============
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ============ TILE SERVER FOR OFFLINE MAPS ============
const tilesPath = path.join(__dirname, 'public', 'tiles');
const hasTiles = fs.existsSync(tilesPath);

app.get('/tiles/:z/:x/:y.png', (req, res) => {
  const { z, x, y } = req.params;
  const tilePath = path.join(tilesPath, z, x, `${y}.png`);

  if (fs.existsSync(tilePath)) {
    res.sendFile(tilePath);
  } else {
    const blankPNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8//8/AwAI/AL+fH5B4AAAAABJRU5ErkJggg==',
      'base64'
    );
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(blankPNG);
  }
});

app.get('/api/tiles/status', (req, res) => {
  res.json({ available: hasTiles, path: '/tiles/{z}/{x}/{y}.png' });
});

console.log(`🗺️ Offline tiles: ${hasTiles ? '✅ Available' : '❌ Not found'}`);

// ============================================================
// ============ MIDDLEWARE STACK (ORDER MATTERS) ==============
// ============================================================

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 3600,
    autoRemove: 'native'
  }),
  cookie: {
    maxAge: 3600000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
});

app.use(sessionMiddleware);

// ---------- 2. FLASH ----------
app.use(flash());

// ---------- 3. CSRF ----------
app.use(csrfGenerate);
app.use(csrfProtection);

// ---------- 4. Auto-inject CSRF meta tag + script ----------
app.use((req, res, next) => {
  const originalSend = res.send.bind(res);

  res.send = function (body) {
    if (typeof body === 'string') {
      // Inject meta tag in <head>
      if (body.indexOf('</head>') !== -1 && res.locals.csrfToken) {
        if (body.indexOf('name="csrf-token"') === -1) {
          const metaTag = `<meta name="csrf-token" content="${res.locals.csrfToken}">`;
          body = body.replace('</head>', `    ${metaTag}\n</head>`);
        }
      }
      // Inject client script before </body>
      if (body.indexOf('</body>') !== -1) {
        if (body.indexOf('/js/csrf-inject.js') === -1) {
          body = body.replace('</body>', `    <script src="/js/csrf-inject.js"></script>\n</body>`);
        }
      }
    }
    return originalSend(body);
  };
  next();
});

// ---------- 5. Request Logging (non-GET only) ----------
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    const who =
      (req.session && req.session.user && req.session.user.email) ||
      (req.session && req.session.driver && req.session.driver.email) ||
      'anonymous';
    console.log(`🌐 [${req.method}] ${req.url} — ${who}`);
  }
  next();
});

// ---------- 6. Locals & Flash ----------
app.use((req, res, next) => {
  const successMsgs = req.flash('success_msg');
  const errorMsgs   = req.flash('error_msg');
  const warningMsgs = req.flash('warning_msg');
  const infoMsgs    = req.flash('info_msg');

  res.locals.success_msg = successMsgs.length ? successMsgs : null;
  res.locals.error_msg   = errorMsgs.length   ? errorMsgs   : null;
  res.locals.warning_msg = warningMsgs.length ? warningMsgs : null;
  res.locals.info_msg    = infoMsgs.length    ? infoMsgs    : null;

  res.locals.user   = req.session.user   || null;
  res.locals.driver = req.session.driver || null;
  next();
});

// ============================================================
// ============ ROUTE MOUNTING ================================
// ============================================================

// ---------- Rate limiters ----------
app.post('/auth/login',    loginLimiter);
app.post('/auth/register', registerLimiter);
app.post('/auth/forgot',   forgotLimiter);
app.post('/driver/login',  driverLoginLimiter);

// ---------- Auth ----------
app.use('/auth', authRoutes);

// ---------- Patient ----------
app.use('/patient', requirePatient, profileRoutes);
app.use('/patient', requirePatient, appointmentRoutes);
app.use('/patient', requirePatient, viewAppointmentRoutes);
app.use('/patient', requirePatient, messageRoutes);
app.use('/patient', requirePatient, orderRoutes);

// ---------- Nurse ----------
app.use('/nurse', requireNurse, nurseAppointmentRoutes);
app.use('/nurse', requireNurse, nurseMessageRoutes);
app.use('/nurse', requireNurse, createDriverRoutes);
app.use('/nurse', requireNurse, nursePatientRoutes);
app.use('/nurse', requireNurse, nurseOrderRoutes);
app.use('/nurse', requireNurse, nurseProfileRoutes);
app.use('/nurse', requireNurse, nurseSmsRoutes);
app.use('/nurse', requireNurse, nurseTrackingRoutes);
app.use('/nurse', requireNurse, nurseAnnouncementRoutes);

// ---------- Driver ----------
app.use('/driver', driverRoutes);

// ---------- Admin ----------
app.use('/admin', requireAdmin, adminAuditRoutes);
app.use('/admin', requireAdmin, adminAnalyticsRoutes);
app.use('/admin', requireAdmin, adminExportDataRoutes);
app.use('/admin', requireAdmin, adminActionsNotificationRoutes);
app.use('/admin', requireAdmin, adminCreateDriverRoutes);
app.use('/admin', requireAdmin, adminDriverRoutes);
app.use('/admin', requireAdmin, adminNurseAccountsRoutes);
app.use('/admin', requireAdmin, managePatientAccountsRoutes);
app.use('/admin', requireAdmin, adminOrderManagementRoutes);
app.use('/admin', requireAdmin, adminMessageManagementRoutes);
app.use('/admin', requireAdmin, adminRoutes);
app.use('/admin', requireAdmin, adminAnnouncementRoutes);

console.log('✅ All routes loaded with role-based protection');

// ============ Homepage ============
app.get('/', (req, res) => {
  if (req.session.user) {
    const dashboard = req.session.user.role === 'nurse'
      ? '/auth/nurse-dashboard'
      : '/auth/patient-dashboard';
    return res.redirect(dashboard);
  }
  if (req.session.driver) {
    return res.redirect('/driver/dashboard');
  }
  res.render('index', { title: 'Appointment Booking' });
});

// ============ CSRF Error Handler ============
app.use((err, req, res, next) => {
  if (
    err === invalidCsrfTokenError ||
    err.code === 'EBADCSRFTOKEN' ||
    (err.message && err.message.toLowerCase().indexOf('csrf') !== -1)
  ) {
    const wantsJson =
      req.xhr ||
      (req.headers.accept || '').indexOf('application/json') !== -1 ||
      req.originalUrl.indexOf('/api/') === 0;

    if (wantsJson) {
      return res.status(403).json({ error: 'Invalid or expired CSRF token' });
    }

    req.flash('error_msg', 'Session expired. Please refresh the page and try again.');

    let backUrl = req.get('Referer') || '/';
    try {
      const refUrl = new URL(backUrl);
      if (refUrl.host !== req.get('Host')) backUrl = '/';
    } catch (e) {
      backUrl = '/';
    }
    return res.redirect(backUrl);
  }
  next(err);
});

// ============ Generic Error Handler ============
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  req.flash('error_msg', 'Something went wrong. Please try again.');
  res.redirect('/');
});

// ============ HTTP Server + Socket.IO ============
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ============ Manual Session Sharing for Socket.IO ============
io.use((socket, next) => {
  const cookieHeader = socket.handshake.headers.cookie;
  if (!cookieHeader) {
    return next(new Error('Authentication required'));
  }

  let sessionId = null;
  const cookies = cookieHeader.split('; ');
  for (let i = 0; i < cookies.length; i++) {
    const [key, value] = cookies[i].split('=');
    if (key === 'connect.sid') {
      sessionId = value;
      break;
    }
  }

  if (!sessionId) {
    return next(new Error('Authentication required'));
  }

  sessionMiddleware(socket.handshake, {}, (err) => {
    if (err) {
      return next(new Error('Authentication failed'));
    }

    const session = socket.handshake.session;
    if (session && session.user) {
      socket.userId = session.user.id;
      socket.userRole = session.user.role;
      next();
    } else if (session && session.driver) {
      socket.driverId = session.driver.id;
      socket.userRole = 'driver';
      next();
    } else {
      next(new Error('Authentication required'));
    }
  });
});

// ============ Active driver tracking ============
const activeDrivers = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  socket.on('driver-location-update', async (data) => {
    try {
      const { latitude, longitude, accuracy, speed } = data;
      const driverId = socket.driverId;
      if (!driverId) return;

      activeDrivers.set(driverId, {
        socketId: socket.id,
        latitude, longitude, accuracy, speed,
        lastUpdate: Date.now()
      });

      io.emit('driver-location-update', {
        driverId, latitude, longitude, accuracy, speed,
        timestamp: Date.now()
      });

      const driver = await Driver.findById(driverId).select('name');
      if (driver) {
        DriverLocation.create({
          driverId,
          driverName: driver.name,
          latitude, longitude, accuracy, speed
        }).catch(err => console.error('❌ DB write (non-blocking):', err.message));
      }
    } catch (error) {
      console.error('❌ Driver location error:', error);
    }
  });

  socket.on('get-active-drivers', async () => {
    try {
      if (socket.userRole !== 'nurse') return;

      const allDrivers = await Driver.find().select('_id name phone status');

      const latestLocations = await DriverLocation.aggregate([
        { $sort: { timestamp: -1 } },
        { $group: { _id: '$driverId', doc: { $first: '$$ROOT' } } }
      ]);

      const locationMap = {};
      latestLocations.forEach(item => {
        locationMap[item._id.toString()] = item.doc;
      });

      const onlineDriverIds = Array.from(activeDrivers.keys());

      const result = allDrivers.map(driver => {
        const driverId = driver._id.toString();
        const isOnline = onlineDriverIds.includes(driverId);
        const loc = locationMap[driverId] || null;

        return {
          driverId: driver._id,
          driverName: driver.name,
          driverPhone: driver.phone,
          status: driver.status,
          online: isOnline,
          latitude: loc ? loc.latitude : null,
          longitude: loc ? loc.longitude : null,
          accuracy: loc ? loc.accuracy : null,
          speed: loc ? loc.speed : null,
          lastUpdate: loc ? loc.timestamp : null
        };
      });

      socket.emit('active-drivers-list', result);
    } catch (error) {
      console.error('❌ Get active drivers error:', error);
    }
  });

  socket.on('disconnect', () => {
    if (socket.driverId) {
      activeDrivers.delete(socket.driverId);
      io.emit('driver-disconnected', { driverId: socket.driverId });
    }
  });
});

app.set('io', io);

// ============ Start Server ============
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  server.listen(PORT,'0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔒 Security: ${process.env.NODE_ENV === 'production' ? 'Production' : 'Development'} mode`);
  });
}

module.exports = { app, server, io, sessionMiddleware };