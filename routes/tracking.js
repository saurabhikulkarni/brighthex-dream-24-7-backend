const express = require('express');
const router = express.Router();
const trackingService = require('../services/trackingService');

/**
 * GET /api/tracking/:orderId
 * Get complete tracking timeline for order
 */
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    const trackingSummary = await trackingService.getTrackingSummary(orderId);

    res.json({
      success: true,
      data: trackingSummary
    });
  } catch (error) {
    console.error('❌ Error fetching tracking:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch tracking information'
    });
  }
});

/**
 * GET /api/tracking/:orderId/events
 * Get all tracking events for order
 */
router.get('/:orderId/events', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    const events = await trackingService.getTrackingEvents(orderId);

    res.json({
      success: true,
      data: events,
      count: events.length
    });
  } catch (error) {
    console.error('❌ Error fetching tracking events:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch tracking events'
    });
  }
});

/**
 * GET /api/tracking/:orderId/latest
 * Get latest tracking status
 */
router.get('/:orderId/latest', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    const latestStatus = await trackingService.getLatestTrackingStatus(orderId);

    if (!latestStatus) {
      return res.status(404).json({
        success: false,
        message: 'No tracking information found'
      });
    }

    res.json({
      success: true,
      data: latestStatus
    });
  } catch (error) {
    console.error('❌ Error fetching latest tracking:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch latest tracking status'
    });
  }
});

/**
 * POST /api/tracking/:orderId/events
 * Add tracking event manually (for testing or manual updates)
 */
router.post('/:orderId/events', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, location, remarks, timestamp, awb, courierName, estimatedDeliveryDate } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const event = await trackingService.addTrackingEvent(orderId, {
      status,
      location,
      remarks,
      timestamp: timestamp || new Date().toISOString(),
      awb,
      courierName,
      estimatedDeliveryDate
    });

    if (!event) {
      return res.status(500).json({
        success: false,
        message: 'Failed to add tracking event'
      });
    }

    console.log(`✅ Tracking event added for order ${orderId}`);

    res.status(201).json({
      success: true,
      message: 'Tracking event added successfully',
      data: event
    });
  } catch (error) {
    console.error('❌ Error adding tracking event:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add tracking event'
    });
  }
});

/**
 * GET /api/tracking/status-reference
 * Get reference of all possible tracking statuses
 */
router.get('/reference/statuses', (req, res) => {
  const statusReference = [
    { id: 1, name: 'Order Confirmed', description: 'Order has been confirmed' },
    { id: 2, name: 'Label Generated', description: 'Shipping label has been generated' },
    { id: 3, name: 'Picked Up', description: 'Package picked up by courier' },
    { id: 4, name: 'In Transit', description: 'Package is in transit' },
    { id: 5, name: 'Reached Destination Hub', description: 'Package reached destination hub' },
    { id: 6, name: 'Out for Delivery', description: 'Package is out for delivery' },
    { id: 7, name: 'Delivered', description: 'Package delivered successfully' },
    { id: 8, name: 'Cancelled', description: 'Order has been cancelled' },
    { id: 9, name: 'RTO Initiated', description: 'Return to origin initiated' },
    { id: 10, name: 'RTO Delivered', description: 'Package returned to sender' },
    { id: 11, name: 'Pending', description: 'Order pending' },
    { id: 12, name: 'Lost', description: 'Package lost' },
    { id: 13, name: 'Damaged', description: 'Package damaged during transit' },
    { id: 14, name: 'Undelivered', description: 'Delivery failed' }
  ];

  res.json({
    success: true,
    data: statusReference,
    count: statusReference.length
  });
});

module.exports = router;
