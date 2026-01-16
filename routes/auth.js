const express = require('express');
const router = express.Router();
const msg91Service = require('../services/msg91Service');
const otpService = require('../services/otpService');
const User = require('../models/User');
const axios = require('axios');

// Rate limiting for OTP endpoints (stricter)
const otpLimiter = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per 15 minutes
  message: 'Too many OTP requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/auth/send-otp
 * Send OTP to mobile number
 */
router.post('/send-otp', otpLimiter, async (req, res) => {
  try {
    const { mobileNumber } = req.body;

    // Validation
    if (!mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required'
      });
    }

    // Validate mobile number format (Indian format)
    const phoneRegex = /^[6-9]\d{9}$/;
    const cleanNumber = mobileNumber.replace(/\D/g, ''); // Remove non-digits
    
    if (cleanNumber.length !== 10 || !phoneRegex.test(cleanNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number. Please enter a valid 10-digit Indian mobile number.'
      });
    }

    // Check if OTP was recently sent (prevent spam)
    const recentOtp = await otpService.getRecentOtp(cleanNumber);
    if (recentOtp) {
      const timeSinceLastOtp = Date.now() - recentOtp.timestamp;
      const cooldownPeriod = 30 * 1000; // 30 seconds
      
      if (timeSinceLastOtp < cooldownPeriod) {
        const remainingSeconds = Math.ceil((cooldownPeriod - timeSinceLastOtp) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${remainingSeconds} seconds before requesting another OTP`
        });
      }
    }

    // Generate OTP
    const otp = otpService.generateOtp();
    
    // Store OTP in session
    const sessionId = await otpService.storeOtp(cleanNumber, otp);

    // Send OTP via MSG91
    console.log(`Sending OTP to ${cleanNumber}`);
    const sendResult = await msg91Service.sendOtp(cleanNumber, otp);
    console.log('MSG91 Send Result:', JSON.stringify(sendResult, null, 2));

    if (sendResult.success) {
      res.json({
        success: true,
        message: 'OTP sent successfully',
        sessionId: sessionId,
        // Don't send OTP in response (security)
      });
    } else {
      // Remove stored OTP if sending failed
      await otpService.deleteOtp(sessionId);
      
      res.status(500).json({
        success: false,
        message: sendResult.message || 'Failed to send OTP. Please try again.'
      });
    }
  } catch (error) {
    console.error('Error in send-otp:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

/**
 * POST /api/auth/verify-otp
 * Verify OTP for mobile number and create/login user
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { mobileNumber, otp, sessionId, deviceId } = req.body;

    // Validation
    if (!mobileNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number and OTP are required'
      });
    }

    const cleanNumber = mobileNumber.replace(/\D/g, '');

    // Verify OTP
    const verificationResult = await otpService.verifyOtp(cleanNumber, otp, sessionId);

    if (!verificationResult.verified) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: verificationResult.message || 'Invalid or expired OTP'
      });
    }

    // OTP verified successfully - now create/fetch user
    let user = await User.findOne({ mobile: parseInt(cleanNumber) });
    let isNewUser = false;

    if (!user) {
      // Create new user
      isNewUser = true;
      user = new User({
        mobile: parseInt(cleanNumber),
        status: 'activated',
        lastLogin: new Date(),
        deviceId: deviceId || ''
      });
      await user.save();
      console.log(`New user created with ID: ${user._id}`);
    } else {
      // Update existing user
      user.lastLogin = new Date();
      if (deviceId) {
        user.deviceId = deviceId;
      }
      await user.save();
      console.log(`Existing user logged in: ${user._id}`);
    }

    // Generate JWT token using Jose (same as fantasy app)
    const crypto = await import('node:crypto');
    if (!globalThis.crypto) {
      globalThis.crypto = crypto.webcrypto;
    }

    const { SignJWT } = await import('jose');
    const secret = Buffer.from(process.env.SECRET_TOKEN || 'your-secret-key-here');
    const token = await new SignJWT({ _id: user._id.toString() })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(secret);

    // Update user with auth_key
    user.auth_key = token;
    await user.save();

    // Delete OTP from storage (one-time use)
    if (sessionId) {
      await otpService.deleteOtp(sessionId);
    }

    // Sync with fantasy app backend
    try {
      if (process.env.FANTASY_API_URL) {
        console.log(`Syncing user ${user._id} with fantasy app...`);
        const syncResponse = await axios.post(
          `${process.env.FANTASY_API_URL}/api/user/sync-user-from-shopping`,
          {
            userId: user._id.toString(),
            mobile: cleanNumber,
            auth_key: token,
            isNewUser: isNewUser
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.FANTASY_API_KEY || ''
            },
            timeout: 5000
          }
        );
        console.log('Fantasy app sync result:', syncResponse.data);
      }
    } catch (syncError) {
      // Log error but don't fail the request
      console.error('Failed to sync with fantasy app:', syncError.message);
    }

    res.json({
      success: true,
      verified: true,
      message: 'OTP verified successfully',
      user: {
        userId: user._id.toString(),
        mobile: user.mobile,
        auth_key: token,
        isNewUser: isNewUser,
        fullname: user.fullname || '',
        email: user.email || '',
        status: user.status
      }
    });

  } catch (error) {
    console.error('Error in verify-otp:', error);
    res.status(500).json({
      success: false,
      verified: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile (protected route)
 */
router.get('/me', require('../middlewares/auth'), async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        userId: req.user._id.toString(),
        mobile: req.user.mobile,
        fullname: req.user.fullname || '',
        email: req.user.email || '',
        status: req.user.status,
        image: req.user.image || '',
        createdAt: req.user.createdAt,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    console.error('Error in /me:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile'
    });
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile (protected route)
 */
router.put('/profile', require('../middlewares/auth'), async (req, res) => {
  try {
    const { fullname, email } = req.body;
    
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (fullname !== undefined) user.fullname = fullname;
    if (email !== undefined) user.email = email;

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        userId: user._id.toString(),
        mobile: user.mobile,
        fullname: user.fullname,
        email: user.email,
        status: user.status
      }
    });

  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

module.exports = router;
