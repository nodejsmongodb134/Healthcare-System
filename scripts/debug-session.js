// scripts/debug-session.js
const request = require('supertest');
const { app } = require('../server');
const mongoose = require('mongoose');

(async () => {
  // Use a valid user from your database (change these credentials)
  const email = 'admin@test.com'; // Replace with actual admin email
  const password = 'Admin@123';   // Replace with actual admin password

  const agent = request.agent(app);
  const loginRes = await agent.post('/auth/login').send({ email, password });
  console.log('Login Status:', loginRes.status);
  console.log('Login Headers:', loginRes.headers);
  console.log('Set-Cookie:', loginRes.headers['set-cookie']);

  // Now test a protected route with the same agent
  const protectedRes = await agent.get('/admin/dashboard');
  console.log('Protected Route Status:', protectedRes.status);
  console.log('Protected Route Location:', protectedRes.headers.location || 'None');

  // Check if we can access session info via a debug route if available
  // (not defined, so we'll just inspect the response)
  console.log('Done.');
  await mongoose.connection.close();
})();