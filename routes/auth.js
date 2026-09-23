const express = require('express');
const { sendEmail } = require('../utils/email');
const router = express.Router();
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const bcrypt = require('bcryptjs');
const { blindIndex } = require('../utils/blindIndex');
const crypto = require('crypto');

// ============================================================
// HELPERS
// ============================================================

// Build a URL from the configured base, safely stripping any trailing slash
function buildUrl(p) {
  const base = (process.env.BASE_URL || 'https://palmvalleymedicalcenter.africa.com').replace(/\/+$/, '');
  const cleanPath = p.startsWith('/') ? p : '/' + p;
  return base + cleanPath;
}

// Destroy a stale session and redirect to login (breaks redirect loops)
function clearStaleSession(req, res, reason) {
  console.warn(`Stale session (${reason}) for user id ${req.session.user?.id || '?'} - destroying`);
  return req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.clearCookie('connect.sid', { path: '/' });
    return res.redirect('/auth/login');
  });
}

// Check if the session's user still exists and is verified.
// Returns { ok: true, user } or { ok: false } (session already destroyed + response sent).
async function loadSessionUser(req, res, expectedRole) {
  if (!req.session.user) return { ok: false };
  if (expectedRole && req.session.user.role !== expectedRole) return { ok: false };

  const user = await User.findById(req.session.user.id);
  if (!user || !user.isVerified) {
    clearStaleSession(req, res, expectedRole ? `${expectedRole} dashboard` : 'homepage');
    return { ok: false };
  }
  return { ok: true, user };
}

// ============================================================
// REGISTER
// ============================================================
router.get('/register', async (req, res) => {
  if (req.session.user) {
    const { ok } = await loadSessionUser(req, res);
    if (!ok) return;              // response already sent by helper
    return res.redirect('/');
  }
  res.render('register', { title: 'Register' });
});

router.post('/register', async (req, res) => {
  try {
    console.log('Registration attempt:', req.body.email);
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      req.flash('error_msg', 'All fields are required');
      return res.redirect('/auth/register');
    }

    if (password.length < 6) {
      req.flash('error_msg', 'Password must be at least 6 characters');
      return res.redirect('/auth/register');
    }

    const hasLowercase = /[a-z]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*]/.test(password);

    if (!hasLowercase || !hasUppercase || !hasNumber || !hasSpecial) {
      req.flash('error_msg', 'Password must contain at least one lowercase, uppercase, number, and special character (!@#$%^&*)');
      return res.redirect('/auth/register');
    }

    const existingUser = await User.findOne({ emailHash: blindIndex(email) });
    if (existingUser) {
      if (existingUser.isVerified) {
        req.flash('error_msg', 'Email already registered');
      } else {
        req.flash('error_msg', 'Email already registered but not verified. Please check your email for verification link.');
      }
      return res.redirect('/auth/register');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = Date.now() + 24 * 3600000;

    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: 'patient',  // hardcoded: nurses created by admin only
      verificationToken,
      verificationTokenExpires,
      isVerified: false
    });

    await user.save();
    console.log('User registered:', user.email);

    const verificationUrl = buildUrl(`/auth/verify/${verificationToken}`);

    const mailOptions = {
      to: user.email,
      from: process.env.BREVO_SENDER_EMAIL,
      subject: 'Verify Your Email Address',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .button:hover { background: #5a67d8; }
            .footer { margin-top: 20px; font-size: 12px; color: #999; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Welcome to Appointment Booking!</h2>
            </div>
            <div class="content">
              <h3>Hello ${user.name},</h3>
              <p>Thank you for registering with us! Please verify your email address to complete your registration.</p>
              <p>Click the button below to verify your email:</p>
              <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </div>
              <p>Or copy and paste this link in your browser:</p>
              <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${verificationUrl}</p>
              <p><strong>This link will expire in 24 hours.</strong></p>
              <p>If you didn't create an account, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 Appointment Booking. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await sendEmail(mailOptions);
    console.log('Verification email sent to:', user.email);

    req.flash('success_msg', 'Registration successful! Please check your email to verify your account.');
    res.redirect('/auth/login');
  } catch (error) {
    console.error('Registration error:', error);
    req.flash('error_msg', 'Registration failed. Please try again.');
    res.redirect('/auth/register');
  }
});

