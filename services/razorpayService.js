const Razorpay = require('razorpay');
const crypto = require('crypto');

class RazorpayService {
  constructor() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      console.warn('⚠️  Razorpay credentials not found in environment variables');
      this.razorpay = null;
    } else {
      this.razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret
      });
    }
  }

  /**
   * Create Razorpay order
   * @param {Object} options - Order options
   * @returns {Promise<Object>} Razorpay order object
   */
  async createOrder(options) {
    try {
      if (!this.razorpay) {
        throw new Error('Razorpay not initialized. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
      }

      const orderOptions = {
        amount: options.amount, // Amount in paise
        currency: options.currency || 'INR',
        receipt: options.receipt || `receipt_${Date.now()}`,
        payment_capture: 1, // Auto capture
        notes: options.notes || {}
      };

      const order = await this.razorpay.orders.create(orderOptions);
      
      return {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
        created_at: order.created_at
      };
    } catch (error) {
      console.error('Razorpay Create Order Error:', error);
      throw new Error(error.description || 'Failed to create Razorpay order');
    }
  }

  /**
   * Verify payment signature
   * @param {string} orderId - Razorpay order ID
   * @param {string} paymentId - Razorpay payment ID
   * @param {string} signature - Payment signature from Razorpay
   * @returns {boolean} - True if signature is valid
   */
  verifySignature(orderId, paymentId, signature) {
    try {
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      
      if (!keySecret) {
        console.error('RAZORPAY_KEY_SECRET not configured');
        return false;
      }

      // Create signature string
      const text = `${orderId}|${paymentId}`;
      
      // Generate expected signature
      const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(text)
        .digest('hex');

      // Compare signatures (constant-time comparison to prevent timing attacks)
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('Razorpay Verify Signature Error:', error);
      return false;
    }
  }

  /**
   * Get payment details
   * @param {string} paymentId - Razorpay payment ID
   * @returns {Promise<Object>} Payment details
   */
  async getPayment(paymentId) {
    try {
      if (!this.razorpay) {
        throw new Error('Razorpay not initialized');
      }

      const payment = await this.razorpay.payments.fetch(paymentId);
      return payment;
    } catch (error) {
      console.error('Razorpay Get Payment Error:', error);
      throw new Error('Failed to fetch payment details');
    }
  }

  /**
   * Get Razorpay order details
   * @param {string} orderId - Razorpay order ID
   * @returns {Promise<Object>} Razorpay order object
   */
  async getOrder(orderId) {
    try {
      if (!this.razorpay) {
        throw new Error('Razorpay not initialized');
      }

      const order = await this.razorpay.orders.fetch(orderId);
      return order;
    } catch (error) {
      console.error('Razorpay Get Order Error:', error);
      throw new Error('Failed to fetch order details');
    }
  }

  /**
   * Refund payment
   * @param {string} paymentId - Razorpay payment ID
   * @param {number} amount - Refund amount in paise (optional, full refund if not provided)
   * @returns {Promise<Object>} Refund details
   */
  async refundPayment(paymentId, amount = null) {
    try {
      if (!this.razorpay) {
        throw new Error('Razorpay not initialized');
      }

      const refundOptions = {
        payment_id: paymentId
      };

      if (amount) {
        refundOptions.amount = amount;
      }

      const refund = await this.razorpay.payments.refund(paymentId, refundOptions);
      return refund;
    } catch (error) {
      console.error('Razorpay Refund Error:', error);
      throw new Error(error.description || 'Failed to process refund');
    }
  }
}

module.exports = new RazorpayService();
