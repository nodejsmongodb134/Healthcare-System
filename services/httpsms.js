// services/httpsms.js
const axios = require('axios');

class HttpSMSService {
  constructor() {
    this.apiKey = process.env.HTTPSMS_API_KEY;
    this.fromNumber = process.env.HTTPSMS_FROM_NUMBER;
    this.enabled = process.env.SMS_ENABLED === 'true';
    this.baseURL = 'https://api.httpsms.com/v1';
    
    if (this.enabled && this.apiKey) {
      console.log('📱 httpSMS service initialized');
    }
  }

  async sendSms(phoneNumber, message) {
    if (!this.enabled || !this.apiKey) {
      console.log('📱 SMS disabled. Would send:', { phoneNumber, message });
      return { success: true, mock: true };
    }

    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);

      const response = await axios.post(
        `${this.baseURL}/messages/send`,
        {
          to: formattedNumber,
          from: this.fromNumber,
          content: message
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      console.log(`✅ SMS sent to: ${phoneNumber}`);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ SMS failed:', error.response?.data?.message || error.message);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  formatPhoneNumber(phone) {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0') && cleaned.length === 10) {
      cleaned = '27' + cleaned.substring(1);
    }
    if (cleaned.length === 9) {
      cleaned = '27' + cleaned;
    }
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  }

  async testConnection() {
    try {
      return { success: true, message: 'httpSMS connection successful!' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new HttpSMSService();