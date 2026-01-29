const hygraphClient = require('../config/hygraph');
const hygraphService = require('./hygraphService');
const hygraphUserService = require('./hygraphUserService');

class OrderService {
  /**
   * Generate unique order number
   * Format: ORD-YYYYMMDD-XXXXX (random 5 digit)
   */
  generateOrderNumber() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(10000 + Math.random() * 90000);
    return `ORD-${dateStr}-${random}`;
  }

  /**
   * Validate order items and calculate total
   * @param {Array} items - Array of order items with productId, quantity, price, shopTokensPrice
   * @returns {Object} Validation result with totals
   */
  validateOrderItems(items) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return {
        valid: false,
        error: 'Order must contain at least one item'
      };
    }

    let totalAmount = 0;
    let totalShopTokens = 0;

    for (const item of items) {
      if (!item.productId) {
        return { valid: false, error: 'Each item must have a productId' };
      }
      if (!item.quantity || item.quantity < 1) {
        return { valid: false, error: 'Each item must have a valid quantity (minimum 1)' };
      }
      if (item.price === undefined || item.price < 0) {
        return { valid: false, error: 'Each item must have a valid price' };
      }

      // Calculate totals
      totalAmount += item.price * item.quantity;
      
      // Shop tokens are optional - some products may use only rupees
      if (item.shopTokensPrice && item.shopTokensPrice > 0) {
        totalShopTokens += item.shopTokensPrice * item.quantity;
      }
    }

    return {
      valid: true,
      totalAmount,
      totalShopTokens,
      itemCount: items.length
    };
  }

  /**
   * Check if user has sufficient shop tokens
   * @param {string} userId - User ID
   * @param {number} requiredTokens - Required shop tokens
   * @returns {Promise<Object>} Balance check result
   */
  async checkShopTokenBalance(userId, requiredTokens) {
    try {
      const user = await hygraphUserService.findUserById(userId);
      
      if (!user) {
        return {
          sufficient: false,
          error: 'User not found',
          currentBalance: 0,
          requiredTokens
        };
      }

      const currentBalance = user.shopTokens || 0;
      const sufficient = currentBalance >= requiredTokens;

      return {
        sufficient,
        currentBalance,
        requiredTokens,
        shortfall: sufficient ? 0 : requiredTokens - currentBalance
      };
    } catch (error) {
      console.error('❌ Error checking shop token balance:', error.message);
      throw error;
    }
  }

  /**
   * Deduct shop tokens from user's balance
   * @param {string} userId - User ID
   * @param {number} tokensToDeduct - Tokens to deduct
   * @param {string} orderId - Order ID for reference
   * @returns {Promise<Object>} Updated user with new balance
   */
  async deductShopTokens(userId, tokensToDeduct, orderId) {
    try {
      // First verify user has sufficient balance
      const balanceCheck = await this.checkShopTokenBalance(userId, tokensToDeduct);
      
      if (!balanceCheck.sufficient) {
        throw new Error(`Insufficient shop tokens. Required: ${tokensToDeduct}, Available: ${balanceCheck.currentBalance}`);
      }

      const newBalance = balanceCheck.currentBalance - tokensToDeduct;

      const updateMutation = `
        mutation DeductShopTokens($id: ID!, $shopTokens: Int!) {
          updateUserDetail(
            where: { id: $id }
            data: { shopTokens: $shopTokens }
          ) {
            id
            mobileNumber
            firstName
            lastName
            shopTokens
          }
        }
      `;

      const publishMutation = `
        mutation PublishUserDetail($id: ID!) {
          publishUserDetail(where: { id: $id }, to: PUBLISHED) {
            id
            shopTokens
          }
        }
      `;

      // Update shop tokens
      const updateResult = await hygraphClient.mutate(updateMutation, {
        id: userId,
        shopTokens: newBalance
      });

      if (!updateResult.updateUserDetail) {
        throw new Error('Failed to update shop tokens');
      }

      // Publish the changes
      await hygraphClient.mutate(publishMutation, { id: userId });

      console.log(`💰 Shop tokens deducted for order ${orderId}: ${tokensToDeduct} tokens (${balanceCheck.currentBalance} -> ${newBalance})`);

      return {
        success: true,
        previousBalance: balanceCheck.currentBalance,
        deducted: tokensToDeduct,
        newBalance: newBalance,
        user: updateResult.updateUserDetail
      };
    } catch (error) {
      console.error('❌ Error deducting shop tokens:', error.message);
      throw error;
    }
  }

  /**
   * Refund shop tokens to user's balance (for cancelled orders)
   * @param {string} userId - User ID
   * @param {number} tokensToRefund - Tokens to refund
   * @param {string} orderId - Order ID for reference
   * @returns {Promise<Object>} Updated user with new balance
   */
  async refundShopTokens(userId, tokensToRefund, orderId) {
    try {
      const user = await hygraphUserService.findUserById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      const currentBalance = user.shopTokens || 0;
      const newBalance = currentBalance + tokensToRefund;

      const updateMutation = `
        mutation RefundShopTokens($id: ID!, $shopTokens: Int!) {
          updateUserDetail(
            where: { id: $id }
            data: { shopTokens: $shopTokens }
          ) {
            id
            mobileNumber
            firstName
            lastName
            shopTokens
          }
        }
      `;

      const publishMutation = `
        mutation PublishUserDetail($id: ID!) {
          publishUserDetail(where: { id: $id }, to: PUBLISHED) {
            id
            shopTokens
          }
        }
      `;

      // Update shop tokens
      const updateResult = await hygraphClient.mutate(updateMutation, {
        id: userId,
        shopTokens: newBalance
      });

      if (!updateResult.updateUserDetail) {
        throw new Error('Failed to refund shop tokens');
      }

      // Publish the changes
      await hygraphClient.mutate(publishMutation, { id: userId });

      console.log(`💸 Shop tokens refunded for order ${orderId}: ${tokensToRefund} tokens (${currentBalance} -> ${newBalance})`);

      return {
        success: true,
        previousBalance: currentBalance,
        refunded: tokensToRefund,
        newBalance: newBalance,
        user: updateResult.updateUserDetail
      };
    } catch (error) {
      console.error('❌ Error refunding shop tokens:', error.message);
      throw error;
    }
  }

  /**
   * Create order with order items in Hygraph
   * @param {Object} orderData - Order data
   * @returns {Promise<Object>} Created order
   */
  async createOrderWithItems(orderData) {
    const {
      userId,
      items,
      shippingAddressId,
      shopTokensUsed = 0,
      rupeesAmount = 0,
      notes = ''
    } = orderData;

    const orderNumber = this.generateOrderNumber();
    const totalAmount = rupeesAmount; // Amount in rupees

    try {
      // Create the order first
      const createOrderMutation = `
        mutation CreateOrder(
          $userId: ID!,
          $orderNumber: String!,
          $totalAmount: Float!,
          $orderStatus: OrderStatus!,
          $shopTokensUsed: Int,
          $notes: String
          ${shippingAddressId ? ', $shippingAddressId: ID' : ''}
        ) {
          createOrder(
            data: {
              userDetail: {connect: {id: $userId}}
              orderNumber: $orderNumber
              totalAmount: $totalAmount
              orderStatus: $orderStatus
              shopTokensUsed: $shopTokensUsed
              notes: $notes
              ${shippingAddressId ? 'address: {connect: {id: $shippingAddressId}}' : ''}
            }
          ) {
            id
            orderNumber
            totalAmount
            orderStatus
            shopTokensUsed
            notes
          }
        }
      `;

      const orderVariables = {
        userId,
        orderNumber,
        totalAmount,
        orderStatus: 'pending',
        shopTokensUsed,
        notes
      };

      if (shippingAddressId) {
        orderVariables.shippingAddressId = shippingAddressId;
      }

      const orderResult = await hygraphService.execute(createOrderMutation, orderVariables);
      const orderId = orderResult.createOrder.id;

      // Publish the order
      await hygraphService.publishOrder(orderId);

      console.log(`📦 Order created: ${orderNumber} (ID: ${orderId})`);

      return {
        ...orderResult.createOrder,
        items
      };
    } catch (error) {
      console.error('❌ Error creating order:', error.message);
      throw error;
    }
  }

  /**
   * Place order - main method that handles the complete order flow
   * 1. Validates order items
   * 2. Checks shop token balance
   * 3. Deducts shop tokens
   * 4. Creates the order
   * @param {Object} orderData - Complete order data
   * @returns {Promise<Object>} Order result
   */
  async placeOrder(orderData) {
    const {
      userId,
      items,
      shippingAddressId,
      paymentMethod = 'shop_tokens', // 'shop_tokens', 'rupees', 'mixed'
      rupeesAmount = 0,
      notes = ''
    } = orderData;

    console.log(`🛒 Placing order for user: ${userId}`);

    // Step 1: Validate order items
    const validation = this.validateOrderItems(items);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    console.log(`✅ Order validation passed: ${validation.itemCount} items, Total: ₹${validation.totalAmount}, Shop Tokens: ${validation.totalShopTokens}`);

    // Step 2: Check if user has sufficient shop tokens
    let shopTokensToDeduct = 0;
    let tokensDeductionResult = null;

    if (validation.totalShopTokens > 0) {
      shopTokensToDeduct = validation.totalShopTokens;
      
      const balanceCheck = await this.checkShopTokenBalance(userId, shopTokensToDeduct);
      
      if (!balanceCheck.sufficient) {
        throw new Error(`Insufficient shop tokens. Required: ${shopTokensToDeduct}, Available: ${balanceCheck.currentBalance}, Shortfall: ${balanceCheck.shortfall}`);
      }

      console.log(`💰 Shop token balance check passed: ${balanceCheck.currentBalance} >= ${shopTokensToDeduct}`);
    }

    // Generate order number for tracking
    const orderNumber = this.generateOrderNumber();

    try {
      // Step 3: Deduct shop tokens BEFORE creating order (atomic operation)
      if (shopTokensToDeduct > 0) {
        tokensDeductionResult = await this.deductShopTokens(userId, shopTokensToDeduct, orderNumber);
        console.log(`💰 Shop tokens deducted: ${shopTokensToDeduct}`);
      }

      // Step 4: Create the order in Hygraph
      const order = await this.createOrderWithItems({
        userId,
        items,
        shippingAddressId,
        shopTokensUsed: shopTokensToDeduct,
        rupeesAmount: validation.totalAmount,
        notes
      });

      console.log(`✅ Order placed successfully: ${order.orderNumber}`);

      return {
        success: true,
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          shopTokensUsed: order.shopTokensUsed,
          orderStatus: order.orderStatus,
          items: items
        },
        shopTokens: tokensDeductionResult ? {
          previousBalance: tokensDeductionResult.previousBalance,
          deducted: tokensDeductionResult.deducted,
          newBalance: tokensDeductionResult.newBalance
        } : null,
        message: 'Order placed successfully'
      };

    } catch (error) {
      // If order creation fails after token deduction, refund the tokens
      if (tokensDeductionResult && tokensDeductionResult.success) {
        console.log(`⚠️ Order creation failed, refunding ${shopTokensToDeduct} shop tokens...`);
        try {
          await this.refundShopTokens(userId, shopTokensToDeduct, orderNumber);
          console.log(`✅ Shop tokens refunded successfully`);
        } catch (refundError) {
          console.error(`❌ CRITICAL: Failed to refund shop tokens: ${refundError.message}`);
          // Log this for manual intervention
          console.error(`MANUAL_REFUND_NEEDED: User ${userId}, Tokens: ${shopTokensToDeduct}, OrderNumber: ${orderNumber}`);
        }
      }

      throw error;
    }
  }

  /**
   * Cancel order and refund shop tokens
   * @param {string} orderId - Order ID
   * @param {string} userId - User ID (for authorization)
   * @param {string} reason - Cancellation reason
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelOrder(orderId, userId, reason = '') {
    try {
      // Get order details
      const orderQuery = `
        query GetOrder($orderId: ID!) {
          order(where: {id: $orderId}) {
            id
            orderNumber
            orderStatus
            shopTokensUsed
            userDetail {
              id
            }
          }
        }
      `;

      const orderResult = await hygraphService.execute(orderQuery, { orderId });
      const order = orderResult.order;

      if (!order) {
        throw new Error('Order not found');
      }

      // Verify user owns this order
      if (order.userDetail.id !== userId) {
        throw new Error('Unauthorized: You can only cancel your own orders');
      }

      // Check if order can be cancelled
      const nonCancellableStatuses = ['delivered', 'shipped', 'cancelled', 'refunded'];
      if (nonCancellableStatuses.includes(order.orderStatus)) {
        throw new Error(`Order cannot be cancelled. Current status: ${order.orderStatus}`);
      }

      // Update order status to cancelled
      await hygraphService.updateOrderStatus(orderId, 'cancelled');

      // Refund shop tokens if any were used
      let refundResult = null;
      if (order.shopTokensUsed && order.shopTokensUsed > 0) {
        refundResult = await this.refundShopTokens(userId, order.shopTokensUsed, order.orderNumber);
      }

      console.log(`❌ Order ${order.orderNumber} cancelled. Reason: ${reason || 'Not specified'}`);

      return {
        success: true,
        order: {
          id: orderId,
          orderNumber: order.orderNumber,
          previousStatus: order.orderStatus,
          newStatus: 'cancelled',
          reason
        },
        shopTokensRefund: refundResult ? {
          refunded: refundResult.refunded,
          newBalance: refundResult.newBalance
        } : null,
        message: 'Order cancelled successfully'
      };

    } catch (error) {
      console.error('❌ Error cancelling order:', error.message);
      throw error;
    }
  }

  /**
   * Get user's orders
   * @param {string} userId - User ID
   * @param {Object} options - Query options (limit, skip, status filter)
   * @returns {Promise<Array>} User's orders
   */
  async getUserOrders(userId, options = {}) {
    const { limit = 20, skip = 0, status = null } = options;

    try {
      let whereClause = `userDetail: {id: $userId}`;
      if (status) {
        whereClause += `, orderStatus: $status`;
      }

      const query = `
        query GetUserOrders($userId: ID!, $first: Int!, $skip: Int!${status ? ', $status: OrderStatus!' : ''}) {
          orders(
            where: {${whereClause}}
            first: $first
            skip: $skip
            orderBy: createdAt_DESC
          ) {
            id
            orderNumber
            totalAmount
            shopTokensUsed
            orderStatus
            notes
            createdAt
            updatedAt
          }
        }
      `;

      const variables = {
        userId,
        first: limit,
        skip
      };

      if (status) {
        variables.status = status;
      }

      const result = await hygraphService.execute(query, variables);
      return result.orders || [];

    } catch (error) {
      console.error('❌ Error fetching user orders:', error.message);
      throw error;
    }
  }

  /**
   * Get order details by ID
   * @param {string} orderId - Order ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} Order details
   */
  async getOrderById(orderId, userId) {
    try {
      const query = `
        query GetOrderById($orderId: ID!) {
          order(where: {id: $orderId}) {
            id
            orderNumber
            totalAmount
            shopTokensUsed
            orderStatus
            notes
            createdAt
            updatedAt
            userDetail {
              id
              firstName
              lastName
              mobileNumber
            }
            address {
              id
              addressLine1
              addressLine2
              city
              state
              pincode
              landmark
            }
          }
        }
      `;

      const result = await hygraphService.execute(query, { orderId });
      const order = result.order;

      if (!order) {
        throw new Error('Order not found');
      }

      // Verify user owns this order
      if (order.userDetail.id !== userId) {
        throw new Error('Unauthorized: You can only view your own orders');
      }

      return order;

    } catch (error) {
      console.error('❌ Error fetching order:', error.message);
      throw error;
    }
  }
}

module.exports = new OrderService();
