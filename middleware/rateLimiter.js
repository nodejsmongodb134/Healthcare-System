// middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

console.log('🔥 rateLimiter.js MODULE LOADED (v7 with countdown)');

// ============================================================
//  Shared HTML response — warning + live countdown timer
// ============================================================
function rateLimitResponse({ title, message, retryAfterSeconds, backUrl, accentColor }) {
  const minutes = Math.floor(retryAfterSeconds / 60);
  const seconds = retryAfterSeconds % 60;
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css">
  <style>
    body {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .lock-card {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 40px 30px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      animation: slideUp 0.4s ease-out;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .lock-icon {
      width: 90px;
      height: 90px;
      border-radius: 50%;
      background: ${accentColor};
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      box-shadow: 0 8px 24px ${accentColor}55;
    }
    .lock-icon i {
      font-size: 2.6rem;
      color: white;
    }
    h1 {
      font-size: 1.4rem;
      font-weight: 700;
      color: #333;
      margin-bottom: 10px;
    }
    p.lead {
      color: #6c757d;
      font-size: 0.92rem;
      margin-bottom: 24px;
      line-height: 1.6;
    }
    .timer-box {
      background: #f8f9fa;
      border-radius: 14px;
      padding: 22px 16px;
      margin-bottom: 24px;
      border: 2px dashed ${accentColor}55;
    }
    .timer-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #6c757d;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .timer-value {
      font-size: 2.6rem;
      font-weight: 800;
      color: ${accentColor};
      font-variant-numeric: tabular-nums;
      letter-spacing: 2px;
      line-height: 1;
    }
    .progress {
      height: 8px;
      border-radius: 4px;
      background: #e9ecef;
      margin-top: 14px;
      overflow: hidden;
    }
    .progress-bar {
      background: ${accentColor};
      transition: width 1s linear;
    }
    .btn-back {
      background: ${accentColor};
      color: white;
      border: none;
      padding: 12px 28px;
      border-radius: 30px;
      font-weight: 600;
      font-size: 0.9rem;
      width: 100%;
      box-shadow: 0 4px 12px ${accentColor}55;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .btn-back:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 18px ${accentColor}66;
      color: white;
    }
    .btn-back:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .hint {
      font-size: 0.78rem;
      color: #adb5bd;
      margin-top: 18px;
      margin-bottom: 0;
    }
    @media (max-width: 480px) {
      .lock-card { padding: 30px 20px; }
      .timer-value { font-size: 2.1rem; }
      h1 { font-size: 1.15rem; }
    }
  </style>
</head>
<body>
  <div class="lock-card">
    <div class="lock-icon">
      <i class="bi bi-shield-lock-fill"></i>
    </div>

    <h1>${title}</h1>
    <p class="lead">${message}</p>

    <div class="timer-box">
      <div class="timer-label">Try again in</div>
      <div class="timer-value" id="timerDisplay">${formatted}</div>
      <div class="progress">
        <div class="progress-bar" id="progressBar" style="width: 100%"></div>
      </div>
    </div>

    <button class="btn btn-back" id="backBtn" disabled>
      <i class="bi bi-arrow-left"></i> Back to Login
    </button>

    <p class="hint">
      <i class="bi bi-info-circle"></i>
      This security measure protects your account from unauthorized access.
    </p>
  </div>

  <script>
    const totalSeconds = ${retryAfterSeconds};
    let remaining = totalSeconds;
    const display = document.getElementById('timerDisplay');
    const bar = document.getElementById('progressBar');
    const btn = document.getElementById('backBtn');

    function tick() {
      if (remaining <= 0) {
        display.textContent = '0:00';
        bar.style.width = '0%';
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-arrow-left"></i> Try Again Now';
        btn.onclick = () => window.location.href = '${backUrl}';
        return;
      }
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      display.textContent = m + ':' + s.toString().padStart(2, '0');
      bar.style.width = (remaining / totalSeconds * 100) + '%';
      remaining--;
      setTimeout(tick, 1000);
    }
    tick();
  </script>
</body>
</html>`;
}

// ============================================================
//  Rate limiters
// ============================================================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log('🚫 LOGIN LIMIT EXCEEDED:', req.ip);
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).send(rateLimitResponse({
      title: 'Too Many Login Attempts',
      message: 'You have made too many failed login attempts. Please wait before trying again.',
      retryAfterSeconds: retryAfter,
      backUrl: '/auth/login',
      accentColor: '#dc3545'
    }));
  }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log('🚫 REGISTER LIMIT EXCEEDED:', req.ip);
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).send(rateLimitResponse({
      title: 'Too Many Registration Attempts',
      message: 'Too many accounts have been created from this location. Please try again later.',
      retryAfterSeconds: retryAfter,
      backUrl: '/auth/register',
      accentColor: '#ffc107'
    }));
  }
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log('🚫 FORGOT LIMIT EXCEEDED:', req.ip);
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).send(rateLimitResponse({
      title: 'Too Many Password Reset Requests',
      message: 'You have requested too many password resets. Please wait before trying again.',
      retryAfterSeconds: retryAfter,
      backUrl: '/auth/forgot',
      accentColor: '#ffc107'
    }));
  }
});

const driverLoginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log('🚫🚫🚫 DRIVER LOGIN LIMIT EXCEEDED 🚫🚫🚫');
    console.log('   IP:', req.ip);
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    console.log('   Retry after:', retryAfter, 'seconds');
    res.status(429).send(rateLimitResponse({
      title: 'Too Many Login Attempts',
      message: 'For security, driver login attempts are limited. Please wait before trying again.',
      retryAfterSeconds: retryAfter,
      backUrl: '/driver/login',
      accentColor: '#667eea'
    }));
  }
});

module.exports = {
  loginLimiter,
  registerLimiter,
  forgotLimiter,
  driverLoginLimiter
};