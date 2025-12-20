const axios = require('axios');

class HygraphService {
  constructor() {
    this.endpoint = process.env.HYGRAPH_ENDPOINT;
    this.token = process.env.HYGRAPH_TOKEN; // Optional - not needed for public endpoints
    
    if (!this.endpoint) {
      console.warn('⚠️  Hygraph endpoint not configured');
    }
  }

  /**
   * Execute GraphQL mutation/query
   * @param {string} mutation - GraphQL mutation/query string
   * @param {Object} variables - Variables for the mutation
   * @returns {Promise<Object>} Response data
   */
  async execute(mutation, variables = {}) {
    try {
      if (!this.endpoint) {
        throw new Error('Hygraph not configured. Set HYGRAPH_ENDPOINT in .env');
      }

      // Build headers - only include Authorization if token is provided
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await axios.post(
        this.endpoint,
        {
          query: mutation,
          variables
        },
        {
          headers,
          timeout: 10000
        }
      );

      if (response.data.errors) {
        console.error('Hygraph GraphQL Errors:', response.data.errors);
        throw new Error(response.data.errors[0].message || 'GraphQL error');
      }

      return response.data.data;
    } catch (error) {
      console.error('Hygraph Service Error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create Payment in Hygraph
   * @param {Object} paymentData - Payment data
   * @returns {Promise<Object>} Created payment
   */
  async createPayment(paymentData) {
    const {
      userId,
      razorpayOrderId,
      razorpayPaymentId = null,
      amount, // Amount in paise (will convert to rupees)
      currency = 'INR',
      paymentStatus = 'PENDING',
      method = null,
      orderId = null
    } = paymentData;

    // Convert amount from paise to rupees (Float)
    const amountInRupees = amount / 100;

    const createMutation = `
      mutation CreatePayment(
        $userId: ID!,
        $razorpayOrderId: String!,
        $razorpayPaymentId: String,
        $amount: Float!,
        $currency: String!,
        $paymentStatus: PaymentStatus!,
        $method: String,
        $orderId: ID
      ) {
        createPayment(
          data: {
            userDetail: {connect: {id: $userId}}
            razorpayOrderId: $razorpayOrderId
            razorpayPaymentId: $razorpayPaymentId
            amount: $amount
            currency: $currency
            paymentStatus: $paymentStatus
            method: $method
            order: {connect: {id: $orderId}}
          }
        ) {
          id
          razorpayOrderId
          razorpayPaymentId
          amount
          currency
          paymentStatus
          method
        }
      }
    `;

    const variables = {
      userId,
      razorpayOrderId,
      razorpayPaymentId,
      amount: amountInRupees,
      currency,
      paymentStatus,
      method,
      orderId
    };

    const result = await this.execute(createMutation, variables);
    
    if (result.createPayment && result.createPayment.id) {
      const paymentId = result.createPayment.id;
      // Publish the payment
      await this.publishPayment(paymentId);
    }

    return result.createPayment;
  }

  /**
   * Publish Payment
   * @param {string} paymentId - Payment ID
   */
  async publishPayment(paymentId) {
    const mutation = `
      mutation PublishPayment($paymentId: ID!) {
        publishPayment(where: {id: $paymentId}, to: PUBLISHED) {
          id
        }
      }
    `;

    await this.execute(mutation, { paymentId });
  }

  /**
   * Update Payment Status
   * @param {string} paymentId - Payment ID (Hygraph ID) or razorpayOrderId (String)
   * @param {string} paymentStatus - New payment status (PaymentStatus enum)
   * @param {Object} additionalData - Additional fields to update (optional)
   * @returns {Promise<Object>} Updated payment
   */
  async updatePaymentStatus(paymentIdOrRazorpayOrderId, paymentStatus, additionalData = {}) {
    // If it's a razorpayOrderId (starts with 'order_'), find the payment first
    let paymentId = paymentIdOrRazorpayOrderId;
    if (paymentIdOrRazorpayOrderId.startsWith('order_')) {
      const payment = await this.findPaymentByRazorpayOrderId(paymentIdOrRazorpayOrderId);
      if (!payment) {
        throw new Error(`Payment not found for Razorpay Order ID: ${paymentIdOrRazorpayOrderId}`);
      }
      paymentId = payment.id;
    }

    const mutation = `
      mutation UpdatePayment(
        $paymentId: ID!,
        $paymentStatus: PaymentStatus!,
        $razorpayPaymentId: String,
        $method: String
      ) {
        updatePayment(
          where: {id: $paymentId}
          data: {
            paymentStatus: $paymentStatus
            razorpayPaymentId: $razorpayPaymentId
            method: $method
          }
        ) {
          id
          paymentStatus
          razorpayPaymentId
          method
        }
      }
    `;

    const variables = {
      paymentId,
      paymentStatus,
      razorpayPaymentId: additionalData.razorpayPaymentId || null,
      method: additionalData.method || null
    };

    const result = await this.execute(mutation, variables);
    
    // Publish the updated payment
    if (result.updatePayment) {
      await this.publishPayment(paymentId);
    }

    return result.updatePayment;
  }

  /**
   * Map Razorpay payment status to Hygraph PaymentStatus enum
   * @param {string} razorpayStatus - Razorpay status (e.g., 'captured', 'authorized', 'failed')
   * @returns {string} Hygraph PaymentStatus enum value
   */
  mapRazorpayStatusToHygraph(razorpayStatus) {
    const statusMap = {
      'captured': 'COMPLETED',
      'authorized': 'PROCESSING',
      'failed': 'FAILED',
      'refunded': 'REFUNDED',
      'pending': 'PENDING',
      'cancelled': 'CANCELLED'
    };
    
    return statusMap[razorpayStatus?.toLowerCase()] || 'PENDING';
  }

  /**
   * Map Razorpay order status to Hygraph OrderStatus enum
   * @param {string} razorpayStatus - Razorpay order status
   * @returns {string} Hygraph OrderStatus enum value
   */
  mapRazorpayOrderStatusToHygraph(razorpayStatus) {
    // Razorpay orders typically don't have status, but we can infer from payment
    // This is mainly for when payment is successful
    return 'CONFIRMED'; // When payment is captured, order is confirmed
  }

  /**
   * Find Payment by Razorpay Order ID
   * @param {string} razorpayOrderId - Razorpay Order ID
   * @returns {Promise<Object|null>} Payment or null
   */
  async findPaymentByRazorpayOrderId(razorpayOrderId) {
    const query = `
      query FindPaymentByRazorpayOrderId($razorpayOrderId: String!) {
        payments(where: {razorpayOrderId: $razorpayOrderId}) {
          id
          razorpayOrderId
          razorpayPaymentId
          amount
          currency
          paymentStatus
          method
          userId
          orderId
        }
      }
    `;

    const result = await this.execute(query, { razorpayOrderId });
    return result.payments && result.payments.length > 0 ? result.payments[0] : null;
  }

  /**
   * Create Order in Hygraph
   * @param {Object} orderData - Order data
   * @returns {Promise<Object>} Created order
   */
  async createOrder(orderData) {
    const {
      userId,
      orderNumber, // Must be unique
      totalAmount, // Amount in paise (will convert to rupees)
      orderStatus = 'PENDING',
      shippingAddressId = null,
      razorpayOrderId = null // Store Razorpay order ID in notes or separate field
    } = orderData;

    // Convert amount from paise to rupees (Float)
    const amountInRupees = totalAmount / 100;

    const mutation = `
      mutation CreateOrder(
        $userId: ID!,
        $orderNumber: String!,
        $totalAmount: Float!,
        $orderStatus: OrderStatus!,
        $shippingAddressId: ID
      ) {
        createOrder(
          data: {
            userDetail: {connect: {id: $userId}}
            orderNumber: $orderNumber
            totalAmount: $totalAmount
            orderStatus: $orderStatus
            shippingAddress: {connect: {id: $shippingAddressId}}
          }
        ) {
          id
          orderNumber
          totalAmount
          orderStatus
        }
      }
    `;

    const variables = {
      userId,
      orderNumber,
      totalAmount: amountInRupees,
      orderStatus,
      shippingAddressId
    };

    const result = await this.execute(mutation, variables);
    const orderId = result.createOrder.id;

    // Publish the order
    await this.publishOrder(orderId);

    return result.createOrder;
  }

  /**
   * Publish Order
   * @param {string} orderId - Order ID
   */
  async publishOrder(orderId) {
    const mutation = `
      mutation PublishOrder($orderId: ID!) {
        publishOrder(where: {id: $orderId}, to: PUBLISHED) {
          id
        }
      }
    `;

    await this.execute(mutation, { orderId });
  }

  /**
   * Update Order Status
   * @param {string} orderId - Order ID
   * @param {string} orderStatus - New order status (OrderStatus enum)
   * @returns {Promise<Object>} Updated order
   */
  async updateOrderStatus(orderId, orderStatus) {
    const mutation = `
      mutation UpdateOrderStatus($orderId: ID!, $orderStatus: OrderStatus!) {
        updateOrder(
          where: {id: $orderId}
          data: {orderStatus: $orderStatus}
        ) {
          id
          orderStatus
        }
      }
    `;

    const result = await this.execute(mutation, { orderId, orderStatus });
    
    // Publish the updated order
    if (result.updateOrder) {
      await this.publishOrder(orderId);
    }

    return result.updateOrder;
  }

  /**
   * Find Order by Razorpay Order ID (via Payment relation)
   * @param {string} razorpayOrderId - Razorpay Order ID
   * @returns {Promise<Object|null>} Order or null
   */
  async findOrderByRazorpayOrderId(razorpayOrderId) {
    // First find payment with this razorpayOrderId
    const payment = await this.findPaymentByRazorpayOrderId(razorpayOrderId);
    
    if (!payment || !payment.orderId) {
      return null;
    }

    const query = `
      query FindOrder($orderId: ID!) {
        order(where: {id: $orderId}) {
          id
          orderNumber
          totalAmount
          orderStatus
        }
      }
    `;

    const result = await this.execute(query, { orderId: payment.orderId });
    return result.order;
  }

  /**
   * Link Payment to Order
   * @param {string} paymentId - Payment ID
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Updated payment
   */
  async linkPaymentToOrder(paymentId, orderId) {
    const mutation = `
      mutation LinkPaymentToOrder($paymentId: ID!, $orderId: ID!) {
        updatePayment(
          where: {id: $paymentId}
          data: {order: {connect: {id: $orderId}}}
        ) {
          id
          orderId
        }
      }
    `;

    const result = await this.execute(mutation, { paymentId, orderId });
    
    // Publish the updated payment
    if (result.updatePayment) {
      await this.publishPayment(paymentId);
    }

    return result.updatePayment;
  }
}

module.exports = new HygraphService();
