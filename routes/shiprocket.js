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

module.exports = router;

