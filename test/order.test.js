const request = require('supertest');
const app = require('../server');
const { expect } = require('chai');
const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Order = require('../models/Order');
const Driver = require('../models/Driver');
const bcrypt = require('bcryptjs');

describe('📦 Orders API', function() {
  this.timeout(15000);

  let patientUser;
  let driverUser;
  let nurseUser;
  let orderId;

  before(async function() {
    // Patient
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash('Patient@123', salt);
    patientUser = new User({
      name: 'Order Patient',
      email: 'orderpatient@test.com',
      password: hashed,
      role: 'patient',
      isVerified: true,
      profileComplete: true
    });
    await patientUser.save();

    const patientProfile = new Patient({
      userId: patientUser._id,
      name: 'Order Patient',
      phone: '+1234567890',
      idNumber: '12345',
      dateOfBirth: new Date('1990-01-01'),
      email: 'orderpatient@test.com'
    });
    await patientProfile.save();

    // Driver
    const salt2 = await bcrypt.genSalt(10);
    const hashed2 = await bcrypt.hash('Driver@123', salt2);
    driverUser = new Driver({
      name: 'Driver Test',
      email: 'driver@test.com',
      password: hashed2,
      phone: '+1234567890',
      idNumber: 'DR123',
      dateOfBirth: new Date('1985-01-01'),
      status: 'active'
    });
    await driverUser.save();

    // Nurse for order assignment
    const salt3 = await bcrypt.genSalt(10);
    const hashed3 = await bcrypt.hash('Nurse@123', salt3);
    nurseUser = new User({
      name: 'Nurse Order',
      email: 'nurseorder@test.com',
      password: hashed3,
      role: 'nurse',
      isVerified: true,
      profileComplete: true
    });
    await nurseUser.save();
  });

  after(async function() {
    await User.deleteMany({});
    await Patient.deleteMany({});
    await Order.deleteMany({});
    await Driver.deleteMany({});
  });

  describe('Patient placing order', function() {
    let agent;

    beforeEach(async function() {
      agent = request.agent(app);
      await agent
        .post('/auth/login')
        .send({ email: 'orderpatient@test.com', password: 'Patient@123' });
    });

    it('should render order page', async function() {
      const res = await agent.get('/patient/order');
      expect(res.status).to.equal(200);
    });

    it('should place a new order', async function() {
      const res = await agent
        .post('/patient/order/place')
        .send({
          patientName: 'Order Patient',
          patientEmail: 'orderpatient@test.com',
          patientPhone: '+1234567890',
          prescriptionName: 'Amoxicillin',
          location: '123 Main St',
          latitude: '-22.56',
          longitude: '17.06',
          notes: 'Urgent'
        });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/patient/order');
      const order = await Order.findOne({ patientId: patientUser._id });
      expect(order).to.exist;
      expect(order.prescriptionName).to.equal('Amoxicillin');
      expect(order.status).to.equal('pending');
      orderId = order._id;
    });
  });

  describe('Nurse assigning driver', function() {
    let agent;

    beforeEach(async function() {
      agent = request.agent(app);
      await agent
        .post('/auth/login')
        .send({ email: 'nurseorder@test.com', password: 'Nurse@123' });
    });

    it('should assign driver to order', async function() {
      const order = await Order.findOne({ patientId: patientUser._id });
      expect(order).to.exist; // Ensure order exists
      const driver = await Driver.findOne({ email: 'driver@test.com' });
      expect(driver).to.exist;
      const res = await agent
        .post('/nurse/order/assign-driver')
        .send({ orderId: order._id, driverId: driver._id });
      expect(res.status).to.equal(302);
      const updated = await Order.findById(order._id);
      expect(updated.driverId.toString()).to.equal(driver._id.toString());
      expect(updated.status).to.equal('in-transit');
    });
  });

  describe('Driver updating order status', function() {
    let agent;

    beforeEach(async function() {
      agent = request.agent(app);
      await agent
        .post('/driver/login')
        .send({ email: 'driver@test.com', password: 'Driver@123' });
    });

    it('should mark order as delivered', async function() {
      const order = await Order.findOne({ patientId: patientUser._id });
      expect(order).to.exist;
      const res = await agent
        .post('/driver/order/status')
        .send({ orderId: order._id, status: 'delivered' });
      expect(res.status).to.equal(302);
      const updated = await Order.findById(order._id);
      expect(updated.status).to.equal('delivered');
      expect(updated.deliveryDate).to.exist;
    });
  });
});