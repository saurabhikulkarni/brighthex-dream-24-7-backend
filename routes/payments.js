const express = require('express');
const router = express.Router();
const razorpayService = require('../services/razorpayService');

/**
 * POST /api/payments/create-order
 * Create Razorpay order
 */
router.post('/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    // Convert amount to paise (Razorpay expects amount in smallest currency unit)
    const amountInPaise = Math.round(amount * 100);

    // Create order in Razorpay
    const order = await razorpayService.createOrder({
      amount: amountInPaise,
      currency: currency.toUpperCase(),
      receipt: receipt || `receipt_${Date.now()}`,
      notes: notes || {}
    });

    if (order) {
      res.json({
        success: true,
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          status: order.status,
          createdAt: order.created_at
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to create order'
      });
    }
  } catch (error) {
    console.error('Error in create-order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/payments/verify-signature
 * Verify Razorpay payment signature
 */
router.post('/verify-signature', async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;

    // Validation
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        success: false,
        message: 'orderId, paymentId, and signature are required'
      });
    }

    // Verify signature
    const isValid = razorpayService.verifySignature(orderId, paymentId, signature);

    if (isValid) {
      res.json({
        success: true,
        verified: true,
        message: 'Payment signature verified successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        verified: false,
        message: 'Invalid payment signature'
      });
    }
  } catch (error) {
    console.error('Error in verify-signature:', error);
    res.status(500).json({
      success: false,
      verified: false,
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/payments/webhook
 * Handle Razorpay webhooks (optional but recommended)
 * Note: Webhook secret verification is optional but recommended for security
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Parse event first
    const event = JSON.parse(req.body.toString());

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (webhookSignature !== expectedSignature) {
        console.warn('⚠️  Invalid webhook signature - potential security risk');
        return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
      }
    } else {
      console.warn('⚠️  Webhook secret not configured - webhook accepted without verification (less secure)');
    }

    console.log('Webhook received:', event.event, event.payload);

    // Handle different webhook events
    switch (event.event) {
      case 'payment.captured':
        // Payment successful
        console.log('Payment captured:', event.payload.payment.entity.id);
        // Update payment status in your database
        break;
      case 'payment.failed':
        // Payment failed
        console.log('Payment failed:', event.payload.payment.entity.id);
        // Update payment status in your database
        break;
      default:
        console.log('Unhandled webhook event:', event.event);
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('Error in webhook:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
});

/**
 * GET /api/payments/verify-payment
 * Verify payment using payment ID (alternative to webhooks)
 * Use this endpoint as a redirect URL callback
 * Example redirect URL: https://yoursite.com/api/payments/verify-payment?payment_id=pay_xxx&order_id=order_xxx
 */
router.get('/verify-payment', async (req, res) => {
  try {
    const { payment_id, order_id } = req.query;

    if (!payment_id) {
      return res.status(400).json({
        success: false,
        message: 'payment_id is required'
      });
    }

    // Fetch payment details from Razorpay API
    const payment = await razorpayService.getPayment(payment_id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Verify payment status
    const isSuccess = payment.status === 'captured' || payment.status === 'authorized';
    
    // If order_id is provided, verify signature
    let signatureValid = null;
    if (order_id && req.query.razorpay_signature) {
      signatureValid = razorpayService.verifySignature(
        order_id,
        payment_id,
        req.query.razorpay_signature
      );
    }

    res.json({
      success: isSuccess,
      payment: {
        id: payment.id,
        order_id: payment.order_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        created_at: payment.created_at
      },
      signature_verified: signatureValid,
      message: isSuccess ? 'Payment verified successfully' : 'Payment verification failed'
    });
  } catch (error) {
    console.error('Error in verify-payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Payment verification failed'
    });
  }
});

module.exports = router;
