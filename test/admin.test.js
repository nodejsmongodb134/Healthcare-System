const request = require('supertest');
const app = require('../server');
const { expect } = require('chai');
const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Nurse = require('../models/Nurse');
const Driver = require('../models/Driver');
const Order = require('../models/Order');
const Message = require('../models/Message');
const bcrypt = require('bcryptjs');

describe('🔐 Admin API', function() {
  this.timeout(15000);

  let adminAgent;
  let adminUser;

  before(async function() {
    // Create admin user
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash('Admin@123', salt);
    adminUser = new User({
      name: 'Admin Test',
      email: 'admin@test.com',
      password: hashed,
      role: 'admin',
      isVerified: true,
      profileComplete: true
    });
    await adminUser.save();

    adminAgent = request.agent(app);
    await adminAgent
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'Admin@123' });
  });

  after(async function() {
    await User.deleteMany({});
    await Patient.deleteMany({});
    await Nurse.deleteMany({});
    await Driver.deleteMany({});
    await Order.deleteMany({});
    await Message.deleteMany({});
  });

  describe('Dashboard', function() {
    it('should load dashboard', async function() {
      const res = await adminAgent.get('/admin/dashboard');
      expect(res.status).to.equal(200);
    });
  });

  describe('Nurse management', function() {
    let nurseId;

    it('should create a nurse', async function() {
      const res = await adminAgent
        .post('/admin/nurses')
        .send({
          name: 'New Nurse',
          email: 'newnurse@test.com',
          password: 'Nurse@123',
          idNumber: 'NUR123',
          phone: '+1234567890',
          dateOfBirth: '1980-01-01',
          qualification: 'RN',
          specialization: 'Pediatrics',
          yearsOfExperience: 5,
          licenseNumber: 'LIC123'
        });
      expect(res.status).to.equal(302);
      const nurse = await User.findOne({ email: 'newnurse@test.com' });
      expect(nurse).to.exist;
      expect(nurse.role).to.equal('nurse');
      expect(nurse.isVerified).to.be.true;
      nurseId = nurse._id;
    });

    it('should list nurses', async function() {
      const res = await adminAgent.get('/admin/nurses');
      expect(res.status).to.equal(200);
    });

    it('should revoke nurse access', async function() {
      const res = await adminAgent
        .post(`/admin/nurses/${nurseId}/revoke`)
        .send({});
      expect(res.status).to.equal(302);
      const nurse = await User.findById(nurseId);
      expect(nurse.role).to.equal('patient');
    });
  });

  describe('Driver management', function() {
    let driverId;

    it('should create a driver', async function() {
      const res = await adminAgent
        .post('/admin/drivers')
        .send({
          name: 'New Driver',
          email: 'newdriver@test.com',
          idNumber: 'DRV123',
          phone: '+1234567890',
          dateOfBirth: '1985-01-01',
          licenseNumber: 'LIC456',
          vehicleType: 'car',
          vehiclePlate: 'ABC123'
        });
      expect(res.status).to.equal(302);
      const driver = await Driver.findOne({ email: 'newdriver@test.com' });
      expect(driver).to.exist;
      expect(driver.status).to.equal('active');
      driverId = driver._id;
    });

    it('should toggle driver status', async function() {
      const res = await adminAgent
        .post(`/admin/drivers/status/${driverId}`)
        .send({ status: 'inactive' });
      expect(res.status).to.equal(302);
      const driver = await Driver.findById(driverId);
      expect(driver.status).to.equal('inactive');
    });

    it('should delete driver', async function() {
      const res = await adminAgent
        .post(`/admin/drivers/delete/${driverId}`)
        .send({});
      expect(res.status).to.equal(302);
      const driver = await Driver.findById(driverId);
      expect(driver).to.be.null;
    });
  });

  describe('Patient management', function() {
    let patientId;

    it('should list patients', async function() {
      const res = await adminAgent.get('/admin/patients/manage');
      expect(res.status).to.equal(200);
    });

    it('should toggle patient status', async function() {
      // First create a patient
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash('Patient@123', salt);
      const patient = new User({
        name: 'Patient To Toggle',
        email: 'togglere@test.com',
        password: hashed,
        role: 'patient',
        isVerified: true,
        profileComplete: true,
        isActive: true
      });
      await patient.save();
      patientId = patient._id;

      const res = await adminAgent
        .post(`/admin/patients/toggle-status/${patientId}`)
        .send({});
      expect(res.status).to.equal(302);
      const updated = await User.findById(patientId);
      expect(updated.isActive).to.be.false;
    });
  });

  describe('Order management', function() {
    let orderId;

    before(async function() {
      // Create a test order
      const order = new Order({
        patientId: new mongoose.Types.ObjectId(),
        patientName: 'Test Patient',
        patientEmail: 'test@test.com',
        patientPhone: '+1234567890',
        prescriptionName: 'Test Drug',
        location: '123 Test St',
        status: 'pending'
      });
      await order.save();
      orderId = order._id;
    });

    it('should list orders', async function() {
      const res = await adminAgent.get('/admin/orders/manage');
      expect(res.status).to.equal(200);
    });

    it('should update order status', async function() {
      const res = await adminAgent
        .post(`/admin/orders/status/${orderId}`)
        .send({ status: 'in-transit' });
      expect(res.status).to.equal(302);
      const order = await Order.findById(orderId);
      expect(order.status).to.equal('in-transit');
    });

    it('should assign driver', async function() {
      // Create a driver
      const driver = new Driver({
        name: 'Order Driver',
        email: 'orderdriver@test.com',
        password: 'dummy',
        phone: '+1234567890',
        idNumber: 'DRV456',
        dateOfBirth: new Date('1980-01-01'),
        status: 'active'
      });
      await driver.save();

      const res = await adminAgent
        .post(`/admin/orders/assign-driver/${orderId}`)
        .send({ driverId: driver._id });
      expect(res.status).to.equal(302);
      const order = await Order.findById(orderId);
      expect(order.driverId.toString()).to.equal(driver._id.toString());
    });
  });

  describe('Message management', function() {
    let messageId;

    before(async function() {
      const msg = new Message({
        patientId: new mongoose.Types.ObjectId(),
        patientName: 'Msg Patient',
        patientEmail: 'msg@test.com',
        patientPhone: '+1234567890',
        subject: 'Test Subject',
        message: 'Test content',
        status: 'unread'
      });
      await msg.save();
      messageId = msg._id;
    });

    it('should list messages', async function() {
      const res = await adminAgent.get('/admin/messages/manage');
      expect(res.status).to.equal(200);
    });

    it('should reply to message', async function() {
      const res = await adminAgent
        .post(`/admin/messages/reply/${messageId}`)
        .send({ reply: 'Test reply' });
      expect(res.status).to.equal(302);
      const msg = await Message.findById(messageId);
      expect(msg.status).to.equal('replied');
      expect(msg.nurseReply).to.equal('Test reply');
    });

    it('should mark message as read', async function() {
      const res = await adminAgent
        .post(`/admin/messages/mark-read/${messageId}`)
        .send({});
      expect(res.status).to.equal(302);
      const msg = await Message.findById(messageId);
      expect(msg.status).to.equal('read');
    });
  });

  describe('Export and Analytics', function() {
    it('should export patients CSV', async function() {
      const res = await adminAgent.get('/admin/export/patients');
      expect(res.status).to.equal(200);
      expect(res.headers['content-type']).to.include('text/csv');
    });

    it('should load analytics page', async function() {
      const res = await adminAgent.get('/admin/analytics');
      expect(res.status).to.equal(200);
    });
  });
});