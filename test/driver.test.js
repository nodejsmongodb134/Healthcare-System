const request = require('supertest');
const app = require('../server');
const { expect } = require('chai');
const mongoose = require('mongoose');
const Driver = require('../models/Driver');
const Order = require('../models/Order');
const bcrypt = require('bcryptjs');

describe('🚚 Driver API', function() {
  this.timeout(15000);

  let driverUser;
  let orderId;

  before(async function() {
    // Create a driver
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash('Driver@123', salt);
    driverUser = new Driver({
      name: 'Driver Test',
      email: 'drivertest@test.com',
      password: hashed,
      phone: '+1234567890',
      idNumber: 'DRV789',
      dateOfBirth: new Date('1985-01-01'),
      status: 'active'
    });
    await driverUser.save();

    // Create an order assigned to this driver
    const order = new Order({
      patientId: new mongoose.Types.ObjectId(),
      patientName: 'Test Patient',
      patientEmail: 'test@test.com',
      patientPhone: '+1234567890',
      prescriptionName: 'Test Drug',
      location: '123 Test St',
      status: 'in-transit',
      driverId: driverUser._id,
      driverName: driverUser.name,
      driverPhone: driverUser.phone,
      driverVehicle: 'car'
    });
    await order.save();
    orderId = order._id;
  });

  after(async function() {
    await Driver.deleteMany({});
    await Order.deleteMany({});
  });

  describe('Login', function() {
    it('should login driver successfully', async function() {
      const res = await request(app)
        .post('/driver/login')
        .send({ email: 'drivertest@test.com', password: 'Driver@123' });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/driver/dashboard');
    });

    it('should reject wrong password', async function() {
      const res = await request(app)
        .post('/driver/login')
        .send({ email: 'drivertest@test.com', password: 'Wrong' });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/driver/login');
    });
  });

  describe('Dashboard', function() {
    let agent;

    beforeEach(async function() {
      agent = request.agent(app);
      await agent
        .post('/driver/login')
        .send({ email: 'drivertest@test.com', password: 'Driver@123' });
    });

    it('should load dashboard', async function() {
      const res = await agent.get('/driver/dashboard');
      expect(res.status).to.equal(200);
    });

    it('should view order details', async function() {
      const res = await agent.get(`/driver/order/${orderId}`);
      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
    });

    it('should update order status to delivered', async function() {
      const res = await agent
        .post('/driver/order/status')
        .send({ orderId, status: 'delivered' });
      expect(res.status).to.equal(302);
      const order = await Order.findById(orderId);
      expect(order.status).to.equal('delivered');
      expect(order.deliveryDate).to.exist;
    });

    it('should change driver password', async function() {
      const res = await agent
        .post('/driver/change-password')
        .send({
          currentPassword: 'Driver@123',
          newPassword: 'NewDriver@123',
          confirmPassword: 'NewDriver@123'
        });
      expect(res.status).to.equal(302);
      // Verify login with new password
      const loginRes = await agent
        .post('/driver/login')
        .send({ email: 'drivertest@test.com', password: 'NewDriver@123' });
      expect(loginRes.status).to.equal(302);
    });
  });
});