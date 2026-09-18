const request = require('supertest');
const app = require('../server');
const { expect } = require('chai');
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { sendEmail } = require('../utils/email');

// ============ MOCK NODEMAILER ============
const mockTransporter = {
  sendMail: () => Promise.resolve({ messageId: 'mock-email-id' })
};
// email helper is a plain function - mock via jest.mock if needed

// ============ TEST CONFIG ============
// Increase timeout for all tests
const TEST_TIMEOUT = 15000;

describe('🔐 Authentication API', function() {
  this.timeout(TEST_TIMEOUT);

  // ============ CLEAN DATABASE BEFORE EACH TEST ============
  beforeEach(async function() {
    await User.deleteMany({});
  });

  // ============ HELPERS ============
  async function createUser(email, password, isVerified = true, profileComplete = true, role = 'patient') {
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);
    const user = new User({
      name: 'Test User',
      email,
      password: hashed,
      role,
      isVerified,
      profileComplete
    });
    await user.save();
    return user;
  }

  // ============ REGISTRATION TESTS ============
  describe('📝 Registration', function() {

    it('should register a new user successfully', async function() {
      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'Test@123',
          role: 'patient'
        });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/login');

      const user = await User.findOne({ email: 'test@example.com' });
      expect(user).to.exist;
      expect(user.name).to.equal('Test User');
      expect(user.role).to.equal('patient');
      expect(user.isVerified).to.be.false;
      expect(user.verificationToken).to.exist;
    });

    it('should not register with missing fields', async function() {
      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Test',
          email: 'test@example.com'
        });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/register');
      const user = await User.findOne({ email: 'test@example.com' });
      expect(user).to.not.exist;
    });

    it('should not register with password less than 6 characters', async function() {
      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: '12345',
          role: 'patient'
        });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/register');
      const user = await User.findOne({ email: 'test@example.com' });
      expect(user).to.not.exist;
    });

    it('should not register duplicate email', async function() {
      await request(app)
        .post('/auth/register')
        .send({
          name: 'First User',
          email: 'dup@test.com',
          password: 'Test@123',
          role: 'patient'
        });

      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Second User',
          email: 'dup@test.com',
          password: 'Test@123',
          role: 'patient'
        });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/register');

      const users = await User.find({ email: 'dup@test.com' });
      expect(users).to.have.lengthOf(1);
      expect(users[0].name).to.equal('First User');
    });

    it('should allow registration with nurse role', async function() {
      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Nurse User',
          email: 'nurse@test.com',
          password: 'Nurse@123',
          role: 'nurse'
        });
      expect(res.status).to.equal(302);
      const user = await User.findOne({ email: 'nurse@test.com' });
      expect(user).to.exist;
      expect(user.role).to.equal('nurse');
    });

    it('should default role to patient if not provided', async function() {
      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Default User',
          email: 'default@test.com',
          password: 'Default@123'
        });
      expect(res.status).to.equal(302);
      const user = await User.findOne({ email: 'default@test.com' });
      expect(user).to.exist;
      expect(user.role).to.equal('patient');
    });
  });

  // ============ VERIFICATION TESTS ============
  describe('📧 Email Verification', function() {

    let testUser;
    const email = 'verify@test.com';

    beforeEach(async function() {
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash('Verify@123', salt);
      testUser = new User({
        name: 'Verify User',
        email,
        password: hashed,
        role: 'patient',
        isVerified: false,
        verificationToken: 'valid-token',
        verificationTokenExpires: Date.now() + 3600000
      });
      await testUser.save();
    });

    it('should verify email with valid token', async function() {
      const token = testUser.verificationToken;
      const res = await request(app)
        .get(`/auth/verify/${token}`);
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.match(/\/patient\/profile/);
      const updated = await User.findOne({ email });
      expect(updated.isVerified).to.be.true;
      expect(updated.verificationToken).to.be.undefined;
      expect(updated.verificationTokenExpires).to.be.undefined;
    });

    it('should reject invalid verification token', async function() {
      const res = await request(app)
        .get('/auth/verify/invalid-token-12345');
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/register');
      const updated = await User.findOne({ email });
      expect(updated.isVerified).to.be.false;
    });

    it('should reject expired verification token', async function() {
      testUser.verificationTokenExpires = Date.now() - 1000;
      await testUser.save();
      const res = await request(app)
        .get(`/auth/verify/${testUser.verificationToken}`);
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/resend-verification');
      const updated = await User.findOne({ email });
      expect(updated.isVerified).to.be.false;
    });
  });

  // ============ RESEND VERIFICATION TESTS ============
  describe('🔄 Resend Verification', function() {

    const email = 'resend@test.com';

    beforeEach(async function() {
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash('Resend@123', salt);
      const user = new User({
        name: 'Resend User',
        email,
        password: hashed,
        role: 'patient',
        isVerified: false,
        verificationToken: 'old-token',
        verificationTokenExpires: Date.now() - 1000
      });
      await user.save();
    });

    it('should resend verification email', async function() {
      const res = await request(app)
        .post('/auth/resend-verification')
        .send({ email });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/login');

      const user = await User.findOne({ email });
      expect(user.verificationToken).to.exist;
      expect(user.verificationToken).to.not.equal('old-token');
      expect(user.verificationTokenExpires).to.be.a('date');
      expect(user.verificationTokenExpires.getTime()).to.be.greaterThan(Date.now());
    });

    it('should reject email not found', async function() {
      const res = await request(app)
        .post('/auth/resend-verification')
        .send({ email: 'nonexistent@test.com' });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/resend-verification');
    });

    it('should reject already verified user', async function() {
      await User.findOneAndUpdate({ email }, { isVerified: true });
      const res = await request(app)
        .post('/auth/resend-verification')
        .send({ email });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/login');
    });
  });

  // ============ LOGIN TESTS ============
  describe('🔑 Login', function() {

    const email = 'login@test.com';
    const password = 'Login@123';

    beforeEach(async function() {
      await createUser(email, password);
    });

    it('should login successfully with correct credentials', async function() {
      const res = await request(app)
        .post('/auth/login')
        .send({ email, password });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/patient-dashboard');
    });

    it('should reject login with wrong password', async function() {
      const res = await request(app)
        .post('/auth/login')
        .send({ email, password: 'WrongPassword' });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/login');
      // No session cookie? Actually session cookie is always set, so we can't check that.
      // Instead, we can verify that the user is not logged in by trying to access a protected page.
      const agent = request.agent(app);
      await agent.post('/auth/login').send({ email, password: 'WrongPassword' });
      const protectedRes = await agent.get('/auth/patient-dashboard');
      expect(protectedRes.status).to.equal(302); // Should redirect to login
    });

    it('should reject login with non-existent email', async function() {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'nonexistent@test.com', password });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/login');
    });

    it('should reject login with unverified email', async function() {
      await User.findOneAndUpdate({ email }, { isVerified: false });
      const res = await request(app)
        .post('/auth/login')
        .send({ email, password });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/login');
    });

    it('should redirect to profile completion if profile incomplete', async function() {
      await User.findOneAndUpdate({ email }, { profileComplete: false });
      const res = await request(app)
        .post('/auth/login')
        .send({ email, password });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/patient/profile');
    });
  });

  // ============ FORGOT PASSWORD TESTS ============
  describe('🔓 Forgot Password', function() {

    const email = 'forgot@test.com';

    beforeEach(async function() {
      await createUser(email, 'Forgot@123');
    });

    it('should send reset link for valid email', async function() {
      const res = await request(app)
        .post('/auth/forgot')
        .send({ email });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/login');

      const user = await User.findOne({ email });
      expect(user.resetPasswordToken).to.exist;
      expect(user.resetPasswordExpires).to.be.a('date');
      expect(user.resetPasswordExpires.getTime()).to.be.greaterThan(Date.now());
    });

    it('should reject non-existent email', async function() {
      const res = await request(app)
        .post('/auth/forgot')
        .send({ email: 'nonexistent@test.com' });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/forgot');
    });
  });

  // ============ RESET PASSWORD TESTS ============
  describe('🔄 Reset Password', function() {

    const email = 'reset@test.com';
    let resetToken;

    beforeEach(async function() {
      const user = await createUser(email, 'Reset@123');
      const crypto = require('crypto');
      resetToken = crypto.randomBytes(20).toString('hex');
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = Date.now() + 3600000;
      await user.save();
    });

    it('should reset password with valid token', async function() {
      const res = await request(app)
        .post(`/auth/reset/${resetToken}`)
        .send({
          password: 'NewPass@123',
          confirmPassword: 'NewPass@123'
        });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/login');

      const user = await User.findOne({ email });
      expect(user.resetPasswordToken).to.be.undefined;
      expect(user.resetPasswordExpires).to.be.undefined;
      const isMatch = await bcrypt.compare('NewPass@123', user.password);
      expect(isMatch).to.be.true;
    });

    it('should reject reset with mismatched passwords', async function() {
      const res = await request(app)
        .post(`/auth/reset/${resetToken}`)
        .send({
          password: 'NewPass@123',
          confirmPassword: 'Mismatch@123'
        });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal(`/auth/reset/${resetToken}`);
    });

    it('should reject password shorter than 6 characters', async function() {
      const res = await request(app)
        .post(`/auth/reset/${resetToken}`)
        .send({
          password: '12345',
          confirmPassword: '12345'
        });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal(`/auth/reset/${resetToken}`);
    });

    it('should reject invalid/expired token', async function() {
      const res = await request(app)
        .post('/auth/reset/invalid-token-12345')
        .send({
          password: 'NewPass@123',
          confirmPassword: 'NewPass@123'
        });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/forgot');
    });
  });

  // ============ LOGOUT TESTS ============
  describe('🚪 Logout', function() {

    const email = 'logout@test.com';
    const password = 'Logout@123';

    beforeEach(async function() {
      await createUser(email, password);
    });

    it('should destroy session on logout', async function() {
      const agent = request.agent(app);
      await agent
        .post('/auth/login')
        .send({ email, password });

      // Verify logged in
      let res = await agent.get('/auth/patient-dashboard');
      expect(res.status).to.equal(200);

      // Logout
      res = await agent.get('/auth/logout');
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/login');

      // Try to access protected page
      res = await agent.get('/auth/patient-dashboard');
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/login');
    });
  });

  // ============ SESSION TESTS ============
  describe('👤 Session', function() {

    const email = 'session@test.com';
    const password = 'Session@123';

    beforeEach(async function() {
      await createUser(email, password);
    });

    it('should return session info via test-session endpoint', async function() {
      const agent = request.agent(app);
      await agent
        .post('/auth/login')
        .send({ email, password });

      const res = await agent.get('/auth/test-session');
      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.user).to.exist;
      expect(res.body.user.email).to.equal(email);
    });

    it('should return no session for unauthenticated user', async function() {
      const res = await request(app)
        .get('/auth/test-session');
      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.false;
      expect(res.body.user).to.be.undefined;
    });
  });

  // ============ PROTECTED ROUTES TESTS ============
  describe('🔒 Protected Routes', function() {

    const email = 'protected@test.com';
    const password = 'Protected@123';

    beforeEach(async function() {
      await createUser(email, password);
    });

    it('should allow access to patient dashboard if authenticated', async function() {
      const agent = request.agent(app);
      await agent
        .post('/auth/login')
        .send({ email, password });

      const res = await agent.get('/auth/patient-dashboard');
      expect(res.status).to.equal(200);
    });

    it('should redirect to login if not authenticated', async function() {
      const res = await request(app)
        .get('/auth/patient-dashboard');
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/login');
    });

    it('should redirect nurse to profile if incomplete', async function() {
      // Create nurse with incomplete profile
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash('Nurse@123', salt);
      const nurse = new User({
        name: 'Nurse Incomplete',
        email: 'nurseincomplete@test.com',
        password: hashed,
        role: 'nurse',
        isVerified: true,
        profileComplete: false
      });
      await nurse.save();

      const agent = request.agent(app);
      await agent
        .post('/auth/login')
        .send({ email: 'nurseincomplete@test.com', password: 'Nurse@123' });

      const res = await agent.get('/auth/nurse-dashboard');
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/nurse/profile');
    });

    it('should redirect nurse to login if not authenticated', async function() {
      const res = await request(app)
        .get('/auth/nurse-dashboard');
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/auth/login');
    });
  });
});