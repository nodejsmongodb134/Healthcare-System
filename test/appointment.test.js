const request = require('supertest');
const app = require('../server');
const { expect } = require('chai');
const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const bcrypt = require('bcryptjs');

describe('📅 Appointments API', function() {
  this.timeout(15000);

  let patientUser;
  let nurseUser;
  let patientProfile;
  let appointmentId;

  before(async function() {
    // Create a patient user and profile
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash('Patient@123', salt);
    patientUser = new User({
      name: 'Patient Test',
      email: 'patient@test.com',
      password: hashed,
      role: 'patient',
      isVerified: true,
      profileComplete: true
    });
    await patientUser.save();

    patientProfile = new Patient({
      userId: patientUser._id,
      name: 'Patient Test',
      phone: '+1234567890',
      idNumber: '12345',
      dateOfBirth: new Date('1990-01-01'),
      email: 'patient@test.com'
    });
    await patientProfile.save();

    // Create a nurse user
    const salt2 = await bcrypt.genSalt(10);
    const hashed2 = await bcrypt.hash('Nurse@123', salt2);
    nurseUser = new User({
      name: 'Nurse Test',
      email: 'nurse@test.com',
      password: hashed2,
      role: 'nurse',
      isVerified: true,
      profileComplete: true
    });
    await nurseUser.save();
  });

  after(async function() {
    await User.deleteMany({});
    await Patient.deleteMany({});
    await Appointment.deleteMany({});
  });

  describe('Patient booking', function() {
    let agent;

    beforeEach(async function() {
      agent = request.agent(app);
      await agent
        .post('/auth/login')
        .send({ email: 'patient@test.com', password: 'Patient@123' });
    });

    it('should render booking page', async function() {
      const res = await agent.get('/patient/appointment');
      expect(res.status).to.equal(200);
    });

    it('should book a new appointment', async function() {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().slice(0,10);

      const res = await agent
        .post('/patient/appointment/book')
        .send({
          patientName: 'Patient Test',
          patientEmail: 'patient@test.com',
          patientPhone: '+1234567890',
          date: dateStr,
          time: '10:00',
          description: 'Test appointment'
        });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/patient/appointment');

      const appt = await Appointment.findOne({ patientId: patientUser._id });
      expect(appt).to.exist;
      expect(appt.description).to.equal('Test appointment');
      expect(appt.status).to.equal('pending');
      appointmentId = appt._id;
    });

    it('should prevent double booking same time slot', async function() {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().slice(0,10);

      // First booking (already done, but we'll do another one with same slot)
      await agent
        .post('/patient/appointment/book')
        .send({
          patientName: 'Patient Test',
          patientEmail: 'patient@test.com',
          patientPhone: '+1234567890',
          date: dateStr,
          time: '10:30',
          description: 'Another test'
        });
      // Second booking with same slot
      const res = await agent
        .post('/patient/appointment/book')
        .send({
          patientName: 'Patient Test',
          patientEmail: 'patient@test.com',
          patientPhone: '+1234567890',
          date: dateStr,
          time: '10:30',
          description: 'Duplicate'
        });
      expect(res.status).to.equal(302);
      // Should have flash error (we don't check flash in tests easily, but we can check that we are redirected back)
      expect(res.headers.location).to.equal('/patient/appointment');
      const count = await Appointment.countDocuments({ date: new Date(dateStr), time: '10:30' });
      expect(count).to.equal(1);
    });
  });

  describe('Patient viewing appointments', function() {
    let agent;

    beforeEach(async function() {
      agent = request.agent(app);
      await agent
        .post('/auth/login')
        .send({ email: 'patient@test.com', password: 'Patient@123' });
    });

    it('should list patient appointments', async function() {
      const res = await agent.get('/patient/view-appointments');
      expect(res.status).to.equal(200);
    });

    it('should show appointment details', async function() {
      const appt = await Appointment.findOne({ patientId: patientUser._id });
      const res = await agent.get(`/patient/appointment/${appt._id}`);
      expect(res.status).to.equal(200);
    });

    it('should cancel appointment', async function() {
      const appt = await Appointment.findOne({ patientId: patientUser._id });
      const res = await agent
        .post(`/patient/appointment/cancel/${appt._id}`)
        .send({});
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/patient/view-appointments');
      const updated = await Appointment.findById(appt._id);
      expect(updated.status).to.equal('cancelled');
    });
  });

  describe('Nurse managing appointments', function() {
    let agent;

    beforeEach(async function() {
      agent = request.agent(app);
      await agent
        .post('/auth/login')
        .send({ email: 'nurse@test.com', password: 'Nurse@123' });
    });

    it('should list all appointments', async function() {
      const res = await agent.get('/nurse/nurse-appointments');
      expect(res.status).to.equal(200);
    });

    it('should update appointment status', async function() {
      const appt = await Appointment.findOne({ patientId: patientUser._id });
      const res = await agent
        .post('/nurse/appointment/status')
        .send({ appointmentId: appt._id, status: 'confirmed' });
      expect(res.status).to.equal(302);
      const updated = await Appointment.findById(appt._id);
      expect(updated.status).to.equal('confirmed');
    });

    it('should reschedule appointment', async function() {
      const appt = await Appointment.findOne({ patientId: patientUser._id });
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const dateStr = futureDate.toISOString().slice(0,10);
      const res = await agent
        .post('/nurse/appointment/reschedule')
        .send({ appointmentId: appt._id, date: dateStr, time: '14:00' });
      expect(res.status).to.equal(302);
      const updated = await Appointment.findById(appt._id);
      expect(updated.date.toISOString().slice(0,10)).to.equal(dateStr);
      expect(updated.time).to.equal('14:00');
    });
  });
});