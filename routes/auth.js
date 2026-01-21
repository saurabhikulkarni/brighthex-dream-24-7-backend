const express = require('express');
const router = express.Router();
const msg91Service = require('../services/msg91Service');
const otpService = require('../services/otpService');
const hygraphUserService = require('../services/hygraphUserService');
const tokenBlacklistService = require('../services/tokenBlacklistService');
const axios = require('axios');
const crypto = require('crypto');

// Helper function to initialize crypto and get JWT tools
async function getJWTTools() {
  const crypto = await import('node:crypto');
  if (!globalThis.crypto) {
    globalThis.crypto = crypto.webcrypto;
  }
  const { SignJWT } = await import('jose');
  return { SignJWT };
}

// Helper function to initialize crypto and get JWT verify tools
async function getJWTVerifyTools() {
  const crypto = await import('node:crypto');
  if (!globalThis.crypto) {
    globalThis.crypto = crypto.webcrypto;
  }
  const { jwtVerify } = await import('jose');
  const secret = Buffer.from(process.env.SECRET_TOKEN || 'your-secret-key-here');
  return { jwtVerify, secret };
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

    // Debug logging
    console.log('📞 Raw mobile number received:', mobileNumber, 'Type:', typeof mobileNumber);
    
    // Validate mobile number format (Indian format)
    const phoneRegex = /^[6-9]\d{9}$/;
    const cleanNumber = mobileNumber.replace(/\D/g, '').trim(); // Remove non-digits and whitespace
    
    console.log('📞 Clean mobile number:', cleanNumber, 'Length:', cleanNumber.length);
    console.log('📞 Regex test result:', phoneRegex.test(cleanNumber));
    
    if (cleanNumber.length !== 10 || !phoneRegex.test(cleanNumber)) {
      console.error('❌ Mobile number validation failed:', {
        original: mobileNumber,
        clean: cleanNumber,
        length: cleanNumber.length,
        startsWithValidDigit: /^[6-9]/.test(cleanNumber)
      });
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

    // OTP verified - fetch user from Hygraph first
    console.log(`🔍 Looking up user in Hygraph for mobile: ${cleanNumber}`);
    let user = await hygraphUserService.findUserByMobile(cleanNumber);
    let isNewUser = false;

    if (user && user.id) {
      // EXISTING USER - Just login, no creation needed
      console.log(`✅ Existing user found - logging in: ${user.id}`);
      isNewUser = false;
    } else {
      // NEW USER - Create in Hygraph
      console.log(`📝 No existing user found - creating new user for: ${cleanNumber}`);
      isNewUser = true;
      
      try {
        // Create user in Hygraph first to get ID
        const tempUser = await hygraphUserService.createUser({
          mobile: cleanNumber,
          firstName: req.body.firstName || 'User',
          lastName: req.body.lastName || '',
          modules: ['shop'],
          shopEnabled: true,
          fantasyEnabled: false
        });
        
        user = tempUser;
        
        if (!user || !user.id) {
          console.error('❌ Failed to create user in Hygraph - no ID returned');
          return res.status(500).json({
            success: false,
            message: 'Failed to create user account in database. Please try again.'
          });
        }
        
        console.log(`✅ New user created in Hygraph with ID: ${user.id}`);
      } catch (hygraphError) {
        console.error('❌ Hygraph user creation error:', {
          message: hygraphError.message,
          mobile: cleanNumber,
          firstName: req.body.firstName
        });
        return res.status(500).json({
          success: false,
          message: `Failed to create user: ${hygraphError.message}`
        });
      }
    }

    // Login/Sync with Fantasy backend to get fantasyUserId and tokens
    // Using /user/direct-add-user endpoint for better Shop compatibility
    let fantasyUserId = user.fantasyUserId || null;
    let fantasyAuthKey = null;
    let fantasyLoginError = null;
    try {
      if (process.env.FANTASY_API_URL) {
        // Validate FANTASY_API_URL is not localhost in production
        if (process.env.NODE_ENV === 'production' && process.env.FANTASY_API_URL.includes('localhost')) {
          console.error('❌ FANTASY_API_URL is set to localhost in production! Fantasy sync will fail.');
          fantasyLoginError = 'Fantasy backend URL misconfigured';
        } else {
          console.log(`Syncing user ${user.id} to fantasy backend at: ${process.env.FANTASY_API_URL}/user/direct-add-user`);
          
          // Generate Shop JWT token to pass to Fantasy
          const { SignJWT } = await getJWTTools();
          const secret = Buffer.from(process.env.SECRET_TOKEN || 'your-secret-key-here');
          const shopToken = await new SignJWT({
            userId: user.id,
            mobile: cleanNumber,
            modules: ['shop', 'fantasy'],
            shop_enabled: true,
            fantasy_enabled: true
          })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('30d')
            .setIssuedAt()
            .sign(secret);
          
          const fantasyResponse = await axios.post(
            `${process.env.FANTASY_API_URL}/user/direct-add-user`,
            {
              mobile: cleanNumber,
              appid: 'shop-app',
              token: shopToken,  // Pass Shop JWT token
              hygraph_user_id: user.id,
              name: `${user.firstName || req.body.firstName || 'User'} ${user.lastName || req.body.lastName || ''}`.trim(),
              username: user.username || `${user.firstName || 'User'}${user.lastName || ''}`.replace(/\s/g, '')
            },
            {
              headers: { 
                'Content-Type': 'application/json'
              },
              timeout: 10000
            }
          );
          
          console.log('Fantasy direct-add-user response:', JSON.stringify(fantasyResponse.data, null, 2));
          
          // Extract Fantasy tokens and user_id from response
          // Response format: { success: true, message: "...", data: { token, auth_key, userid, mobile, type } }
          if (fantasyResponse.data?.success === true && fantasyResponse.data?.data) {
            const fantasyData = fantasyResponse.data.data;
            
            // Get user_id from response
            fantasyUserId = fantasyData.userid || fantasyData.user_id || fantasyData.userId || fantasyData._id;
            
            // Get Fantasy JWT token - auth_key is primary
            fantasyAuthKey = fantasyData.auth_key || fantasyData.token;
            
            if (fantasyUserId) {
              // Update Hygraph user with fantasy_user_id
              await hygraphUserService.updateUserById(user.id, { 
                fantasy_user_id: fantasyUserId.toString()
              });
              console.log(`✅ Fantasy user sync completed - fantasy_user_id: ${fantasyUserId}, auth_key: ${fantasyAuthKey?.substring(0, 20)}...`);
            } else {
              console.warn('⚠️ Fantasy response missing userid:', fantasyResponse.data);
              fantasyLoginError = 'Fantasy response missing userid';
            }
            
            if (!fantasyAuthKey) {
              console.warn('⚠️ Fantasy response missing auth_key/token - Fantasy app may not work');
              fantasyLoginError = fantasyLoginError || 'Fantasy response missing auth_key';
            }
          } else {
            // Handle error response from Fantasy
            console.warn('⚠️ Fantasy direct-add-user failed:', fantasyResponse.data);
            fantasyLoginError = fantasyResponse.data?.message || 'Fantasy user registration failed';
          }
        }
      } else {
        console.warn('⚠️ Fantasy sync skipped - FANTASY_API_URL not configured');
        fantasyLoginError = 'FANTASY_API_URL not configured';
      }
    } catch (syncError) {
      console.error('❌ Fantasy sync failed:', {
        message: syncError.message,
        response: syncError.response?.data,
        status: syncError.response?.status,
        url: process.env.FANTASY_API_URL
      });
      fantasyLoginError = syncError.response?.data?.message || syncError.message || 'Fantasy backend unavailable';
      // Continue even if fantasy sync fails - user can still use shop
    }

    // Generate unified JWT token with module information
    const { SignJWT } = await getJWTTools();
    const secret = Buffer.from(process.env.SECRET_TOKEN || 'your-secret-key-here');
    
    // Generate long-lived access token (30 days)
    const accessToken = await new SignJWT({
      userId: user.id,
      _id: fantasyUserId || user.id, // For compatibility with fantasy backend
      mobile: cleanNumber,
      modules: ['shop', 'fantasy'],
      shop_enabled: true,
      fantasy_enabled: true
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')  // Long-lived token
      .setIssuedAt()
      .sign(secret);
    
    // Update user with fantasy_user_id
    user = await hygraphUserService.updateUser(cleanNumber, {
      fantasy_user_id: fantasyUserId
    });
    
    user.authKey = accessToken;

    // Fetch latest user data with shopTokens from Hygraph
    const userWithTokens = await hygraphUserService.findUserById(user.id);
    const shopTokens = userWithTokens?.shopTokens || 0;
    
    console.log(`✅ User login successful - hygraph_user_id: ${user.id}, shopTokens: ${shopTokens}`);

    // Delete OTP from storage (one-time use)
    if (sessionId) {
      await otpService.deleteOtp(sessionId);
    }

    res.json({
      success: true,
      verified: true,
      message: 'Login successful',
      userId: user.id,
      authToken: user.authKey,
      // Fantasy token for Fantasy app authentication
      fantasy_auth_key: fantasyAuthKey,
      // Fantasy sync status - helps frontend know if Fantasy features will work
      fantasy_sync_status: fantasyAuthKey ? 'success' : 'failed',
      fantasy_sync_error: fantasyLoginError,
      user: {
        userId: user.id,
        hygraph_user_id: user.id,
        fantasy_user_id: fantasyUserId,
        mobileNumber: user.mobileNumber,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        modules: user.modules || ['shop', 'fantasy'],
        shop_enabled: true,
        fantasy_enabled: !!fantasyAuthKey, // Only true if Fantasy auth succeeded
        shopTokens: shopTokens,
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
    
    // 1. Blacklist access token in shop backend
    await tokenBlacklistService.addToBlacklist(token);
    
    // 2. Clear auth token in Hygraph
    await hygraphUserService.updateUser(user.mobile, {
      authKey: ''
    });
    
    // 3. Invalidate in fantasy backend
    const fantasyUserId = user.fantasyUserId || null;
    if (fantasyUserId && process.env.FANTASY_API_URL && process.env.INTERNAL_API_SECRET) {
      try {
        await axios.post(
          `${process.env.FANTASY_API_URL}/user/internal/logout`,
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
    const { jwtVerify, secret } = await getJWTVerifyTools();
    
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
      
      // Token is valid - include current shopTokens balance
      const shopTokens = user.shopTokens || 0;
      console.log(`📱 Token validated for user: ${user.id}, shopTokens: ${shopTokens}`);
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
          shopTokens: shopTokens,
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

module.exports = router;
