const axios = require('axios');

class Msg91Service {
  constructor() {
    this.authKey = process.env.MSG91_AUTH_KEY;
    this.templateId = process.env.MSG91_TEMPLATE_ID;
    this.senderId = process.env.MSG91_SENDER_ID || 'DREAM24';
    this.baseUrl = 'https://control.msg91.com/api/v5/otp';
    
    if (!this.authKey) {
      console.warn('⚠️  MSG91_AUTH_KEY not found in environment variables');
    }
  }

  /**
   * Send OTP via MSG91
   * @param {string} mobileNumber - 10-digit mobile number
   * @param {string} otp - 6-digit OTP
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async sendOtp(mobileNumber, otp) {
    try {
      if (!this.authKey) {
        throw new Error('MSG91_AUTH_KEY not configured');
      }

      // MSG91 API endpoint for sending OTP
      const url = `${this.baseUrl}?authkey=${this.authKey}`;
      
      // MSG91 expects #OTP# placeholder in message
      const message = `Your OTP for BrightHex Dream is #OTP#. Valid for 10 minutes. Do not share with anyone.`;
      
      const payload = {
        mobile: `91${mobileNumber}`, // Add country code
        message: message,
        otp: otp,
        sender: this.senderId
      };

      console.log('MSG91 Request URL:', url);
      console.log('MSG91 Request Payload:', JSON.stringify(payload, null, 2));
      
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 seconds timeout
      });

      console.log('MSG91 Response:', JSON.stringify(response.data, null, 2));

      // MSG91 response format
      if (response.data.type === 'success' || response.data.message === 'OTP sent successfully') {
        return {
          success: true,
          message: 'OTP sent successfully',
          requestId: response.data.request_id
        };
      } else {
        console.error('MSG91 returned non-success response:', response.data);
        return {
          success: false,
          message: response.data.message || 'Failed to send OTP'
        };
      }
    } catch (error) {
      console.error('MSG91 Send OTP Error:', error.response?.data || error.message);
      console.error('Error Code:', error.code);
      console.error('Error Details:', JSON.stringify(error, null, 2));
      
      // Handle specific error cases
      if (error.response) {
        // MSG91 API returned an error response
        const errorData = error.response.data;
        return {
          success: false,
          message: errorData.message || 'Failed to send OTP. Please try again.'
        };
      }
      
      // Network level errors (timeout, connection refused, etc.)
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return {
          success: false,
          message: 'Request timeout. MSG91 service is taking too long to respond. Please try again.'
        };
      }
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return {
          success: false,
          message: 'Cannot connect to MSG91 service. Please check your internet connection.'
        };
      }
      
      return {
        success: false,
        message: `Network error: ${error.message || 'Please check your connection and try again.'}`
      };
    }
  }

  /**
   * Verify OTP via MSG91 (optional - we handle verification locally)
   * @param {string} mobileNumber - 10-digit mobile number
   * @param {string} otp - 6-digit OTP
   * @returns {Promise<{success: boolean, verified: boolean}>}
   */
  async verifyOtp(mobileNumber, otp) {
    try {
      if (!this.authKey) {
        throw new Error('MSG91_AUTH_KEY not configured');
      }

      const url = `${this.baseUrl}/verify?authkey=${this.authKey}&mobile=91${mobileNumber}&otp=${otp}`;
      
      const response = await axios.get(url, {
        timeout: 10000
      });

      if (response.data.type === 'success') {
        return {
          success: true,
          verified: true
        };
      } else {
        return {
          success: false,
          verified: false,
          message: response.data.message || 'Invalid OTP'
        };
      }
    } catch (error) {
      console.error('MSG91 Verify OTP Error:', error.response?.data || error.message);
      return {
        success: false,
        verified: false,
        message: 'Failed to verify OTP'
      };
    }
  }
}

module.exports = new Msg91Service();
