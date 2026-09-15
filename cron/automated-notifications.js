// cron/automated-notifications.js
const cron = require('node-cron');
const notificationService = require('../services/notification.service');

// ============ Helper ============
function smsEnabled() {
  return process.env.SMS_ENABLED === 'true' && !!process.env.HTTPSMS_API_KEY;
}

// ============ 1. APPOINTMENT REMINDERS — 5 HOURS BEFORE ============
// Runs every hour at minute 0. Sends reminders for appointments starting
// in the next hour (i.e. roughly 5 hours from now).
cron.schedule('0 * * * *', async () => {
  console.log('⏰ Running 5-hour appointment reminders...');
  console.log(`🕐 ${new Date().toLocaleTimeString()}`);

  try {
    if (!smsEnabled()) {
      console.log('📱 SMS disabled or API key missing');
      return;
    }
    const results = await notificationService.sendAppointmentRemindersFiveHoursBefore();
    const success = results.filter(r => r.success).length;
    console.log(`✅ 5-hour reminders: ${success}/${results.length} sent`);
  } catch (error) {
    console.error('❌ 5-hour reminder error:', error);
  }
}, { timezone: 'Africa/Windhoek' });

// ============ 2. BIRTHDAY SMS — 8:00 AM DAILY ============
cron.schedule('0 8 * * *', async () => {
  console.log('🎂 Running automated birthday SMS...');
  console.log(`📅 ${new Date().toLocaleDateString()}`);

  try {
    if (!smsEnabled()) {
      console.log('📱 SMS disabled or API key missing');
      return;
    }
    const results = await notificationService.sendBirthdaySmsToAll();
    const success = results.filter(r => r.success).length;
    console.log(`✅ Birthday SMS: ${success}/${results.length} sent`);
  } catch (error) {
    console.error('❌ Birthday SMS error:', error);
  }
}, { timezone: 'Africa/Windhoek' });

// ============ 3. PUBLIC HOLIDAY NOTICE — 7:00 AM DAILY ============
// Sends a notice the day before any public holiday.
cron.schedule('0 7 * * *', async () => {
  console.log('📢 Running public holiday notice check...');
  console.log(`📅 ${new Date().toLocaleDateString()}`);

  try {
    if (!smsEnabled()) {
      console.log('📱 SMS disabled or API key missing');
      return;
    }
    const results = await notificationService.sendPublicHolidayNotices();
    if (results.length === 0) {
      console.log('ℹ️ No public holiday tomorrow — nothing sent');
      return;
    }
    const success = results.filter(r => r.success).length;
    console.log(`✅ Holiday notices: ${success}/${results.length} sent`);
  } catch (error) {
    console.error('❌ Public holiday notice error:', error);
  }
}, { timezone: 'Africa/Windhoek' });

// ============ 4. CHRONIC REFILL REMINDERS — 8:00 AM DAILY ============
// Notifies patients (and nurses) 5 days before their medication runs out.
cron.schedule('0 8 * * *', async () => {
  console.log('💊 Running chronic refill reminder check...');
  console.log(`📅 ${new Date().toLocaleDateString()}`);

  try {
    if (!smsEnabled()) {
      console.log('📱 SMS disabled or API key missing');
      return;
    }
    const results = await notificationService.sendChronicRefillReminders();
    const success = results.filter(r => r.success).length;
    console.log(`✅ Chronic refill reminders: ${success}/${results.length} sent`);
  } catch (error) {
    console.error('❌ Chronic refill reminder error:', error);
  }
}, { timezone: 'Africa/Windhoek' });

// ============ 5. ORDER STATUS NOTIFICATIONS — EVERY 30 MINUTES ============
cron.schedule('*/30 * * * *', async () => {
  console.log('📦 Running order status notifications...');
  console.log(`🕐 ${new Date().toLocaleTimeString()}`);

  try {
    if (!smsEnabled()) {
      console.log('📱 SMS disabled or API key missing');
      return;
    }
    const results = await notificationService.sendOrderStatusUpdates();
    const success = results.filter(r => r.success).length;
    console.log(`✅ Order notifications: ${success}/${results.length} sent`);
  } catch (error) {
    console.error('❌ Order notifications error:', error);
  }
}, { timezone: 'Africa/Windhoek' });

// ============ Summary ============
console.log('⏰ Automated notifications scheduled:');
console.log('   ⏰ Appointment reminders: Every hour (5h before appointment)');
console.log('   🎂 Birthday SMS:          8:00 AM daily');
console.log('   📢 Public holiday notice: 7:00 AM daily (only if holiday tomorrow)');
console.log('   💊 Chronic refill:        8:00 AM daily (5 days before depletion)');
console.log('   📦 Order status updates:  Every 30 minutes');