const { executeGraphQL } = require('../config/graphql');

/**
 * Order Service - Manages order operations with Hygraph
 */
class OrderService {
  /**
   * Create a new order
   * @param {object} orderData - Order details
   * @returns {Promise<object>} Created order with ID
   */
  async createOrder({
    userId,
    orderNumber,
    totalAmount,
    status = 'PENDING',
    items = [],
    addressId = null,
    paymentId = null
  }) {
    const mutation = `
      mutation CreateOrder(
        $userId: ID!
        $orderNumber: String!
        $totalAmount: Int!
        $status: OrderStatus!
        $addressId: ID
        $paymentId: ID
      ) {
        createOrder(
          data: {
            order-number: $orderNumber
            total-amount: $totalAmount
            status: $status
            userDetail: { connect: { id: $userId } }
            address: { connect: { id: $addressId } }
            Payments: { connect: { id: $paymentId } }
          }
        ) {
          id
          order-number
          total-amount
          status
          createdAt
        }
      }
    `;

    const variables = {
      userId,
      orderNumber,
      totalAmount,
      status,
      addressId,
      paymentId
    };

    return await executeGraphQL(mutation, variables);
  }

  /**
   * Get order by ID
   * @param {string} orderId - Order ID
   * @returns {Promise<object>} Order details
   */
  async getOrderById(orderId) {
    const query = `
      query GetOrder($id: ID!) {
        order(where: { id: $id }) {
          id
          order-number
          total-amount
          status
          tracking-number
          courierName
          shiprocketOrderId
          createdAt
          updatedAt
          userDetail {
            id
            first-name
            last-name
            mobile-number
          }
          address {
            id
            fullName
            phoneNumber
            addressLine1
            addressLine2
            city
            state
            pincode
            country
          }
          Payments {
            id
            razorpayPaymentId
            amount
            paymentStatus
          }
        }
      }
    `;

    const result = await executeGraphQL(query, { id: orderId });
    return result.order;
  }

  /**
   * Get all orders for a user
   * @param {string} userId - User ID
   * @param {object} options - Pagination options
   * @returns {Promise<array>} List of orders
   */
  async getUserOrders(userId, { skip = 0, limit = 50 } = {}) {
    const query = `
      query GetUserOrders($userId: ID!, $skip: Int!, $limit: Int!) {
        orders(
          where: { userDetail: { id: $userId } }
          orderBy: createdAt_DESC
          skip: $skip
          first: $limit
        ) {
          id
          order-number
          total-amount
          status
          tracking-number
          courierName
          shiprocketOrderId
          createdAt
          updatedAt
        }
      }
    `;

    const result = await executeGraphQL(query, {
      userId,
      skip,
      limit
    });

    return result.orders || [];
  }

  /**
   * Update order status (called from webhook)
   * @param {string} orderId - Order ID
   * @param {string} status - New status
   * @param {object} shipmentData - Additional shipment data
   * @returns {Promise<object>} Updated order
   */
  async updateOrderStatus(orderId, status, shipmentData = {}) {
    const mutation = `
      mutation UpdateOrderStatus(
        $id: ID!
        $status: OrderStatus!
        $trackingNumber: String
        $courierName: String
        $shiprocketOrderId: String
      ) {
        updateOrder(
          where: { id: $id }
          data: {
            status: $status
            tracking-number: $trackingNumber
            courierName: $courierName
            shiprocketOrderId: $shiprocketOrderId
          }
        ) {
          id
          order-number
          status
          tracking-number
          courierName
        }
      }
    `;

    const variables = {
      id: orderId,
      status,
      trackingNumber: shipmentData.trackingNumber || null,
      courierName: shipmentData.courierName || null,
      shiprocketOrderId: shipmentData.shiprocketOrderId || null
    };

    const result = await executeGraphQL(mutation, variables);
    return result.updateOrder;
  }

  /**
   * Get orders by status
   * @param {string} status - Order status
   * @returns {Promise<array>} Orders with that status
   */
  async getOrdersByStatus(status) {
    const query = `
      query GetOrdersByStatus($status: OrderStatus!) {
        orders(
          where: { status: $status }
          orderBy: createdAt_DESC
        ) {
          id
          order-number
          total-amount
          status
          tracking-number
          createdAt
          userDetail {
            id
            first-name
            last-name
          }
        }
      }
    `;

    const result = await executeGraphQL(query, { status });
    return result.orders || [];
  }

  /**
   * Cancel order
   * @param {string} orderId - Order ID
   * @returns {Promise<object>} Cancelled order
   */
  async cancelOrder(orderId) {
    return this.updateOrderStatus(orderId, 'CANCELLED');
  }

  /**
   * Get order count for user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of orders
   */
  async getUserOrderCount(userId) {
    const query = `
      query GetOrderCount($userId: ID!) {
        ordersConnection(where: { userDetail: { id: $userId } }) {
          aggregate {
            count
          }
        }
      }
    `;

    const result = await executeGraphQL(query, { userId });
    return result.ordersConnection?.aggregate?.count || 0;
  }
}

module.exports = new OrderService();
