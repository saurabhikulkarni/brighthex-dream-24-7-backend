const express = require('express');
const orderService = require('../services/orderService');
const authMiddleware = require('../middlewares/auth');
const router = express.Router();

/**
 * POST /api/orders/place
 * Place a new order with shop tokens deduction
 * 
 * Request Body:
 * {
 *   "items": [
 *     {
 *       "productId": "product_hygraph_id",
 *       "productName": "Product Name",
 *       "quantity": 2,
 *       "price": 500,           // Price in rupees per item
 *       "shopTokensPrice": 100  // Shop tokens per item (optional)
 *     }
 *   ],
 *   "shippingAddressId": "address_hygraph_id",  // Optional
 *   "notes": "Special delivery instructions"     // Optional
 * }
 */
router.post('/place', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { items, shippingAddressId, notes } = req.body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Order items are required'
      });
    }

    console.log(`🛒 Order placement request from user: ${userId} (${req.user.firstName} ${req.user.lastName})`);
    console.log(`   Items: ${items.length}, Address: ${shippingAddressId || 'Not provided'}`);

    // Place the order
    const result = await orderService.placeOrder({
      userId,
      items,
      shippingAddressId,
      notes
    });

    console.log(`✅ Order placed: ${result.order.orderNumber}`);

    res.status(201).json({
      success: true,
      message: result.message,
      data: {
        order: result.order,
        shopTokens: result.shopTokens
      }
    });

  } catch (error) {
    console.error('❌ Error placing order:', error.message);

    // Handle specific error types
    if (error.message.includes('Insufficient shop tokens')) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient Balance',
        message: error.message
      });
    }

    if (error.message.includes('must have') || error.message.includes('must contain')) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message || 'Failed to place order'
    });
  }
});

/**
 * GET /api/orders
 * Get user's orders with optional filters
 * 
 * Query Parameters:
 * - limit: Number of orders to fetch (default: 20)
 * - skip: Number of orders to skip (default: 0)
 * - status: Filter by order status (pending, confirmed, processing, shipped, delivered, cancelled, refunded)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, skip = 0, status } = req.query;

    console.log(`📋 Fetching orders for user: ${userId}`);

    const orders = await orderService.getUserOrders(userId, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      status: status || null
    });

    res.status(200).json({
      success: true,
      data: {
        orders,
        count: orders.length,
        pagination: {
          limit: parseInt(limit),
          skip: parseInt(skip)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching orders:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message || 'Failed to fetch orders'
    });
  }
});

/**
 * GET /api/orders/:orderId
 * Get single order details by ID
 */
router.get('/:orderId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Order ID is required'
      });
    }

    console.log(`📦 Fetching order details: ${orderId} for user: ${userId}`);

    const order = await orderService.getOrderById(orderId, userId);

    res.status(200).json({
      success: true,
      data: {
        order
      }
    });

  } catch (error) {
    console.error('❌ Error fetching order:', error.message);

    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: error.message
      });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message || 'Failed to fetch order'
    });
  }
});

/**
 * POST /api/orders/:orderId/cancel
 * Cancel an order and refund shop tokens
 * 
 * Request Body:
 * {
 *   "reason": "Changed my mind"  // Optional
 * }
 */
router.post('/:orderId/cancel', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const { reason } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Order ID is required'
      });
    }

    console.log(`❌ Order cancellation request: ${orderId} by user: ${userId}`);

    const result = await orderService.cancelOrder(orderId, userId, reason);

    console.log(`✅ Order cancelled: ${result.order.orderNumber}`);

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        order: result.order,
        shopTokensRefund: result.shopTokensRefund
      }
    });

  } catch (error) {
    console.error('❌ Error cancelling order:', error.message);

    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: error.message
      });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: error.message
      });
    }

    if (error.message.includes('cannot be cancelled')) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message || 'Failed to cancel order'
    });
  }
});

/**
 * GET /api/orders/check-balance/:tokensRequired
 * Check if user has sufficient shop tokens for an order
 * 
 * Useful for frontend validation before placing order
 */
router.get('/check-balance/:tokensRequired', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const tokensRequired = parseInt(req.params.tokensRequired);

    if (isNaN(tokensRequired) || tokensRequired < 0) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Valid token amount is required'
      });
    }

    const balanceCheck = await orderService.checkShopTokenBalance(userId, tokensRequired);

    res.status(200).json({
      success: true,
      data: {
        sufficient: balanceCheck.sufficient,
        currentBalance: balanceCheck.currentBalance,
        requiredTokens: balanceCheck.requiredTokens,
        shortfall: balanceCheck.shortfall || 0
      }
    });

  } catch (error) {
    console.error('❌ Error checking balance:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message || 'Failed to check balance'
    });
  }
});

/**
 * POST /api/orders/validate
 * Validate order items before placing
 * 
 * Request Body:
 * {
 *   "items": [...]
 * }
 */
router.post('/validate', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Order items are required'
      });
    }

    // Validate items
    const validation = orderService.validateOrderItems(items);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error
      });
    }

    // Check shop token balance
    let balanceCheck = null;
    if (validation.totalShopTokens > 0) {
      balanceCheck = await orderService.checkShopTokenBalance(userId, validation.totalShopTokens);
    }

    res.status(200).json({
      success: true,
      data: {
        valid: true,
        itemCount: validation.itemCount,
        totalAmount: validation.totalAmount,
        totalShopTokens: validation.totalShopTokens,
        shopTokensBalance: balanceCheck ? {
          sufficient: balanceCheck.sufficient,
          currentBalance: balanceCheck.currentBalance,
          requiredTokens: balanceCheck.requiredTokens,
          shortfall: balanceCheck.shortfall || 0
        } : null
      }
    });

  } catch (error) {
    console.error('❌ Error validating order:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message || 'Failed to validate order'
    });
  }
});

module.exports = router;
