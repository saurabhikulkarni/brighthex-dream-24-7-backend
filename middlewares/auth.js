const hygraphUserService = require('../services/hygraphUserService');
const tokenBlacklistService = require('../services/tokenBlacklistService');

/**
 * JWT Authentication Middleware
 * Verifies JWT token using Jose library (same as fantasy app)
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Authorization header required.'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format'
      });
    }

    // Verify JWT token using Jose (same as fantasy app)
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
        return res.status(401).json({ 
          success: false, 
          message: 'Token has been revoked' 
        });
      }
      
      // Check shop module access
      if (payload.modules && !payload.modules.includes('shop')) {
        return res.status(403).json({ 
          success: false, 
          message: 'Shop module not enabled for this account' 
        });
      }
      
      if (payload.shop_enabled === false) {
        return res.status(403).json({ 
          success: false, 
          message: 'Shop access disabled' 
        });
      }
      
      // Find user by ID from Hygraph
      const user = await hygraphUserService.findUserById(payload.userId);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user is blocked
      if (user.status === 'blocked') {
        return res.status(403).json({
          success: false,
          message: 'Account is blocked. Please contact support.'
        });
      }

      // Attach user to request object
      req.user = user;
      req.userId = user.id;
      
      next();
    } catch (jwtError) {
      console.error('JWT Verification Error:', jwtError.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

module.exports = authMiddleware;