// ============================================================
// EMAIL VERIFICATION
// ============================================================
router.get('/verify/:token', async (req, res) => {
  try {
    const token = req.params.token;
    console.log('Verifying token:', token);

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      const expiredUser = await User.findOne({ verificationToken: token });
      if (expiredUser) {
        console.log('Token expired for:', expiredUser.email);
        req.flash('error_msg', 'Verification link has expired. Please request a new one.');
        return res.redirect('/auth/resend-verification');
      }
      req.flash('error_msg', 'Invalid verification link.');
      return res.redirect('/auth/register');
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    console.log('User verified:', user.email);

    // FIX: regenerate session to prevent session fixation
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: true,
      profileComplete: false
    };

    return req.session.regenerate((err) => {
      if (err) {
        console.error('Session regenerate error on verify:', err);
        // Continue anyway — user is verified in DB; they can log in fresh
        req.flash('success_msg', 'Email verified successfully! Please login.');
        return res.redirect('/auth/login');
      }

      req.session.user = userData;
      req.session.save((saveErr) => {
        if (saveErr) console.error('Session save error:', saveErr);
        req.flash('success_msg', 'Email verified successfully! Please complete your profile to continue.');
        if (user.role === 'nurse') return res.redirect('/nurse/profile');
        return res.redirect('/patient/profile');
      });
    });
  } catch (error) {
    console.error('Verification error:', error);
    req.flash('error_msg', 'Verification failed. Please try again.');
    res.redirect('/auth/register');
  }
});

// ============================================================
// RESEND VERIFICATION EMAIL
// ============================================================
router.get('/resend-verification', (req, res) => {
  res.render('resend-verification', { title: 'Resend Verification' });
});

