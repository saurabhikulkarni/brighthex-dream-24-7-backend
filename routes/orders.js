const express = require('express');
const router = express.Router();
const orderService = require('../services/orderService');
const addressService = require('../services/addressService');
const shiprocketService = require('../services/shiprocketService');
const trackingService = require('../services/trackingService');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/orders
 * Create a new order
 */
router.post('/', async (req, res) => {
  try {
    const {
      userId,
      items = [],
      totalAmount,
      addressId,
      paymentId
    } = req.body;

    // Validation
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order items are required'
      });
    }

    if (totalAmount === undefined || totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid total amount is required'
      });
    }

    // Generate order number
    const orderNumber = `ORD${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create order in Hygraph
    const order = await orderService.createOrder({
      userId,
      orderNumber,
      totalAmount,
      status: 'PENDING',
      items,
      addressId,
      paymentId
    });

    console.log(`✅ Order created: ${order.id}`);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order
    });
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create order'
    });
  }
});

/**
 * GET /api/orders
 * Get all orders for current user
 */
router.get('/', async (req, res) => {
  try {
    const { userId, skip = 0, limit = 50, status } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    let orders;

    if (status) {
      // Get orders by specific status
      orders = await orderService.getOrdersByStatus(status);
      orders = orders.filter(o => o.userDetail?.id === userId);
    } else {
      // Get all user orders with pagination
      orders = await orderService.getUserOrders(userId, {
        skip: parseInt(skip),
        limit: parseInt(limit)
      });
    }

    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error) {
    console.error('❌ Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch orders'
    });
  }
});

/**
 * GET /api/orders/:orderId
 * Get single order details
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

    const order = await orderService.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('❌ Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch order'
    });
  }
});

/**
 * PUT /api/orders/:orderId
 * Update order status
 */
router.put('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

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

    const updatedOrder = await orderService.updateOrderStatus(orderId, status);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: updatedOrder
    });
  } catch (error) {
    console.error('❌ Error updating order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update order'
    });
  }
});

/**
 * DELETE /api/orders/:orderId
 * Cancel order
 */
router.delete('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    const cancelledOrder = await orderService.cancelOrder(orderId);

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: cancelledOrder
    });
  } catch (error) {
    console.error('❌ Error cancelling order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel order'
    });
  }
});

/**
 * POST /api/orders/:orderId/create-shipment
 * Create Shiprocket shipment for order
 */
router.post('/:orderId/create-shipment', async (req, res) => {
  try {
    const { orderId } = req.params;
    const shipmentData = req.body;

    // Get order details
    const order = await orderService.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Prepare shipment data for Shiprocket
    const shiprocketPayload = {
      order_id: order['order-number'],
      billing_customer_name: order.userDetail?.['first-name'] || 'Customer',
      billing_customer_phone: order.userDetail?.['mobile-number'] || '',
      billing_customer_email: shipmentData.email || '',
      billing_address: order.address?.['addressLine1'] || '',
      billing_city: order.address?.city || '',
      billing_state: order.address?.state || '',
      billing_country: order.address?.country || '',
      billing_pincode: order.address?.pincode || '',
      shipping_customer_name: order.userDetail?.['first-name'] || 'Customer',
      shipping_customer_phone: order.userDetail?.['mobile-number'] || '',
      shipping_address: order.address?.['addressLine1'] || '',
      shipping_city: order.address?.city || '',
      shipping_state: order.address?.state || '',
      shipping_country: order.address?.country || '',
      shipping_pincode: order.address?.pincode || '',
      ...shipmentData
    };

    // Create shipment in Shiprocket
    const shiprocketResult = await shiprocketService.createShipment(shiprocketPayload);

    if (shiprocketResult && shiprocketResult.shipment_id) {
      // Update order with Shiprocket details
      await orderService.updateOrderStatus(orderId, 'PROCESSING', {
        shiprocketOrderId: shiprocketResult.shipment_id,
        trackingNumber: shiprocketResult.awb || '',
        courierName: shiprocketResult.courier || ''
      });

      res.json({
        success: true,
        message: 'Shipment created successfully',
        data: {
          orderId,
          shiprocketOrderId: shiprocketResult.shipment_id,
          awb: shiprocketResult.awb,
          courier: shiprocketResult.courier
        }
      });
    } else {
      throw new Error('Failed to create shipment in Shiprocket');
    }
  } catch (error) {
    console.error('❌ Error creating shipment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create shipment'
    });
  }
});

/**
 * GET /api/orders/:orderId/status
 * Get order with latest tracking status
 */
router.get('/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await orderService.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get latest tracking info
    const trackingSummary = await trackingService.getTrackingSummary(orderId);

    res.json({
      success: true,
      data: {
        order,
        tracking: trackingSummary
      }
    });
  } catch (error) {
    console.error('❌ Error fetching order status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch order status'
    });
  }
});

module.exports = router;
