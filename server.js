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
const compression = require('compression');

const {
  requireAuth, requireRole, requireDriver, requireAdmin,
  requireNurse, requirePatient
} = require('./middleware/auth');

const {
  loginLimiter, registerLimiter, forgotLimiter, driverLoginLimiter
} = require('./middleware/rateLimiter');

const {
  csrfGenerate, csrfProtection, invalidCsrfTokenError
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

// ============ REQUEST TIMEOUT (protects server from slow clients) ============
app.use((req, res, next) => {
  const TIMEOUT_MS = 45000;   // 45s — generous for uploads on slow links
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      console.warn(`⏱ Request timeout: ${req.method} ${req.originalUrl}`);
      res.status(503).json({ error: 'Request timeout' });
    }
  }, TIMEOUT_MS);

  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  next();
});

// ============ MongoDB ============
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ============ View Engine ============
app.set('view engine', 'ejs');

// ============ Response Compression (smaller payloads on slow links) ============
app.use(compression({
  level: 6,
  threshold: 1024,           // only compress > 1 KB
  filter: (req, res) => {
    const ct = res.getHeader('Content-Type');
    if (ct && /image|video|font/i.test(ct)) return false;
    return compression.filter(req, res);
  }
}));

// ============ Body Parser ============
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// ============ Cookie Parser ============
app.use(cookieParser());

// ============ Static Files ============
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',              // browsers cache static files for 7 days
  etag: true
}));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), {
  maxAge: '1d',
  etag: true
}));

// ============ TILE SERVER ============

const tilesPath = path.join(__dirname, 'public', 'tiles');
const hasTiles = fs.existsSync(tilesPath);

app.get('/tiles/:z/:x/:y.png', (req, res) => {
  const { z, x, y } = req.params;
  const tilePath = path.join(tilesPath, z, x, `${y}.png`);

  // Set cache header for BOTH branches
  res.set('Cache-Control', 'public, max-age=604800');   // ✅ move up here

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
// ============ MIDDLEWARE STACK ==============================
// ============================================================

// ---------- SESSION (with poor-network resilience) ----------
const sessionMiddleware = session({
  name: 'connect.sid',
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  rolling: true,                              // refresh cookie on every request
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 3600,                                // 1 hour
    autoRemove: 'native',
    touchAfter: 300                           // only write to DB every 5 min
  }),
  proxy: true,
  cookie: {
    maxAge: 3600000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  }
});

app.use(sessionMiddleware);
app.use(flash());
app.use(csrfGenerate);
app.use(csrfProtection);

// ---------- CSRF auto-inject + global scripts ----------
app.use((req, res, next) => {
  const originalSend = res.send.bind(res);

  res.send = function (body) {
    if (typeof body === 'string') {
      // Inject CSRF meta tag in <head>
      if (body.indexOf('</head>') !== -1 && res.locals.csrfToken) {
        if (body.indexOf('name="csrf-token"') === -1) {
          const metaTag = `<meta name="csrf-token" content="${res.locals.csrfToken}">`;
          body = body.replace('</head>', `    ${metaTag}\n</head>`);
        }
      }

      // Inject all global scripts before </body>
      if (body.indexOf('</body>') !== -1) {
        const scripts = [
          '/js/net.js',             // 1. patches fetch first
          '/js/network-status.js',  // 2. banner + spinner
          '/js/upload.js',          // 3. upload warnings
          '/js/csrf-inject.js'      // 4. CSRF tokens (uses patched fetch)
        ];
        for (const src of scripts) {
          if (body.indexOf(src) === -1) {
            body = body.replace('</body>', `    <script src="${src}"></script>\n</body>`);
          }
        }
      }
    }
    return originalSend(body);
  };
  next();
});

// ---------- Request logging (non-GET only) ----------
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

// ---------- Locals & Flash ----------
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg') || null;
  res.locals.error_msg   = req.flash('error_msg')   || null;
  res.locals.warning_msg = req.flash('warning_msg') || null;
  res.locals.info_msg    = req.flash('info_msg')    || null;
  res.locals.user   = req.session.user   || null;
  res.locals.driver = req.session.driver || null;
  next();
});

// ============================================================
// ============ ROUTE MOUNTING ================================
// ============================================================

app.post('/auth/login',    loginLimiter);
app.post('/auth/register', registerLimiter);
app.post('/auth/forgot',   forgotLimiter);
app.post('/driver/login',  driverLoginLimiter);

app.use('/auth', authRoutes);

app.use('/patient', requirePatient, profileRoutes);
app.use('/patient', requirePatient, appointmentRoutes);
app.use('/patient', requirePatient, viewAppointmentRoutes);
app.use('/patient', requirePatient, messageRoutes);
app.use('/patient', requirePatient, orderRoutes);

app.use('/nurse', requireNurse, nurseAppointmentRoutes);
app.use('/nurse', requireNurse, nurseMessageRoutes);
app.use('/nurse', requireNurse, createDriverRoutes);
app.use('/nurse', requireNurse, nursePatientRoutes);
app.use('/nurse', requireNurse, nurseOrderRoutes);
app.use('/nurse', requireNurse, nurseProfileRoutes);
app.use('/nurse', requireNurse, nurseSmsRoutes);
app.use('/nurse', requireNurse, nurseTrackingRoutes);
app.use('/nurse', requireNurse, nurseAnnouncementRoutes);

app.use('/driver', driverRoutes);

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

