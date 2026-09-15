// services/notification.service.js
const httpSMSService = require('./httpsms');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const Order = require('../models/Order');
const Nurse = require('../models/Nurse');
const { getTomorrowHoliday } = require('../utils/namibiaHolidays');

class NotificationService {

  // ============================================================
  //  BIRTHDAY NOTIFICATIONS
  // ============================================================

  async sendBirthdaySms(patient) {
    const messages = [
      `🎉 Happy Birthday ${patient.name}! 🎂\n\nWishing you a wonderful day filled with joy and good health.\n\nFrom all of us at Appointment Booking! 🎈`,
      `🎊 Happy Birthday ${patient.name}! 🎊\n\nMay your special day be as amazing as you are. Thank you for choosing us for your healthcare needs.\n\nStay healthy! 💙`,
      `🌟 Happy Birthday ${patient.name}! 🌟\n\nAnother year of health and happiness. We're honored to be part of your healthcare journey.\n\nBest wishes from the Appointment Booking team! 🎁`
    ];
    const message = messages[Math.floor(Math.random() * messages.length)];
    return await httpSMSService.sendSms(patient.phone, message);
  }

  async sendBirthdaySmsToAll() {
    try {
      const today = new Date();
      const todayDay = today.getDate();
      const todayMonth = today.getMonth() + 1;

      console.log(`🎂 Checking birthdays for: ${todayMonth}/${todayDay}`);

      const patients = await Patient.find({
        $expr: {
          $and: [
            { $eq: [{ $dayOfMonth: '$dateOfBirth' }, todayDay] },
            { $eq: [{ $month: '$dateOfBirth' }, todayMonth] }
          ]
        },
        smsOptIn: true,
        phone: { $ne: null, $ne: '' }
      });

      console.log(`🎂 Found ${patients.length} patients with birthdays today`);

      if (patients.length === 0) {
        return [];
      }

      const results = [];
      for (const patient of patients) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        if (patient.lastSmsSent && patient.lastSmsSent >= todayStart) {
          console.log(`⏭️ Skipping ${patient.name} - SMS already sent today`);
          continue;
        }

        const result = await this.sendBirthdaySms(patient);
        if (result.success) {
          await Patient.findByIdAndUpdate(patient._id, { lastSmsSent: Date.now() });
        }
        results.push({ patient: patient.name, phone: patient.phone, success: result.success });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return results;
    } catch (error) {
      console.error('❌ Birthday SMS error:', error);
      return [];
    }
  }

  // ============================================================
  //  5-HOUR APPOINTMENT REMINDER  (NEW)
  // ============================================================

  /**
   * Combine an Appointment's date (Date) and time (string "HH:MM")
   * into a single Date object.
   */
  combineDateAndTime(date, timeStr) {
    const [hh, mm] = timeStr.split(':').map(Number);
    const d = new Date(date);
    d.setHours(hh, mm, 0, 0);
    return d;
  }

