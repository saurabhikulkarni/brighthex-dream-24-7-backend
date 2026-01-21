const axios = require('axios');

class Msg91Service {
  constructor() {
    this.authKey = process.env.MSG91_AUTH_KEY;
    this.templateId = process.env.MSG91_TEMPLATE_ID;
    this.senderId = process.env.MSG91_SENDER_ID || 'BHTTPL';
    // Use Flow API (Send SMS) instead of OTP API to send custom OTP values
    this.baseUrl = 'https://control.msg91.com/api/v5/flow';
    
    if (!this.authKey) {
      console.warn('⚠️  MSG91_AUTH_KEY not found in environment variables');
    }
  }

  /**
   * Send OTP via MSG91 Flow API (allows custom OTP values)
   * @param {string} mobileNumber - 10-digit mobile number
   * @param {string} otp - 6-digit OTP
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async sendOtp(mobileNumber, otp) {
    try {
      if (!this.authKey) {
        throw new Error('MSG91_AUTH_KEY not configured');
      }

      if (!this.templateId) {
        throw new Error('MSG91_TEMPLATE_ID not configured');
      }

      // MSG91 Flow API endpoint - allows sending custom OTP in template
      const url = this.baseUrl;
      
      // Flow API payload format
      // The variable name must match your template: ##OTP## -> use "OTP" as key
      const payload = {
        template_id: this.templateId,
        sender: this.senderId,
        short_url: "0",
        mobiles: `91${mobileNumber}`,
        // Variable replacement: ##OTP## in template gets replaced with this value
        OTP: otp.toString()
      };

      console.log('MSG91 Flow API Request URL:', url);
      console.log('MSG91 Flow API Request Payload:', JSON.stringify(payload, null, 2));
      console.log('MSG91 Auth Key:', this.authKey.substring(0, 10) + '...');
      
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'authkey': this.authKey
        },
        timeout: 10000 // 10 seconds timeout
      });

      console.log('MSG91 Response:', JSON.stringify(response.data, null, 2));

      // MSG91 response format - check for success indicators
      if (response.data.type === 'success' || 
          response.data.message === 'OTP sent successfully' ||
          response.data.message?.toLowerCase().includes('success') ||
          response.status === 200) {
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
      console.error('Full Error:', error.message);
      
      // Handle specific error cases
      if (error.response) {
        // MSG91 API returned an error response
        const errorData = error.response.data;
        console.error('MSG91 Error Response:', JSON.stringify(errorData, null, 2));
        return {
          success: false,
          message: errorData.message || `Failed to send OTP (${error.response.status})`
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
}

module.exports = new Msg91Service();
