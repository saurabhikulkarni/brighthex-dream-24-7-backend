const express = require('express');
const router = express.Router();
const shiprocketService = require('../services/shiprocketService');

/**
 * GET /api/shiprocket/track/:orderId
 * Get order tracking details by Shiprocket Order ID
 */
router.get('/track/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    const trackingData = await shiprocketService.getOrderTracking(orderId);

    if (trackingData) {
      res.json({
        success: true,
        data: trackingData
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Order tracking not found or failed to fetch'
      });
    }
  } catch (error) {
    console.error('Error in track order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/shiprocket/track-awb/:awbCode
 * Get tracking details by AWB (Airway Bill) code
 */
router.get('/track-awb/:awbCode', async (req, res) => {
  try {
    const { awbCode } = req.params;

    if (!awbCode) {
      return res.status(400).json({
        success: false,
        message: 'AWB code is required'
      });
    }

    const trackingData = await shiprocketService.getTrackingByAWB(awbCode);

    if (trackingData) {
      res.json({
        success: true,
        data: trackingData
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'AWB tracking not found or failed to fetch'
      });
    }
  } catch (error) {
    console.error('Error in track AWB:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/shiprocket/create-shipment
 * Create a shipment order in Shiprocket
 */
router.post('/create-shipment', async (req, res) => {
  try {
    const shipmentData = req.body;

    // Basic validation
    if (!shipmentData.order_id || !shipmentData.billing_customer_name) {
      return res.status(400).json({
        success: false,
        message: 'order_id and billing_customer_name are required'
      });
    }

    const result = await shiprocketService.createShipment(shipmentData);

    if (result) {
      res.json({
        success: true,
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to create shipment'
      });
    }
  } catch (error) {
    console.error('Error in create shipment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/shiprocket/verify-credentials
 * Verify Shiprocket API credentials
 */
router.post('/verify-credentials', async (req, res) => {
  try {
    const isValid = await shiprocketService.verifyCredentials();

    res.json({
      success: true,
      valid: isValid,
      message: isValid ? 'Credentials are valid' : 'Credentials are invalid'
    });
  } catch (error) {
    console.error('Error in verify credentials:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/shiprocket/reset-auth
 * Reset authentication failure flag (allows retry)
 */
router.post('/reset-auth', async (req, res) => {
  try {
    shiprocketService.resetAuthFailure();
    res.json({
      success: true,
      message: 'Authentication reset successfully'
    });
  } catch (error) {
    console.error('Error in reset auth:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/shiprocket/webhook
 * Receive order status updates from Shiprocket
 * 
 * Configure this webhook URL in Shiprocket Dashboard:
 * Settings → Webhooks → Add Webhook
 * URL: https://your-domain.com/api/shiprocket/webhook
 * 
 * Shiprocket sends updates for:
 * - Order Placed
 * - Pickup Scheduled
 * - Pickup Generated
 * - In Transit
 * - Out for Delivery
 * - Delivered
 * - RTO Initiated
 * - RTO Delivered
 * - Cancelled
 */
router.post('/webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    
    // Log the webhook for debugging
    console.log('📦 Shiprocket Webhook Received:', JSON.stringify(webhookData, null, 2));
    
    // Extract key information from webhook payload
    const {
      order_id,
      awb,
      current_status,
      current_status_id,
      shipment_status,
      shipment_status_id,
      courier_name,
      etd, // Estimated Time of Delivery
      scans, // Array of tracking scans
      delivered_date,
      rto_initiated_date,
      pod, // Proof of Delivery (image URL)
      channel_order_id, // Your original order ID
    } = webhookData;
    
    // Map status IDs to readable names
    const statusMap = {
      1: 'AWB Assigned',
      2: 'Label Generated',
      3: 'Pickup Scheduled',
      4: 'Pickup Queued',
      5: 'Manifest Generated',
      6: 'Shipped',
      7: 'Delivered',
      8: 'Cancelled',
      9: 'RTO Initiated',
      10: 'RTO Delivered',
      11: 'Pending',
      12: 'Lost',
      13: 'Pickup Error',
      14: 'RTO Acknowledged',
      15: 'Pickup Rescheduled',
      16: 'Cancellation Requested',
      17: 'Out for Delivery',
      18: 'In Transit',
      19: 'Out for Pickup',
      20: 'Pickup Exception',
      21: 'Undelivered',
      22: 'Delayed',
      23: 'Partial Delivered',
      24: 'Destroyed',
      25: 'Damaged',
      26: 'Fulfilled',
      38: 'Reached Destination Hub',
      39: 'Misrouted',
      40: 'RTO NDR',
      41: 'RTO OFD',
      42: 'Picked Up',
      43: 'Self Fulfilled',
      44: 'Disposed Off',
      45: 'Cancelled Before Dispatched',
      46: 'RTO In Transit',
      47: 'QC Failed',
      48: 'Reached Warehouse',
      49: 'Custom Cleared',
      50: 'In Flight',
      51: 'Handover to Courier',
      52: 'Shipment Booked',
      53: 'In Transit Overseas',
      54: 'Connection Aligned',
      55: 'Reached Overseas Warehouse',
      56: 'Custom Broker Notified',
      57: 'Payment Confirmation Pending',
      58: 'Custom Cleared Overseas',
      59: 'Box Packing'
    };
    
    const statusName = statusMap[current_status_id] || current_status || 'Unknown';
    
    console.log(`📦 Order Update: ${order_id || channel_order_id}`);
    console.log(`   Status: ${statusName} (ID: ${current_status_id})`);
    console.log(`   AWB: ${awb}`);
    console.log(`   Courier: ${courier_name}`);
    if (etd) console.log(`   ETA: ${etd}`);
    if (delivered_date) console.log(`   Delivered: ${delivered_date}`);
    
    // TODO: Update order status in your database (Hygraph)
    // Example: await orderService.updateOrderStatus(channel_order_id, statusName);
    
    // TODO: Send push notification to user
    // Example: await notificationService.sendOrderUpdate(userId, statusName, order_id);
    
    // TODO: Store tracking history
    // Example: await orderService.addTrackingEvent(order_id, webhookData);
    
    // Respond to Shiprocket (IMPORTANT: Must return 200 quickly)
    res.status(200).json({
      success: true,
      message: 'Webhook received',
      order_id: order_id || channel_order_id,
      status: statusName
    });
    
  } catch (error) {
    console.error('❌ Shiprocket Webhook Error:', error);
    // Still return 200 to prevent Shiprocket from retrying
    res.status(200).json({
      success: false,
      message: 'Webhook processing error',
      error: error.message
    });
  }
});

/**
 * GET /api/shiprocket/webhook/test
 * Test endpoint to verify webhook URL is accessible
 */
router.get('/webhook/test', (req, res) => {
  res.json({
    success: true,
    message: 'Shiprocket webhook endpoint is active',
    webhook_url: '/api/shiprocket/webhook',
    method: 'POST',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/shiprocket/order-statuses
 * Get all possible order status codes and their meanings
 */
router.get('/order-statuses', (req, res) => {
  const statuses = [
    { id: 1, name: 'AWB Assigned', description: 'Tracking number assigned' },
    { id: 2, name: 'Label Generated', description: 'Shipping label created' },
    { id: 3, name: 'Pickup Scheduled', description: 'Courier pickup scheduled' },
    { id: 6, name: 'Shipped', description: 'Package picked up and in transit' },
    { id: 17, name: 'Out for Delivery', description: 'Package out for delivery' },
    { id: 7, name: 'Delivered', description: 'Package delivered successfully' },
    { id: 8, name: 'Cancelled', description: 'Order cancelled' },
    { id: 9, name: 'RTO Initiated', description: 'Return to origin initiated' },
    { id: 10, name: 'RTO Delivered', description: 'Package returned to seller' },
    { id: 18, name: 'In Transit', description: 'Package in transit' },
    { id: 21, name: 'Undelivered', description: 'Delivery attempt failed' },
    { id: 42, name: 'Picked Up', description: 'Package picked up by courier' }
  ];
  
  res.json({
    success: true,
    statuses
  });
});

module.exports = router;