  /**
   * Send a 5-hour reminder for a single appointment.
   */
  async sendFiveHourReminder(appointment) {
    try {
      const patient = await Patient.findOne({ userId: appointment.patientId });
      if (!patient || !patient.phone) {
        console.log(`⚠️ No phone for patient: ${appointment.patientName}`);
        return { success: false, error: 'Patient phone not found' };
      }

      const apptDate = new Date(appointment.date).toLocaleDateString();
      const message =
        `⏰ Appointment Reminder\n\n` +
        `Hello ${patient.name},\n\n` +
        `You have an appointment today at ${appointment.time} (${apptDate}).\n\n` +
        `Please arrive 15 minutes early.\n\n` +
        `See you soon!`;

      const result = await httpSMSService.sendSms(patient.phone, message);
      if (result.success) {
        await Appointment.findByIdAndUpdate(appointment._id, {
          fiveHourReminderSent: true
        });
      }
      return result;
    } catch (error) {
      console.error('❌ 5-hour reminder error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Called hourly. Finds appointments starting ~5 hours from now
   * (window: now+5h → now+6h) whose reminder hasn't been sent yet.
   */
  async sendAppointmentRemindersFiveHoursBefore() {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() + 5 * 60 * 60 * 1000);
      const windowEnd   = new Date(now.getTime() + 6 * 60 * 60 * 1000);

      console.log(
        `⏰ Checking appointments between ${windowStart.toLocaleTimeString()} and ${windowEnd.toLocaleTimeString()}`
      );

      const appointments = await Appointment.find({
        status: { $in: ['pending', 'confirmed'] },
        fiveHourReminderSent: { $ne: true }
      });

      const due = appointments.filter(a => {
        const dt = this.combineDateAndTime(a.date, a.time);
        return dt >= windowStart && dt < windowEnd;
      });

      console.log(`⏰ Found ${due.length} appointments needing 5h reminders`);

      if (due.length === 0) return [];

      const results = [];
      for (const appointment of due) {
        const result = await this.sendFiveHourReminder(appointment);
        results.push({
          patient: appointment.patientName,
          appointmentId: appointment._id,
          success: result.success
        });
        await new Promise(r => setTimeout(r, 1000));
      }
      return results;
    } catch (error) {
      console.error('❌ 5-hour appointment reminders error:', error);
      return [];
    }
  }

  // ============================================================
  //  LEGACY APPOINTMENT REMINDER (day-before)  — kept for compatibility
  // ============================================================

  async sendAppointmentReminder(appointment) {
    try {
      const patient = await Patient.findOne({ userId: appointment.patientId });
      if (!patient || !patient.phone) {
        console.log(`⚠️ No phone for patient: ${appointment.patientName}`);
        return { success: false, error: 'Patient phone not found' };
      }

      const message = `📅 Appointment Reminder\n\nHello ${patient.name},\n\nThis is a reminder of your appointment on ${new Date(appointment.date).toLocaleDateString()} at ${appointment.time}.\n\nPlease arrive 15 minutes early.\n\nThank you!`;

      const result = await httpSMSService.sendSms(patient.phone, message);
      if (result.success) {
        await Appointment.findByIdAndUpdate(appointment._id, { reminderSent: true });
      }
      return result;
    } catch (error) {
      console.error('❌ Appointment reminder error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendAppointmentRemindersForToday() {
    try {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const startOfTomorrow = new Date(tomorrow);
      startOfTomorrow.setHours(0, 0, 0, 0);

      const endOfTomorrow = new Date(tomorrow);
      endOfTomorrow.setHours(23, 59, 59, 999);

      console.log(`📅 Checking appointments for: ${startOfTomorrow.toLocaleDateString()}`);

      const appointments = await Appointment.find({
        date: {
          $gte: startOfTomorrow,
          $lt: endOfTomorrow
        },
        reminderSent: { $ne: true },
        status: { $in: ['confirmed', 'pending'] }
      });

      console.log(`📅 Found ${appointments.length} appointments for tomorrow`);

      if (appointments.length === 0) {
        return [];
      }

      const results = [];
      for (const appointment of appointments) {
        const result = await this.sendAppointmentReminder(appointment);
        results.push({
          patient: appointment.patientName,
          date: appointment.date,
          success: result.success
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return results;
    } catch (error) {
      console.error('❌ Appointment reminders error:', error);
      return [];
    }
  }

  // ============================================================
  //  ORDER NOTIFICATIONS
  // ============================================================

  async sendOrderStatusUpdate(order) {
    try {
      const patient = await Patient.findOne({ userId: order.patientId });
      if (!patient || !patient.phone) {
        console.log(`⚠️ No phone for patient: ${order.patientName}`);
        return { success: false, error: 'Patient phone not found' };
      }

      let message = '';
      if (order.status === 'in-transit') {
        message = `🚚 Order In Transit!\n\nHello ${patient.name},\n\nYour order for ${order.prescriptionName} is on its way!\n\nOrder #: ${order._id}\n\nYou will receive a notification when it's delivered.\n\nThank you!`;
      } else if (order.status === 'delivered') {
        message = `📦 Order Delivered!\n\nHello ${patient.name},\n\nYour order for ${order.prescriptionName} has been delivered.\n\nThank you for choosing us!\n\nStay healthy! 💙`;
      } else if (order.status === 'pending') {
        message = `📋 Order Received!\n\nHello ${patient.name},\n\nWe have received your order for ${order.prescriptionName}.\n\nOrder #: ${order._id}\n\nWe'll notify you when it's being prepared.\n\nThank you!`;
      }

      if (!message) return { success: false, error: 'Invalid order status' };

      const result = await httpSMSService.sendSms(patient.phone, message);
      if (result.success) {
        await Order.findByIdAndUpdate(order._id, { lastNotificationSent: Date.now() });
      }
      return result;
    } catch (error) {
      console.error('❌ Order notification error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendOrderStatusUpdates() {
    try {
      const orders = await Order.find({
        status: { $in: ['pending', 'in-transit', 'delivered'] },
        lastNotificationSent: { $exists: false }
      }).limit(10);

      console.log(`📦 Found ${orders.length} orders needing notifications`);

      if (orders.length === 0) {
        return [];
      }

      const results = [];
      for (const order of orders) {
        const result = await this.sendOrderStatusUpdate(order);
        results.push({
          order: order._id,
          patient: order.patientName,
          status: order.status,
          success: result.success
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return results;
    } catch (error) {
      console.error('❌ Order notifications error:', error);
      return [];
    }
  }

  // ============================================================
  //  CHRONIC REFILL REMINDERS (5 days before depletion)
  // ============================================================

  async sendChronicRefillReminder(patient) {
    try {
      const daysLeft = Math.ceil((patient.nextRefillDate - new Date()) / (1000 * 60 * 60 * 24));
      const message = `💊 Reminder: Your chronic medication ${patient.medicationName || 'prescription'} refill is due in ${daysLeft} days. Please order a refill.`;
      const result = await httpSMSService.sendSms(patient.phone, message);
      return result;
    } catch (error) {
      console.error('❌ Chronic refill reminder error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendChronicRefillReminders() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const fiveDaysLater = new Date(today);
      fiveDaysLater.setDate(fiveDaysLater.getDate() + 5);

      const patients = await Patient.find({
        isChronic: true,
        nextRefillDate: { $gte: today, $lte: fiveDaysLater },
        $or: [
          { lastRefillReminderSentAt: null },
          { lastRefillReminderSentAt: { $lt: new Date(today.getTime() - 24 * 60 * 60 * 1000) } }
        ]
      });

      console.log(`👥 Found ${patients.length} patients needing refill reminders`);

      if (patients.length === 0) return [];

      const results = [];
      for (const patient of patients) {
        // Send to patient
        const patientResult = await this.sendChronicRefillReminder(patient);
        results.push({ patient: patient.name, type: 'patient', success: patientResult.success });

        // Send to all nurses
        const nurses = await Nurse.find().populate('userId');
        for (const nurse of nurses) {
          if (nurse.phone) {
            const daysLeft = Math.ceil((patient.nextRefillDate - new Date()) / (1000 * 60 * 60 * 24));
            const nurseMessage = `📋 Patient ${patient.name} needs a refill for ${patient.medicationName || 'medication'} in ${daysLeft} days. Please follow up.`;
            const nurseResult = await httpSMSService.sendSms(nurse.phone, nurseMessage);
            results.push({ patient: patient.name, type: 'nurse', success: nurseResult.success });
          }
        }

        // Update lastRefillReminderSentAt
        await Patient.findByIdAndUpdate(patient._id, { lastRefillReminderSentAt: Date.now() });
      }

      return results;
    } catch (error) {
      console.error('❌ Chronic refill reminders error:', error);
      return [];
    }
  }

  // ============================================================
  //  PUBLIC HOLIDAY NOTICE (day before)  (NEW)
  // ============================================================

  /**
   * Sends a public-holiday notice to all opted-in patients for tomorrow.
   */
  async sendPublicHolidayNotices() {
    try {
      const holiday = getTomorrowHoliday();
      if (!holiday) {
        console.log('📅 No public holiday tomorrow');
        return [];
      }

      console.log(`🎉 Tomorrow is ${holiday.name}, notifying patients...`);

      const patients = await Patient.find({
        smsOptIn: true,
        phone: { $ne: null, $ne: '' }
      });

      console.log(`👥 Found ${patients.length} opted-in patients`);

      if (patients.length === 0) return [];

      const message =
        `📢 Public Holiday Notice\n\n` +
        `Dear patient,\n\n` +
        `Please note that tomorrow (${holiday.date.toLocaleDateString()}) ` +
        `is ${holiday.name}. Our offices will be closed.\n\n` +
        `For emergencies, please contact our emergency line.\n\n` +
        `Thank you.`;

      const results = [];
      for (const patient of patients) {
        const result = await httpSMSService.sendSms(patient.phone, message);
        results.push({
          patient: patient.name,
          phone: patient.phone,
          holiday: holiday.name,
          success: result.success
        });
        await new Promise(r => setTimeout(r, 1000));
      }

      return results;
    } catch (error) {
      console.error('❌ Public holiday SMS error:', error);
      return [];
    }
  }
}

module.exports = new NotificationService();