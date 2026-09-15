// test-sms.js
require('dotenv').config();
const httpSMSService = require('./services/httpsms');

async function testSMS() {
  console.log('📱 Testing httpSMS...');
  console.log('🔑 API Key:', process.env.HTTPSMS_API_KEY ? '✅ Set' : '❌ Not set');
  console.log('📱 From Number:', process.env.HTTPSMS_FROM_NUMBER || '❌ Not set');
  
  // Test connection
  console.log('\n🔍 Testing connection...');
  const test = await httpSMSService.testConnection();
  console.log('Connection:', test);
  
  if (!test.success) {
    console.error('❌ Connection failed. Please check your API key.');
    process.exit(1);
  }
  
  // Test sending a message
  const testPhone = '+27721234567'; // Replace with your phone number
  const testMessage = '🧪 Test SMS from Appointment Booking!\n\nIf you received this, your httpSMS integration is working correctly!';
  
  console.log(`\n📤 Sending test SMS to ${testPhone}...`);
  const result = await httpSMSService.sendSms(testPhone, testMessage);
  
  if (result.success) {
    console.log('✅ Test SMS sent successfully!');
    console.log('📋 Result:', result);
  } else {
    console.error('❌ Test SMS failed:', result.error);
  }
  
  process.exit(0);
}

testSMS();