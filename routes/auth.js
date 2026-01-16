const express = require('express');
const router = express.Router();
const msg91Service = require('../services/msg91Service');
const otpService = require('../services/otpService');
const hygraphUserService = require('../services/hygraphUserService');
const tokenBlacklistService = require('../services/tokenBlacklistService');
const axios = require('axios');

// Helper function to initialize crypto and get JWT tools
async function getJWTTools() {
  const crypto = await import('node:crypto');
  if (!globalThis.crypto) {
    globalThis.crypto = crypto.webcrypto;
  }
  const { SignJWT } = await import('jose');
  return { SignJWT };
}

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

    // OTP verified - create/fetch user from Hygraph
    let user = await hygraphUserService.findUserByMobile(cleanNumber);
    let isNewUser = false;

    if (!user) {
      // Create new user in Hygraph
      isNewUser = true;
      
      // Create user in Hygraph first to get ID
      const tempUser = await hygraphUserService.createUser({
        mobile: cleanNumber,
        status: 'activated',
        deviceId: deviceId || ''
      });
      
      user = tempUser;
      
      console.log(`New user created in Hygraph with ID: ${user.id}`);
    } else {
      console.log(`Existing user logged in from Hygraph: ${user.id}`);
    }

    // Sync with Fantasy backend to get fantasy_user_id
    let fantasyUserId = user.fantasy_user_id || null;
    try {
      if (process.env.FANTASY_API_URL && process.env.INTERNAL_API_SECRET) {
        console.log(`Syncing user ${user.id} with fantasy backend...`);
        const fantasyResponse = await axios.post(
          `${process.env.FANTASY_API_URL}/api/user/internal/sync-user`,
          {
            mobile: cleanNumber,
            hygraph_user_id: user.id,
            shop_enabled: true,
            fantasy_enabled: true
          },
          {
            headers: { 
              'X-Internal-Secret': process.env.INTERNAL_API_SECRET 
            },
            timeout: 5000
          }
        );
        
        // Update Hygraph user with fantasy_user_id
        if (fantasyResponse.data && fantasyResponse.data.success && fantasyResponse.data.user_id) {
          await hygraphUserService.updateUserById(user.id, { 
            fantasy_user_id: fantasyResponse.data.user_id 
          });
          fantasyUserId = fantasyResponse.data.user_id;
          console.log('Fantasy sync completed successfully');
        }
      }
    } catch (syncError) {
      console.error('Fantasy sync failed:', syncError.message);
      // Continue even if fantasy sync fails - user can still use shop
    }

    // Generate unified JWT token with module information
    const { SignJWT } = await getJWTTools();
    const secret = Buffer.from(process.env.SECRET_TOKEN || 'your-secret-key-here');
    
    // Generate short-lived access token (15 minutes)
    const accessToken = await new SignJWT({
      userId: user.id,
      _id: fantasyUserId || user.id, // For compatibility with fantasy backend
      mobile: cleanNumber,
      modules: ['shop', 'fantasy'],
      shop_enabled: true,
      fantasy_enabled: true
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')  // Short-lived for security
      .setIssuedAt()
      .sign(secret);
    
    // Generate long-lived refresh token (30 days)
    const refreshToken = await new SignJWT({
      userId: user.id,
      type: 'refresh',
      mobile: cleanNumber
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')  // Long-lived
      .setIssuedAt()
      .sign(secret);
    
    // Update user with both tokens and last login
    user = await hygraphUserService.updateUser(cleanNumber, {
      authKey: accessToken,
      refreshToken: refreshToken,
      deviceId: deviceId || '',
      lastLogin: new Date().toISOString()
    });
    
    user.authKey = accessToken;
    user.refreshToken = refreshToken;

    // Delete OTP from storage (one-time use)
    if (sessionId) {
      await otpService.deleteOtp(sessionId);
    }

    res.json({
      success: true,
      verified: true,
      message: 'Login successful',
      token: user.authKey,
      refreshToken: user.refreshToken,
      user: {
        id: user.id,
        fantasy_user_id: fantasyUserId,
        mobile: user.mobile,
        email: user.email || '',
        name: user.fullname || '',
        modules: ['shop', 'fantasy'],
        shop_enabled: true,
        fantasy_enabled: true,
        isNewUser: isNewUser
      }
    });

  } catch (error) {
    console.error('Error in verify-otp:', error);
    res.status(500).json({
      success: false,
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
        userId: req.user.id,
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
    
    const updateData = {};
    if (fullname !== undefined) updateData.fullname = fullname;
    if (email !== undefined) updateData.email = email;

    const user = await hygraphUserService.updateUser(req.user.mobile, updateData);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        userId: user.id,
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

/**
 * POST /api/auth/logout
 * Unified logout - invalidates token across both Shop and Fantasy backends
 */
router.post('/logout', require('../middlewares/auth'), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.split(' ')[1];
    const user = req.user;
    
    // 1. Blacklist token in shop backend
    await tokenBlacklistService.addToBlacklist(token);
    
    // 2. Clear both tokens in Hygraph
    await hygraphUserService.updateUser(user.mobile, {
      authKey: '',
      refreshToken: ''
    });
    
    // 3. Invalidate in fantasy backend
    const fantasyUserId = user.fantasy_user_id || null;
    if (fantasyUserId && process.env.FANTASY_API_URL && process.env.INTERNAL_API_SECRET) {
      try {
        await axios.post(
          `${process.env.FANTASY_API_URL}/api/user/internal/logout`,
          { 
            user_id: fantasyUserId, 
            token: token 
          },
          { 
            headers: { 'X-Internal-Secret': process.env.INTERNAL_API_SECRET },
            timeout: 5000
          }
        );
      } catch (error) {
        console.error('Fantasy logout failed:', error.message);
        // Continue even if fantasy logout fails
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Successfully logged out from all modules' 
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Logout failed. Please try again.' 
    });
  }
});

/**
 * POST /api/auth/validate-token
 * Validate JWT token and return token status
 */
router.post('/validate-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Token is required'
      });
    }
    
    // Verify JWT token
    const crypto = await import('node:crypto');
    if (!globalThis.crypto) {
      globalThis.crypto = crypto.webcrypto;
    }

    const { jwtVerify } = await import('jose');
    const secret = Buffer.from(process.env.SECRET_TOKEN || 'your-secret-key-here');
    
    try {
      const { payload } = await jwtVerify(token, secret);
      
      // Check if token is blacklisted
      if (await tokenBlacklistService.isBlacklisted(token)) {
        return res.json({
          success: true,
          valid: false,
          message: 'Token has been revoked'
        });
      }
      
      // Get user from Hygraph
      const user = await hygraphUserService.findUserById(payload.userId);
      
      if (!user) {
        return res.json({
          success: true,
          valid: false,
          message: 'User not found'
        });
      }
      
      if (user.status === 'blocked') {
        return res.json({
          success: true,
          valid: false,
          message: 'User is blocked'
        });
      }
      
      // Token is valid
      return res.json({
        success: true,
        valid: true,
        message: 'Token is valid',
        user: {
          id: user.id,
          fantasy_user_id: payload._id,
          mobile: user.mobile,
          email: user.email || '',
          name: user.fullname || '',
          modules: payload.modules || ['shop', 'fantasy'],
          shop_enabled: payload.shop_enabled !== false,
          fantasy_enabled: payload.fantasy_enabled !== false,
          expiresAt: new Date(payload.exp * 1000).toISOString()
        }
      });
    } catch (jwtError) {
      console.error('JWT Validation Error:', jwtError.message);
      return res.json({
        success: true,
        valid: false,
        message: 'Invalid or expired token',
        error: jwtError.message
      });
    }
  } catch (error) {
    console.error('Error in validate-token:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/auth/refresh-token
 * Generate new access token using refresh token
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }
    
    // Verify refresh token
    const crypto = await import('node:crypto');
    if (!globalThis.crypto) {
      globalThis.crypto = crypto.webcrypto;
    }

    const { jwtVerify } = await import('jose');
    const { SignJWT } = await getJWTTools();
    const secret = Buffer.from(process.env.SECRET_TOKEN || 'your-secret-key-here');
    
    try {
      const { payload } = await jwtVerify(refreshToken, secret);
      
      // Ensure it's a refresh token
      if (payload.type !== 'refresh') {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token type'
        });
      }
      
      // Get user from Hygraph
      const user = await hygraphUserService.findUserById(payload.userId);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }
      
      if (user.status === 'blocked') {
        return res.status(401).json({
          success: false,
          message: 'User is blocked'
        });
      }
      
      // Verify stored refresh token matches
      if (user.refreshToken !== refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token has been revoked. Please login again.'
        });
      }
      
      // Generate new access token
      const newAccessToken = await new SignJWT({
        userId: user.id,
        _id: user.fantasy_user_id,
        mobile: user.mobile,
        modules: ['shop', 'fantasy'],
        shop_enabled: true,
        fantasy_enabled: true
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('15m')
        .setIssuedAt()
        .sign(secret);
      
      // Update user's access token
      await hygraphUserService.updateUser(user.mobile, {
        authKey: newAccessToken
      });
      
      res.json({
        success: true,
        message: 'Token refreshed successfully',
        token: newAccessToken,
        user: {
          id: user.id,
          fantasy_user_id: user.fantasy_user_id,
          mobile: user.mobile,
          email: user.email || '',
          name: user.fullname || '',
          modules: ['shop', 'fantasy'],
          shop_enabled: true,
          fantasy_enabled: true
        }
      });
    } catch (jwtError) {
      console.error('Refresh Token Error:', jwtError.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token. Please login again.',
        error: jwtError.message
      });
    }
  } catch (error) {
    console.error('Error in refresh-token:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