// ============================================================
// ============ HTTP SERVER + SOCKET.IO ======================
// ============================================================
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: [
      "https://healthcare-system-4ezz.onrender.com",
      "http://localhost:3000"
    ],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  // ⭐ TUNED FOR POOR NETWORKS
  pingTimeout: 120000,          // 2 min — tolerate slow RTT
  pingInterval: 30000,          // ping every 30s
  upgradeTimeout: 60000,        // allow 60s to upgrade
  connectTimeout: 45000,        // 45s to establish connection
  allowUpgrades: true,
  maxHttpBufferSize: 1e6,
  perMessageDeflate: false      // saves CPU + bandwidth
});

// ============ Session sharing for Socket.IO ============
io.use((socket, next) => {
  const cookieHeader = socket.handshake.headers.cookie;
  if (!cookieHeader) {
    console.warn(`⚠️ [Socket.IO] No cookie in handshake from ${socket.id}`);
    return next(new Error('Authentication required'));
  }

  const cookies = cookieHeader.split('; ');
  const sidCookie = cookies.find(c => c.startsWith('connect.sid='));
  if (!sidCookie) {
    console.warn(`⚠️ [Socket.IO] No connect.sid cookie from ${socket.id}`);
    return next(new Error('Authentication required'));
  }

  sessionMiddleware(socket.handshake, {}, (err) => {
    if (err) {
      console.error('❌ [Socket.IO] Session error:', err.message);
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
      console.warn(`⚠️ [Socket.IO] No user/driver in session for ${socket.id}`);
      next(new Error('Authentication required'));
    }
  });
});

// ============ Active driver tracking ============
const activeDrivers = new Map();

io.on('connection', (socket) => {
  console.log(
    `🔌 [Socket.IO] Connected: ${socket.id}`,
    socket.driverId ? `(Driver: ${socket.driverId})` :
    socket.userId   ? `(User: ${socket.userId}, Role: ${socket.userRole})` :
                      '(unknown)'
  );

  // ---- Driver: receive GPS location ----
  socket.on('driver-location-update', async (data) => {
    try {
      const { latitude, longitude, accuracy, speed } = data;
      const driverId = socket.driverId;

      if (!driverId) {
        console.warn(`⚠️ [Socket.IO] Location from ${socket.id} but no driverId`);
        return;
      }

      if (latitude == null || longitude == null) {
        console.warn(`⚠️ [Socket.IO] Location with null coords from ${driverId}`);
        return;
      }

      // Round to 5 decimals (~1m precision) — saves bandwidth on slow links
      const roundedLat = Math.round(latitude * 100000) / 100000;
      const roundedLng = Math.round(longitude * 100000) / 100000;

      console.log(`📍 [Driver] ${driverId} → ${roundedLat}, ${roundedLng} (±${Math.round(accuracy || 0)}m)`);

      // In-memory (fast)
      activeDrivers.set(driverId, {
        socketId: socket.id,
        latitude: roundedLat,
        longitude: roundedLng,
        accuracy, speed,
        lastUpdate: Date.now()
      });

      // Broadcast to nurses (compact payload)
      io.emit('driver-location-update', {
        driverId,
        latitude: roundedLat,
        longitude: roundedLng,
        timestamp: Date.now()
      });

      // Persist to DB (survives socket drop, TTL 5 min)
      const driver = await Driver.findById(driverId).select('name');
      if (driver) {
        DriverLocation.create({
          driverId,
          driverName: driver.name,
          latitude: roundedLat,
          longitude: roundedLng,
          accuracy, speed
        }).catch(err => console.error('❌ DB write:', err.message));
      }
    } catch (error) {
      console.error('❌ Driver location error:', error);
    }
  });

  // ---- Nurse: request all drivers ----
  socket.on('get-active-drivers', async () => {
    try {
      if (socket.userRole !== 'nurse') {
        console.warn(`⚠️ [Socket.IO] get-active-drivers from non-nurse (role: ${socket.userRole || 'none'})`);
        return;
      }

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
      const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
      const now = Date.now();

      const result = allDrivers.map(driver => {
        const driverId = driver._id.toString();
        const loc = locationMap[driverId] || null;

        const socketOnline = onlineDriverIds.includes(driverId);
        const dbRecent = loc && loc.timestamp &&
                         (now - new Date(loc.timestamp).getTime() < ONLINE_THRESHOLD_MS);
        const isOnline = socketOnline || dbRecent;

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

      const onlineCount = result.filter(d => d.online).length;
      console.log(`🗺️ [Nurse] Sending ${result.length} drivers (${onlineCount} online — socket:${onlineDriverIds.length}, db-recent:${result.filter(d => d.online && !onlineDriverIds.includes(d.driverId.toString())).length})`);

      socket.emit('active-drivers-list', result);
    } catch (error) {
      console.error('❌ Get active drivers error:', error);
    }
  });

  // ---- Disconnect ----
  socket.on('disconnect', (reason) => {
    console.log(
      `🔌 [Socket.IO] Disconnected: ${socket.id}`,
      socket.driverId ? `(Driver: ${socket.driverId})` : '',
      `— ${reason}`
    );

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
  server.listen(PORT,'0.0.0.0',() => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`🔒 Security: ${process.env.NODE_ENV === 'production' ? 'Production' : 'Development'} mode`);
  });
}

module.exports = { app, server, io, sessionMiddleware };