router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    console.log('Resend verification for:', email);

    const user = await User.findOne({ emailHash: blindIndex(email) });

    if (!user) {
      req.flash('error_msg', 'No account found with that email');
      return res.redirect('/auth/resend-verification');
    }

    if (user.isVerified) {
      req.flash('success_msg', 'Email is already verified. Please login.');
      return res.redirect('/auth/login');
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = verificationToken;
    user.verificationTokenExpires = Date.now() + 24 * 3600000;
    await user.save();

    const verificationUrl = buildUrl(`/auth/verify/${verificationToken}`);

    const mailOptions = {
      to: user.email,
      from: process.env.BREVO_SENDER_EMAIL,
      subject: 'Verify Your Email Address',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .button:hover { background: #5a67d8; }
            .footer { margin-top: 20px; font-size: 12px; color: #999; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Verify Your Email Address</h2>
            </div>
            <div class="content">
              <h3>Hello ${user.name},</h3>
              <p>We received a request to resend the verification email.</p>
              <p>Click the button below to verify your email:</p>
              <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </div>
              <p>Or copy and paste this link in your browser:</p>
              <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${verificationUrl}</p>
              <p><strong>This link will expire in 24 hours.</strong></p>
              <p>If you didn't request this, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 Appointment Booking. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await sendEmail(mailOptions);
    console.log('Verification email resent to:', user.email);

    req.flash('success_msg', 'Verification email sent! Please check your inbox.');
    res.redirect('/auth/resend-verification');
  } catch (error) {
    console.error('Resend verification error:', error);
    req.flash('error_msg', 'Failed to resend verification email. Please try again.');
    res.redirect('/auth/resend-verification');
  }
});

// ============================================================
// LOGIN
// ============================================================
router.get('/login', async (req, res) => {
  if (req.session.user) {
    const { ok } = await loadSessionUser(req, res);
    if (!ok) return;              // response already sent
    return res.redirect('/');
  }
  res.render('login', { title: 'Login' });
});

router.post('/login', async (req, res) => {
  try {
    console.log('Login attempt:', req.body.email);
    const { email, password } = req.body;

    if (!email || !password) {
      req.flash('error_msg', 'Email and password are required');
      return res.redirect('/auth/login');
    }

    const user = await User.findOne({ emailHash: blindIndex(email) });
    if (!user) {
      console.log('User not found:', email);
      req.flash('error_msg', 'Invalid email or password');
      return res.redirect('/auth/login');
    }

    if (user.isActive === false) {
      console.log('Failed login: account disabled:', email);
      req.flash('error_msg', 'Your account has been disabled. Please contact support.');
      return res.redirect('/auth/login');
    }

    if (!user.isVerified) {
      console.log('Email not verified:', email);
      req.flash('error_msg', 'Please verify your email first.');
      return res.redirect('/auth/login');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      req.flash('error_msg', 'Invalid email or password');
      return res.redirect('/auth/login');
    }

    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      profileComplete: user.profileComplete || false,
      isActive: user.isActive
    };

    return req.session.regenerate((err) => {
      if (err) {
        console.error('Session regenerate error:', err);
        req.flash('error_msg', 'Login failed. Please try again.');
        return res.redirect('/auth/login');
      }

      req.session.user = userData;
      console.log('User logged in (new session):', user.email);

      req.session.save((saveErr) => {
        if (saveErr) console.error('Session save error:', saveErr);

        req.flash('success_msg', `Welcome back, ${user.name}!`);

        if (user.role === 'admin') {
          console.log('Admin logged in, redirecting to /admin/dashboard');
          return res.redirect('/admin/dashboard');
        }

        if (!user.profileComplete) {
          console.log('Profile not complete, redirecting to profile');
          if (user.role === 'nurse') return res.redirect('/nurse/profile');
          return res.redirect('/patient/profile');
        }

        const dashboard = user.role === 'nurse' ? '/auth/nurse-dashboard' : '/auth/patient-dashboard';
        return res.redirect(dashboard);
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    req.flash('error_msg', 'Login failed. Please try again.');
    res.redirect('/auth/login');
  }
});

// ============================================================
// PATIENT DASHBOARD
// ============================================================
router.get('/patient-dashboard', async (req, res) => {
  try {
    if (!req.session.user) {
      req.flash('error_msg', 'Please login first');
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'patient') {
      req.flash('error_msg', 'Please login as patient');
      return res.redirect('/auth/login');
    }

    const { ok, user } = await loadSessionUser(req, res, 'patient');
    if (!ok) return;              // response already sent by helper

    // Refresh session cache
    req.session.user.profileComplete = user.profileComplete;
    req.session.user.name = user.name;
    req.session.user.email = user.email;
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
    });

    if (!user.profileComplete) {
      req.flash('warning_msg', 'Please complete your profile first');
      return res.redirect('/patient/profile');
    }

    res.render('dashboard/patient-dashboard', {
      title: 'Patient Dashboard',
      user: req.session.user
    });
  } catch (error) {
    console.error('Patient dashboard error:', error);
    req.flash('error_msg', 'Failed to load dashboard');
    res.redirect('/auth/login');
  }
});

// ============================================================
// NURSE DASHBOARD
// ============================================================
router.get('/nurse-dashboard', async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'nurse') {
      req.flash('error_msg', 'Please login as nurse');
      return res.redirect('/auth/login');
    }

    const { ok, user } = await loadSessionUser(req, res, 'nurse');
    if (!ok) return;              // response already sent by helper

    req.session.user.profileComplete = user.profileComplete;
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
    });

    if (!user.profileComplete) {
      req.flash('warning_msg', 'Please complete your profile first');
      return res.redirect('/nurse/profile');
    }

    // Clinic-wide stats (nurses act as admins)
    const [total, pending, confirmed, cancelled] = await Promise.all([
      Appointment.countDocuments({}),
      Appointment.countDocuments({ status: 'pending' }),
      Appointment.countDocuments({ status: 'confirmed' }),
      Appointment.countDocuments({ status: 'cancelled' })
    ]);

    res.render('dashboard/nurse-dashboard', {
      title: 'Nurse Dashboard',
      user: req.session.user,
      stats: { total, pending, confirmed, cancelled }
    });
  } catch (error) {
    console.error('Nurse dashboard error:', error);
    req.flash('error_msg', 'Failed to load dashboard');
    res.redirect('/auth/login');
  }
});

