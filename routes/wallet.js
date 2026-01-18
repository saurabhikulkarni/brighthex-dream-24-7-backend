const express = require('express');
const hygraphService = require('../services/hygraphUserService');
const authMiddleware = require('../middlewares/auth');
const router = express.Router();

// GET /api/wallet/shop-tokens-only
// Returns only the shopTokens balance for quick display in app header
// Used by: Shop app header for quick display
router.get('/shop-tokens-only', authMiddleware, async (req, res) => {
  try {
    // User is already authenticated via authMiddleware
    // req.user contains the user object from Hygraph
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }

    const shopTokens = req.user.shopTokens || 0;

    console.log(`📱 Fetching shopTokens for user: ${req.user.id} (${req.user.firstName} ${req.user.lastName}) -> ${shopTokens}`);

    res.status(200).json({
      success: true,
      data: {
        shopTokens: shopTokens,
        user_id: req.user.id,
        user_name: `${req.user.firstName} ${req.user.lastName}`
      }
    });

  } catch (error) {
    console.error('❌ Error in shop-tokens-only:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// POST /api/wallet/receive-shop-tokens-from-fantasy
// Receives shop tokens from Fantasy app wallet topup
router.post('/receive-shop-tokens-from-fantasy', async (req, res) => {
  try {
    // Verify internal secret header
    const internalSecret = req.headers['x-internal-secret'];
    const expectedSecret = process.env.INTERNAL_SECRET || process.env.FANTASY_INTERNAL_SECRET;

    if (!internalSecret || internalSecret !== expectedSecret) {
      console.warn('❌ Unauthorized wallet token request: Invalid or missing x-internal-secret header');
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Invalid or missing x-internal-secret header'
      });
    }

    // Validate required fields
    const { hygraph_user_id, shop_tokens, transaction_id, timestamp } = req.body;

    if (!hygraph_user_id) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing required field: hygraph_user_id'
      });
    }

    if (shop_tokens === undefined || shop_tokens === null) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing required field: shop_tokens'
      });
    }

    if (typeof shop_tokens !== 'number' || shop_tokens < 0) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid shop_tokens: must be a non-negative number'
      });
    }

    if (!transaction_id) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing required field: transaction_id'
      });
    }

    // Find user in Hygraph
    console.log(`🔍 Looking up user with hygraph_user_id: ${hygraph_user_id}`);
    const user = await hygraphService.findUserById(hygraph_user_id);

    if (!user) {
      console.warn(`❌ User not found: ${hygraph_user_id}`);
      return res.status(400).json({
        success: false,
        error: 'Not Found',
        message: `User not found with id: ${hygraph_user_id}`
      });
    }

    console.log(`✅ User found: ${user.id} (${user.firstName} ${user.lastName})`);

    // Update shopTokens in Hygraph
    // Since updateUserById expects specific fields, we'll need to use a custom mutation
    const updateMutation = `
      mutation UpdateShopTokens($id: ID!, $shopTokens: Int!) {
        updateUserDetail(
          where: { id: $id }
          data: { shopTokens: $shopTokens }
        ) {
          id
          mobileNumber
          firstName
          lastName
          shopTokens
          fantasyUserId
          shopEnabled
        }
      }
    `;

    const hygraphClient = require('../config/hygraph');
    
    // Calculate new shop tokens amount
    const currentShopTokens = user.shopTokens || 0;
    const newShopTokens = currentShopTokens + shop_tokens;

    console.log(`💰 Updating shopTokens: ${currentShopTokens} + ${shop_tokens} = ${newShopTokens}`);

    let maxRetries = 3;
    let retryCount = 0;
    let updateSuccess = false;
    let updatedUser = null;

    while (retryCount < maxRetries && !updateSuccess) {
      try {
        updatedUser = await hygraphClient.mutate(updateMutation, {
          id: hygraph_user_id,
          shopTokens: newShopTokens
        });
        
        if (updatedUser && updatedUser.updateUserDetail) {
          updateSuccess = true;
          console.log(`✅ shopTokens updated successfully: ${updatedUser.updateUserDetail.shopTokens}`);
        }
      } catch (error) {
        retryCount++;
        console.warn(`⚠️  Hygraph update attempt ${retryCount} failed:`, error.message);
        
        if (retryCount < maxRetries) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    }

    if (!updateSuccess) {
      console.error(`❌ Failed to update shopTokens after ${maxRetries} attempts`);
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to update shop tokens in database after multiple attempts'
      });
    }

    // Log transaction (in-memory for now, could be extended to Hygraph)
    const transactionLog = {
      transaction_id,
      hygraph_user_id,
      user_name: `${user.firstName} ${user.lastName}`,
      shop_tokens_added: shop_tokens,
      new_total: newShopTokens,
      previous_total: currentShopTokens,
      timestamp: timestamp || new Date().toISOString(),
      status: 'completed',
      source: 'fantasy_wallet_topup'
    };

    console.log('📝 Transaction logged:', transactionLog);

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Shop tokens updated successfully',
      data: {
        transaction_id,
        user_id: hygraph_user_id,
        user_name: `${updatedUser.updateUserDetail.firstName} ${updatedUser.updateUserDetail.lastName}`,
        shop_tokens_added: shop_tokens,
        updated_total: updatedUser.updateUserDetail.shopTokens,
        updated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error in receive-shop-tokens-from-fantasy:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

module.exports = router;
