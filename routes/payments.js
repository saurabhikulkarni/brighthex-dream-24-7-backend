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

    // TODO: Create order in Hygraph with orderStatus = 'created' (not 'status')
    // Use field name: orderStatus

    if (order) {
      // Build redirect URL for payment verification
      const baseUrl = req.protocol + '://' + req.get('host');
      const redirectUrl = `${baseUrl}/api/payments/verify-payment`;
      const frontendRedirectUrl = req.body.redirect_url || process.env.FRONTEND_REDIRECT_URL || 'http://localhost:3001';
      
      // Include frontend redirect URL in the verify-payment redirect
      const verifyRedirectUrl = `${redirectUrl}?redirect_url=${encodeURIComponent(frontendRedirectUrl)}`;

      res.json({
        success: true,
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          status: order.status,
          createdAt: order.created_at
        },
        paymentOptions: {
          keyId: process.env.RAZORPAY_KEY_ID,
          amount: order.amount, // Amount in paise
          currency: order.currency,
          orderId: order.id,
          name: req.body.name || 'My Store',
          description: req.body.description || 'Order Payment',
          // Redirect URL to call after payment - this will redirect to frontend
          redirectUrl: verifyRedirectUrl,
          prefill: {
            name: req.body.customer_name || '',
            email: req.body.customer_email || '',
            contact: req.body.customer_contact || ''
          }
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
      // TODO: Update Hygraph after successful verification:
      // - Update Payment model: paymentStatus = 'captured' (not 'status')
      // - Update Order model: orderStatus = 'paid' (not 'status')
      
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
        // TODO: Update payment status in Hygraph
        // Use field name: paymentStatus (not status)
        // Example: updatePaymentStatus(paymentId, 'captured')
        break;
      case 'payment.failed':
        // Payment failed
        console.log('Payment failed:', event.payload.payment.entity.id);
        // TODO: Update payment status in Hygraph
        // Use field name: paymentStatus (not status)
        // Example: updatePaymentStatus(paymentId, 'failed')
        break;
      case 'order.paid':
        // Order paid
        console.log('Order paid:', event.payload.order.entity.id);
        // TODO: Update order status in Hygraph
        // Use field name: orderStatus (not status)
        // Example: updateOrderStatus(orderId, 'paid')
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
 * Verify payment and redirect to frontend with status
 * This endpoint is called by Razorpay after payment completion
 * Redirect URL format: ?payment_id=pay_xxx&order_id=order_xxx&razorpay_signature=xxx
 */
router.get('/verify-payment', async (req, res) => {
  try {
    const { payment_id, order_id, razorpay_signature, redirect_url } = req.query;
    const frontendRedirectUrl = redirect_url || process.env.FRONTEND_REDIRECT_URL || 'http://localhost:3001';

    if (!payment_id) {
      // Redirect to frontend with error
      const errorUrl = `${frontendRedirectUrl}?payment_status=failed&message=${encodeURIComponent('Payment ID is required')}`;
      return res.redirect(errorUrl);
    }

    // Fetch payment details from Razorpay API
    const payment = await razorpayService.getPayment(payment_id);

    if (!payment) {
      const errorUrl = `${frontendRedirectUrl}?payment_status=failed&message=${encodeURIComponent('Payment not found')}`;
      return res.redirect(errorUrl);
    }

    // Verify payment status
    const isSuccess = payment.status === 'captured' || payment.status === 'authorized';
    
    // Verify signature if provided
    let signatureValid = false;
    if (order_id && razorpay_signature) {
      signatureValid = razorpayService.verifySignature(
        order_id,
        payment_id,
        razorpay_signature
      );
    }

    // TODO: If payment is successful, update Hygraph:
    // - Update Payment model: paymentStatus = 'captured' (not 'status')
    // - Update Order model: orderStatus = 'paid' (not 'status')
    
    // Build redirect URL with payment details
    const params = new URLSearchParams({
      payment_status: isSuccess ? 'success' : 'failed',
      payment_id: payment.id,
      order_id: payment.order_id || order_id || '',
      amount: payment.amount,
      currency: payment.currency,
      signature_verified: signatureValid.toString()
    });

    if (!isSuccess) {
      params.append('message', encodeURIComponent('Payment verification failed'));
    }

    const redirectUrl = `${frontendRedirectUrl}?${params.toString()}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error in verify-payment:', error);
    const frontendRedirectUrl = req.query.redirect_url || process.env.FRONTEND_REDIRECT_URL || 'http://localhost:3001';
    const errorUrl = `${frontendRedirectUrl}?payment_status=error&message=${encodeURIComponent(error.message || 'Payment verification failed')}`;
    res.redirect(errorUrl);
  }
});

module.exports = router;
