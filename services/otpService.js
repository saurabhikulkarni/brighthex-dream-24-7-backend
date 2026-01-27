const crypto = require('crypto');

// In-memory storage (use Redis in production)
const otpStorage = new Map();

// OTP expiry time (10 minutes)
const OTP_EXPIRY_MS = 10 * 60 * 1000;

class OtpService {
  /**
   * Generate 6-digit OTP
   * @returns {string} 6-digit OTP
   */
  generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Store OTP in session
   * @param {string} mobileNumber - Mobile number
   * @param {string} otp - OTP code
   * @returns {string} Session ID
   */
  async storeOtp(mobileNumber, otp) {
    const sessionId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();

    otpStorage.set(sessionId, {
      mobileNumber,
      otp,
      timestamp,
      attempts: 0,
      maxAttempts: 5
    });

    // Auto-delete after expiry
    setTimeout(() => {
      otpStorage.delete(sessionId);
    }, OTP_EXPIRY_MS);

    return sessionId;
  }

  /**
   * Verify OTP
   * @param {string} mobileNumber - Mobile number
   * @param {string} otp - OTP to verify
   * @param {string} sessionId - Session ID (optional)
   * @returns {Object} Verification result
   */
  async verifyOtp(mobileNumber, otp, sessionId = null) {
    // Find OTP entry
    let otpEntry = null;
    let foundSessionId = sessionId;

    console.log('🔍 verifyOtp called with:', {
      mobileNumber,
      otp: '***',
      sessionId: sessionId ? 'provided' : 'NOT provided',
      storageSize: otpStorage.size
    });

    if (sessionId) {
      otpEntry = otpStorage.get(sessionId);
      console.log('📦 Looking up by sessionId:', sessionId.substring(0, 10) + '...', 'Found:', !!otpEntry);
    }

    // If sessionId not provided or not found, fallback to mobile number lookup
    if (!otpEntry) {
      console.log('🔄 Fallback: searching by mobile number...');
      for (const [sid, entry] of otpStorage.entries()) {
        if (entry.mobileNumber === mobileNumber) {
          otpEntry = entry;
          foundSessionId = sid;
          console.log('✅ Found OTP entry by mobile number');
          break;
        }
      }
    }

    if (!otpEntry) {
      console.error('❌ OTP session not found:', {
        mobileNumber,
        sessionIdProvided: !!sessionId,
        storageSize: otpStorage.size,
        storageKeys: Array.from(otpStorage.keys()).slice(0, 3).map(k => k.substring(0, 10) + '...')
      });
      return {
        verified: false,
        message: 'OTP session not found or expired'
      };
    }

    // Check expiry
    const age = Date.now() - otpEntry.timestamp;
    if (age > OTP_EXPIRY_MS) {
      console.warn('⏱️  OTP expired:', { age: age / 1000, expiryMs: OTP_EXPIRY_MS / 1000 });
      otpStorage.delete(foundSessionId);
      return {
        verified: false,
        message: 'OTP has expired. Please request a new one.'
      };
    }

    // Check attempts
    if (otpEntry.attempts >= otpEntry.maxAttempts) {
      console.warn('🚫 Too many attempts:', otpEntry.attempts);
      otpStorage.delete(foundSessionId);
      return {
        verified: false,
        message: 'Too many verification attempts. Please request a new OTP.'
      };
    }

    // Verify OTP
    if (otpEntry.mobileNumber !== mobileNumber) {
      otpEntry.attempts++;
      console.warn('❌ Mobile number mismatch:', {
        stored: otpEntry.mobileNumber,
        provided: mobileNumber
      });
      return {
        verified: false,
        message: 'Mobile number mismatch'
      };
    }

    if (otpEntry.otp !== otp) {
      otpEntry.attempts++;
      console.warn('❌ Invalid OTP:', {
        attempts: otpEntry.attempts,
        maxAttempts: otpEntry.maxAttempts
      });
      return {
        verified: false,
        message: 'Invalid OTP'
      };
    }

    // OTP verified successfully
    console.log('✅ OTP verified successfully - sessionId:', foundSessionId.substring(0, 10) + '...');
    return {
      verified: true,
      message: 'OTP verified successfully',
      sessionId: foundSessionId
    };
  }

  /**
   * Get recent OTP for mobile number
   * @param {string} mobileNumber - Mobile number
   * @returns {Object|null} OTP entry or null
   */
  async getRecentOtp(mobileNumber) {
    for (const [sid, entry] of otpStorage.entries()) {
      if (entry.mobileNumber === mobileNumber) {
        return {
          ...entry,
          sessionId: sid
        };
      }
    }
    return null;
  }

  /**
   * Delete OTP from storage
   * @param {string} sessionId - Session ID
   */
  async deleteOtp(sessionId) {
    otpStorage.delete(sessionId);
  }

  /**
   * Clean expired OTPs (cleanup function)
   */
  cleanup() {
    const now = Date.now();
    for (const [sid, entry] of otpStorage.entries()) {
      if (now - entry.timestamp > OTP_EXPIRY_MS) {
        otpStorage.delete(sid);
      }
    }
  }
}

// Run cleanup every 5 minutes
setInterval(() => {
  const service = new OtpService();
  service.cleanup();
}, 5 * 60 * 1000);

module.exports = new OtpService();
