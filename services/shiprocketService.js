const axios = require('axios');

class ShiprocketService {
  constructor() {
    this.baseUrl = 'https://apiv2.shiprocket.in/v1/external';
    this.email = process.env.SHIPROCKET_EMAIL;
    this.password = process.env.SHIPROCKET_PASSWORD;
    this.apiToken = process.env.SHIPROCKET_API_TOKEN; // Optional: direct API token
    this.authToken = null;
    this.tokenExpiry = null;
    this.authFailed = false;
  }

  /**
   * Authenticate with Shiprocket and get access token
   * Token is valid for 240 hours (10 days) according to Shiprocket docs
   * @returns {Promise<string|null>} Auth token or null if failed
   */
  async authenticate() {
    // Don't retry if authentication already failed
    if (this.authFailed) {
      console.warn('⚠️ Authentication previously failed, skipping retry');
      return null;
    }

    // Use direct API token if provided (RECOMMENDED)
    if (this.apiToken) {
      console.log('🔑 Using direct API token from config (skipping login)');
      return this.apiToken;
    }

    // Check if credentials are configured
    if (!this.email || !this.password) {
      console.warn('⚠️ Shiprocket credentials not found in environment variables');
      console.warn('   Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD or SHIPROCKET_API_TOKEN');
      this.authFailed = true;
      return null;
    }

    try {
      console.log('🔐 Attempting Shiprocket authentication...');
      console.log(`   Endpoint: ${this.baseUrl}/auth/login`);
      console.log(`   API User Email: ${this.email}`);
      console.log('   Note: Using API User credentials (not main account)');

      const response = await axios.post(
        `${this.baseUrl}/auth/login`,
        {
          email: this.email,
          password: this.password,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      if (response.status === 200 && response.data.token) {
        this.authToken = response.data.token;
        // Token is valid for 240 hours (10 days)
        this.tokenExpiry = new Date(Date.now() + 240 * 60 * 60 * 1000);
        this.authFailed = false;
        console.log('✅ Shiprocket authentication successful');
        console.log(`   Token expires at: ${this.tokenExpiry} (240 hours / 10 days)`);
        return this.authToken;
      } else {
        console.error('❌ Shiprocket Auth Error: Invalid response');
        this.authFailed = true;
        return null;
      }
    } catch (error) {
      console.error('❌ Shiprocket Auth Error:', error.response?.status || error.message);
      
      if (error.response) {
        const statusCode = error.response.status;
        const errorData = error.response.data;
        
        console.error(`   Status: ${statusCode}`);
        if (errorData.message) {
          console.error(`   Message: ${errorData.message}`);
        }
        if (errorData.errors) {
          console.error(`   Errors:`, errorData.errors);
        }

        if (statusCode === 403) {
          console.error('⚠️ 403 Forbidden - Possible causes:');
          console.error('   1. Using main Shiprocket account credentials instead of API User credentials');
          console.error('   2. API User email is the same as your registered Shiprocket email');
          console.error('   3. Invalid API User email or password');
          console.error('   4. API User account is suspended or inactive');
          console.error('   5. IP address not whitelisted in Shiprocket');
          console.error('');
          console.error('💡 Solutions:');
          console.error('   - Create an API User at: https://app.shiprocket.in/settings/api');
          console.error('   - Use API User credentials (NOT your main account credentials)');
          console.error('   - API User email MUST be different from your registered email');
        } else if (statusCode === 401) {
          console.error('⚠️ 401 Unauthorized - Invalid credentials');
          console.error('   Please check your API User email and password');
        } else if (statusCode === 404) {
          console.error('⚠️ 404 Not Found - Endpoint might be incorrect');
          console.error(`   Current endpoint: ${this.baseUrl}/auth/login`);
        }
      } else {
        console.error('   Network error:', error.message);
      }

      this.authFailed = true;
      return null;
    }
  }

  /**
   * Reset authentication failure flag (allows retry)
   */
  resetAuthFailure() {
    this.authFailed = false;
    this.authToken = null;
    this.tokenExpiry = null;
    console.log('🔄 Shiprocket authentication reset - will retry on next call');
  }

  /**
   * Get valid auth token (authenticates if needed)
   * @returns {Promise<string|null>} Auth token or null if failed
   */
  async getAuthToken() {
    // Use direct API token if provided
    if (this.apiToken) {
      return this.apiToken;
    }

    // Don't try if authentication already failed
    if (this.authFailed) {
      console.warn('⚠️ Authentication previously failed. Call resetAuthFailure() to retry.');
      return null;
    }

    // Check if token exists and is not expired
    if (this.authToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.authToken;
    }

    // Authenticate to get new token
    return await this.authenticate();
  }

  /**
   * Get order tracking details by Shiprocket Order ID
   * @param {string} orderId - Shiprocket order ID
   * @returns {Promise<Object|null>} Order tracking data or null if failed
   */
  async getOrderTracking(orderId) {
    try {
      const token = await this.getAuthToken();
      if (!token) {
        console.error('Failed to authenticate with Shiprocket');
        return null;
      }

      // Remove # if present in order ID
      const cleanOrderId = orderId.replace(/#/g, '');

      const response = await axios.get(
        `${this.baseUrl}/orders/show/${cleanOrderId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          timeout: 10000,
        }
      );

      if (response.status === 200) {
        return response.data.data || response.data;
      } else {
        console.error(`❌ Shiprocket API Error: ${response.status}`);
        return null;
      }
    } catch (error) {
      console.error('Exception in getOrderTracking:', error.message);
      
      if (error.response) {
        const statusCode = error.response.status;
        console.error(`   Status: ${statusCode}`);
        
        if (statusCode === 403) {
          console.error('⚠️ 403 Forbidden - Clearing auth token for retry');
          this.authToken = null;
          this.tokenExpiry = null;
          this.authFailed = false; // Allow retry
        }
      }
      
      return null;
    }
  }

  /**
   * Get tracking details by AWB (Airway Bill) code
   * @param {string} awbCode - AWB code
   * @returns {Promise<Object|null>} Tracking data or null if failed
   */
  async getTrackingByAWB(awbCode) {
    try {
      const token = await this.getAuthToken();
      if (!token) {
        console.error('Failed to authenticate with Shiprocket');
        return null;
      }

      const response = await axios.get(
        `${this.baseUrl}/courier/track/awb/${awbCode}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          timeout: 10000,
        }
      );

      if (response.status === 200) {
        return response.data.data || response.data;
      } else {
        console.error(`❌ Shiprocket AWB Tracking Error: ${response.status}`);
        return null;
      }
    } catch (error) {
      console.error('Exception in getTrackingByAWB:', error.message);
      
      if (error.response) {
        const statusCode = error.response.status;
        console.error(`   Status: ${statusCode}`);
        
        if (statusCode === 403) {
          console.error('⚠️ 403 Forbidden - Clearing auth token for retry');
          this.authToken = null;
          this.tokenExpiry = null;
          this.authFailed = false;
        }
      }
      
      return null;
    }
  }

  /**
   * Create a shipment order in Shiprocket
   * @param {Object} shipmentData - Shipment data matching Shiprocket API requirements
   * @returns {Promise<Object|null>} Created shipment data or null if failed
   */
  async createShipment(shipmentData) {
    try {
      const token = await this.getAuthToken();
      if (!token) {
        console.error('Failed to authenticate with Shiprocket');
        return null;
      }

      const response = await axios.post(
        `${this.baseUrl}/orders/create/adhoc`,
        shipmentData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          timeout: 30000,
        }
      );

      if (response.status === 200) {
        console.log(`✅ Shiprocket shipment created successfully: ${response.data.order_id}`);
        return response.data;
      } else {
        console.error(`❌ Error creating Shiprocket shipment: ${response.status}`);
        return null;
      }
    } catch (error) {
      console.error('Exception in createShipment:', error.message);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Response: ${JSON.stringify(error.response.data)}`);
      }
      return null;
    }
  }

  /**
   * Verify Shiprocket API credentials
   * @returns {Promise<boolean>} True if credentials are valid
   */
  async verifyCredentials() {
    try {
      const token = await this.authenticate();
      return token !== null;
    } catch (error) {
      console.error('Exception in verifyCredentials:', error.message);
      return false;
    }
  }
}

module.exports = new ShiprocketService();