// ============================================================
// LOGOUT
// ============================================================
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.clearCookie('connect.sid', { path: '/' });
    res.redirect('/auth/login');
  });
});

// ============================================================
// FORGOT PASSWORD
// ============================================================
router.get('/forgot', async (req, res) => {
  if (req.session.user) {
    const { ok } = await loadSessionUser(req, res);
    if (!ok) return;              // response already sent
    return res.redirect('/');
  }
  res.render('forgot', { title: 'Forgot Password' });
});

router.post('/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    console.log('Forgot password request for:', email);

    const user = await User.findOne({ emailHash: blindIndex(email) });

    if (!user) {
      req.flash('error_msg', 'No account found with that email');
      return res.redirect('/auth/forgot');
    }

    const token = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

    const resetUrl = buildUrl(`/auth/reset/${token}`);

    const mailOptions = {
      to: user.email,
      from: process.env.BREVO_SENDER_EMAIL,
      subject: 'Password Reset Request',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .button:hover { background: #5a67d8; }
            .footer { margin-top: 20px; font-size: 12px; color: #999; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Password Reset Request</h2>
            </div>
            <div class="content">
              <h3>Hello ${user.name},</h3>
              <p>You requested a password reset. Click the button below to reset your password:</p>
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>
              <p>Or copy and paste this link in your browser:</p>
              <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${resetUrl}</p>
              <p><strong>This link will expire in 1 hour.</strong></p>
              <p>If you didn't request this, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 Appointment Booking. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await sendEmail(mailOptions);
    console.log('Reset email sent to:', user.email);

    req.flash('success_msg', 'Password reset link sent to your email');
    res.redirect('/auth/forgot');
  } catch (error) {
    console.error('Forgot password error:', error);
    req.flash('error_msg', 'Failed to send reset email. Please try again.');
    res.redirect('/auth/forgot');
  }
});

// ============================================================
// RESET PASSWORD
// ============================================================
router.get('/reset/:token', async (req, res) => {
  try {
    const token = req.params.token;
    console.log('Reset token received:', token);

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      console.log('Invalid or expired token');
      req.flash('error_msg', 'Password reset token is invalid or has expired');
      return res.redirect('/auth/forgot');
    }

    res.render('reset', { title: 'Reset Password', token });
  } catch (error) {
    console.error('Reset token error:', error);
    req.flash('error_msg', 'Invalid reset token');
    res.redirect('/auth/forgot');
  }
});

router.post('/reset/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const { password, confirmPassword } = req.body;

    console.log('Reset password attempt for token:', token);

    if (password !== confirmPassword) {
      req.flash('error_msg', 'Passwords do not match');
      return res.redirect(`/auth/reset/${token}`);
    }

    if (password.length < 6) {
      req.flash('error_msg', 'Password must be at least 6 characters');
      return res.redirect(`/auth/reset/${token}`);
    }

    const hasLowercase = /[a-z]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*]/.test(password);

    if (!hasLowercase || !hasUppercase || !hasNumber || !hasSpecial) {
      req.flash('error_msg', 'Password must contain at least one lowercase, uppercase, number, and special character (!@#$%^&*)');
      return res.redirect(`/auth/reset/${token}`);
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      console.log('Invalid or expired token for reset');
      req.flash('error_msg', 'Password reset token is invalid or has expired');
      return res.redirect('/auth/forgot');
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    console.log('Password reset successful for:', user.email);
    req.flash('success_msg', 'Password reset successful! Please login with your new password.');
    res.redirect('/auth/login');
  } catch (error) {
    console.error('Reset password error:', error);
    req.flash('error_msg', 'Failed to reset password. Please try again.');
    res.redirect('/auth/forgot');
  }
});

// ============================================================
// TEST SESSION (dev only)
// ============================================================
router.get('/test-session', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).end();
  }
  if (req.session.user) {
    res.json({ success: true, user: req.session.user });
  } else {
    res.json({ success: false, message: 'No session found' });
  }
});

module.exports = router;