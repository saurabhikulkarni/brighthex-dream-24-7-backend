const express = require('express');
const router = express.Router();
const razorpayService = require('../services/razorpayService');
const hygraphService = require('../services/hygraphService');

/**
 * POST /api/payments/create-order
 * Create Razorpay order
 */
router.post('/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes, userId, orderNumber, shippingAddressId } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    // userId is required for Hygraph integration
    // Check if Hygraph is configured (only endpoint is required, token is optional)
    // Support userId from root level or from notes object (for wallet top-ups)
    const userIdForHygraph = userId || notes?.userId;
    const isHygraphConfigured = process.env.HYGRAPH_ENDPOINT;
    console.log('🔍 Hygraph Configuration Check:');
    console.log('  HYGRAPH_ENDPOINT:', process.env.HYGRAPH_ENDPOINT || 'NOT SET');
    console.log('  isHygraphConfigured:', isHygraphConfigured ? 'YES' : 'NO');
    console.log('  userId provided (root):', userId ? 'YES' : 'NO');
    console.log('  userId provided (notes):', notes?.userId ? 'YES' : 'NO');
    console.log('  userId for Hygraph:', userIdForHygraph ? userIdForHygraph : 'NOT FOUND');
    
    if (isHygraphConfigured && !userIdForHygraph) {
      return res.status(400).json({
        success: false,
        message: 'userId is required for Hygraph integration (provide in body or notes.userId)'
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

    // Check if this is a wallet top-up (don't create Order for wallet top-ups)
    const isWalletTopup = notes?.type === 'wallet_topup' || req.body.notes?.type === 'wallet_topup';

    // Create payment record in Hygraph (payment is created before order is paid)
    let hygraphPayment = null;
    if (userIdForHygraph && isHygraphConfigured) {
      try {
        hygraphPayment = await hygraphService.createPayment({
          userId: userIdForHygraph,
          razorpayOrderId: order.id,
          amount: amountInPaise, // Amount in paise (service converts to rupees)
          currency: currency.toUpperCase(),
          paymentStatus: 'pending', // OrderStatus enum: lowercase
          method: null
        });
        console.log('✅ Payment created in Hygraph:', hygraphPayment.id);
      } catch (hygraphError) {
        console.error('⚠️  Failed to create payment in Hygraph:', hygraphError.message);
        // Continue even if Hygraph fails - Razorpay order is already created
      }
    }

    // Create order in Hygraph ONLY if NOT a wallet top-up and orderNumber is provided
    let hygraphOrder = null;
    if (!isWalletTopup && userIdForHygraph && orderNumber && isHygraphConfigured) {
      try {
        hygraphOrder = await hygraphService.createOrder({
          userId: userIdForHygraph,
          orderNumber,
          totalAmount: amountInPaise, // Amount in paise (service converts to rupees)
          orderStatus: 'pending', // OrderStatus enum: lowercase
          shippingAddressId: shippingAddressId || null
        });
        console.log('✅ Order created in Hygraph:', hygraphOrder.id);

        // Link payment to order if both were created
        if (hygraphPayment && hygraphOrder) {
          try {
            await hygraphService.linkPaymentToOrder(hygraphPayment.id, hygraphOrder.id);
            console.log('✅ Payment linked to order in Hygraph');
          } catch (linkError) {
            console.error('⚠️  Failed to link payment to order:', linkError.message);
          }
        }
      } catch (hygraphError) {
        console.error('⚠️  Failed to create order in Hygraph:', hygraphError.message);
      }
    } else if (isWalletTopup) {
      console.log('💰 Wallet top-up detected - skipping Order creation');
    }

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
      // Update Hygraph after successful verification (if configured)
      const isHygraphConfigured = process.env.HYGRAPH_ENDPOINT;
      if (isHygraphConfigured) {
        try {
          // Get payment details from Razorpay to get status
          const razorpayPayment = await razorpayService.getPayment(paymentId);
          const hygraphPaymentStatus = hygraphService.mapRazorpayStatusToHygraph(razorpayPayment.status);

          // Get Razorpay order to check if it's wallet top-up
          const razorpayOrder = await razorpayService.getOrder(orderId);
          const isWalletTopup = razorpayOrder?.notes?.type === 'wallet_topup';

          // Update payment status in Hygraph
          await hygraphService.updatePaymentStatus(orderId, hygraphPaymentStatus, {
            razorpayPaymentId: paymentId,
            method: razorpayPayment.method || null
          });
          console.log('✅ Payment status updated in Hygraph:', hygraphPaymentStatus);

          // Handle wallet top-up or regular order
          if (hygraphPaymentStatus === 'confirmed') {
            try {
              const payment = await hygraphService.findPaymentByRazorpayOrderId(orderId);
              
              if (isWalletTopup && payment) {
                // Wallet top-up: Update wallet balance
                const userId = payment.userDetail?.id || razorpayOrder?.notes?.userId;
                const amountInRupees = razorpayPayment.amount / 100; // Convert from paise to rupees
                
                if (userId) {
                  await hygraphService.updateWalletBalance(userId, amountInRupees);
                  console.log(`✅ Wallet balance updated: +₹${amountInRupees} for user ${userId}`);
                } else {
                  console.warn('⚠️  userId not found for wallet top-up');
                }
              } else if (payment && payment.order?.id) {
                // Regular order: Update order status
                await hygraphService.updateOrderStatus(payment.order.id, 'confirmed');
                console.log('✅ Order status updated to confirmed in Hygraph');
              }
            } catch (updateError) {
              console.error('⚠️  Failed to update order/wallet:', updateError.message);
            }
          }
        } catch (hygraphError) {
          console.error('⚠️  Failed to update Hygraph:', hygraphError.message);
          // Continue even if Hygraph update fails - signature verification succeeded
        }
      }
      
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
      case 'payment.captured': {
        // Payment successful
        const paymentEntity = event.payload.payment.entity;
        const razorpayOrderId = paymentEntity.order_id;
        const razorpayPaymentId = paymentEntity.id;
        
        console.log('Payment captured:', razorpayPaymentId, 'for order:', razorpayOrderId);
        
        // Update Hygraph if configured
        const isHygraphConfigured = process.env.HYGRAPH_ENDPOINT;
        if (isHygraphConfigured) {
          try {
            // Get Razorpay order to check if wallet top-up
            const razorpayOrder = await razorpayService.getOrder(razorpayOrderId);
            const isWalletTopup = razorpayOrder?.notes?.type === 'wallet_topup';

            // Update payment status in Hygraph
            await hygraphService.updatePaymentStatus(razorpayOrderId, 'confirmed', {
              razorpayPaymentId: razorpayPaymentId,
              method: paymentEntity.method || null
            });
            console.log('✅ Payment status updated to confirmed in Hygraph');

            // Handle wallet top-up or regular order
            const payment = await hygraphService.findPaymentByRazorpayOrderId(razorpayOrderId);
            
            if (isWalletTopup && payment) {
              // Wallet top-up: Update wallet balance
              const userId = payment.userDetail?.id || razorpayOrder?.notes?.userId;
              const amountInRupees = paymentEntity.amount / 100; // Convert from paise to rupees
              
              if (userId) {
                await hygraphService.updateWalletBalance(userId, amountInRupees);
                console.log(`✅ Wallet balance updated: +₹${amountInRupees} for user ${userId}`);
              } else {
                console.warn('⚠️  userId not found for wallet top-up');
              }
            } else if (payment && payment.order?.id) {
              // Regular order: Update order status
              await hygraphService.updateOrderStatus(payment.order.id, 'confirmed');
              console.log('✅ Order status updated to confirmed in Hygraph');
            }
          } catch (hygraphError) {
            console.error('⚠️  Failed to update Hygraph in webhook:', hygraphError.message);
          }
        }
        break;
      }
      case 'payment.failed': {
        // Payment failed
        const paymentEntity = event.payload.payment.entity;
        const razorpayOrderId = paymentEntity.order_id;
        const razorpayPaymentId = paymentEntity.id;
        
        console.log('Payment failed:', razorpayPaymentId, 'for order:', razorpayOrderId);
        
        // Update Hygraph if configured
        const isHygraphConfigured = process.env.HYGRAPH_ENDPOINT;
        if (isHygraphConfigured) {
          try {
            await hygraphService.updatePaymentStatus(razorpayOrderId, 'cancelled', {
              razorpayPaymentId: razorpayPaymentId,
              method: paymentEntity.method || null
            });
            console.log('✅ Payment status updated to cancelled in Hygraph');
          } catch (hygraphError) {
            console.error('⚠️  Failed to update Hygraph in webhook:', hygraphError.message);
          }
        }
        break;
      }
      case 'order.paid': {
        // Order paid
        const orderEntity = event.payload.order.entity;
        const razorpayOrderId = orderEntity.id;
        
        console.log('Order paid:', razorpayOrderId);
        
        // Update Hygraph if configured (order.paid event - typically for regular orders, not wallet top-ups)
        const isHygraphConfigured = process.env.HYGRAPH_ENDPOINT;
        if (isHygraphConfigured) {
          try {
            const payment = await hygraphService.findPaymentByRazorpayOrderId(razorpayOrderId);
            // Only update order status if it's a regular order (has order)
            if (payment && payment.order?.id) {
              await hygraphService.updateOrderStatus(payment.order.id, 'confirmed');
              console.log('✅ Order status updated to confirmed in Hygraph');
            }
          } catch (hygraphError) {
            console.error('⚠️  Failed to update order in Hygraph:', hygraphError.message);
          }
        }
        break;
      }
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

    // Update Hygraph if payment is successful and Hygraph is configured
    const isHygraphConfigured = process.env.HYGRAPH_ENDPOINT;
    if (isSuccess && order_id && isHygraphConfigured) {
      try {
        // Get Razorpay order to check if wallet top-up
        const razorpayOrder = await razorpayService.getOrder(order_id);
        const isWalletTopup = razorpayOrder?.notes?.type === 'wallet_topup';
        
        const hygraphPaymentStatus = hygraphService.mapRazorpayStatusToHygraph(payment.status);
        
        // Update payment status in Hygraph
        await hygraphService.updatePaymentStatus(order_id, hygraphPaymentStatus, {
          razorpayPaymentId: payment_id,
          method: payment.method || null
        });
        console.log('✅ Payment status updated in Hygraph:', hygraphPaymentStatus);

        // Handle wallet top-up or regular order
        if (hygraphPaymentStatus === 'confirmed') {
          try {
            const hygraphPayment = await hygraphService.findPaymentByRazorpayOrderId(order_id);
            
            if (isWalletTopup && hygraphPayment) {
              // Wallet top-up: Update wallet balance
              const userId = hygraphPayment.userDetail?.id || razorpayOrder?.notes?.userId;
              const amountInRupees = payment.amount / 100; // Convert from paise to rupees
              
              if (userId) {
                await hygraphService.updateWalletBalance(userId, amountInRupees);
                console.log(`✅ Wallet balance updated: +₹${amountInRupees} for user ${userId}`);
              } else {
                console.warn('⚠️  userId not found for wallet top-up');
              }
            } else if (hygraphPayment && hygraphPayment.order?.id) {
              // Regular order: Update order status
              await hygraphService.updateOrderStatus(hygraphPayment.order.id, 'confirmed');
              console.log('✅ Order status updated to confirmed in Hygraph');
            }
          } catch (updateError) {
            console.error('⚠️  Failed to update order/wallet:', updateError.message);
          }
        }
      } catch (hygraphError) {
        console.error('⚠️  Failed to update Hygraph:', hygraphError.message);
        // Continue - payment verification succeeded even if Hygraph update fails
      }
    }
    
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
