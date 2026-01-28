const { executeGraphQL } = require('../config/graphql');

/**
 * Tracking Service - Manages order tracking and tracking events
 */
class TrackingService {
  /**
   * Add tracking event for an order
   * @param {string} orderId - Order ID
   * @param {object} eventData - Tracking event details from Shiprocket webhook
   * @returns {Promise<object>} Created tracking event
   */
  async addTrackingEvent(orderId, eventData) {
    const {
      status,
      location = '',
      remarks = '',
      timestamp = new Date().toISOString(),
      awb = '',
      courierName = '',
      estimatedDeliveryDate = ''
    } = eventData;

    const mutation = `
      mutation CreateTrackingEvent(
        $orderId: ID!
        $status: String!
        $location: String
        $remarks: String
        $timestamp: DateTime!
        $awb: String
        $courierName: String
        $estimatedDeliveryDate: String
      ) {
        createTrackingEvent(
          data: {
            status: $status
            location: $location
            remarks: $remarks
            timestamp: $timestamp
            awb: $awb
            courierName: $courierName
            estimatedDeliveryDate: $estimatedDeliveryDate
            order: { connect: { id: $orderId } }
          }
        ) {
          id
          status
          location
          remarks
          timestamp
          createdAt
        }
      }
    `;

    const variables = {
      orderId,
      status,
      location,
      remarks,
      timestamp,
      awb,
      courierName,
      estimatedDeliveryDate
    };

    try {
      const result = await executeGraphQL(mutation, variables);
      return result.createTrackingEvent;
    } catch (error) {
      console.error('❌ Error adding tracking event:', error.message);
      // Don't throw - tracking events are non-critical
      return null;
    }
  }

  /**
   * Get all tracking events for an order
   * @param {string} orderId - Order ID
   * @returns {Promise<array>} List of tracking events
   */
  async getTrackingEvents(orderId) {
    const query = `
      query GetTrackingEvents($orderId: ID!) {
        trackingEvents(
          where: { order: { id: $orderId } }
          orderBy: timestamp_DESC
        ) {
          id
          status
          location
          remarks
          timestamp
          awb
          courierName
          estimatedDeliveryDate
          createdAt
        }
      }
    `;

    try {
      const result = await executeGraphQL(query, { orderId });
      return result.trackingEvents || [];
    } catch (error) {
      console.error('❌ Error fetching tracking events:', error.message);
      return [];
    }
  }

  /**
   * Build tracking timeline from events
   * @param {string} orderId - Order ID
   * @returns {Promise<array>} Formatted tracking timeline
   */
  async getTrackingTimeline(orderId) {
    const events = await this.getTrackingEvents(orderId);

    return events.map(event => ({
      id: event.id,
      status: event.status,
      location: event.location || '',
      remarks: event.remarks || '',
      timestamp: event.timestamp,
      awb: event.awb || '',
      courierName: event.courierName || '',
      estimatedDeliveryDate: event.estimatedDeliveryDate || ''
    }));
  }

  /**
   * Get latest tracking status for order
   * @param {string} orderId - Order ID
   * @returns {Promise<object>} Latest tracking event
   */
  async getLatestTrackingStatus(orderId) {
    const query = `
      query GetLatestTracking($orderId: ID!) {
        trackingEvents(
          where: { order: { id: $orderId } }
          orderBy: timestamp_DESC
          first: 1
        ) {
          id
          status
          location
          remarks
          timestamp
          awb
          courierName
          estimatedDeliveryDate
        }
      }
    `;

    try {
      const result = await executeGraphQL(query, { orderId });
      return result.trackingEvents?.[0] || null;
    } catch (error) {
      console.error('❌ Error fetching latest tracking:', error.message);
      return null;
    }
  }

  /**
   * Get tracking summary for order
   * @param {string} orderId - Order ID
   * @returns {Promise<object>} Tracking summary with latest status and all events
   */
  async getTrackingSummary(orderId) {
    const latestEvent = await this.getLatestTrackingStatus(orderId);
    const timeline = await this.getTrackingTimeline(orderId);

    return {
      orderId,
      currentStatus: latestEvent?.status || 'Unknown',
      currentLocation: latestEvent?.location || '',
      lastUpdate: latestEvent?.timestamp || null,
      estimatedDeliveryDate: latestEvent?.estimatedDeliveryDate || null,
      awb: latestEvent?.awb || '',
      courierName: latestEvent?.courierName || '',
      totalEvents: timeline.length,
      timeline
    };
  }

  /**
   * Bulk add tracking events (for initial sync)
   * @param {string} orderId - Order ID
   * @param {array} events - Array of event objects
   * @returns {Promise<array>} Created events
   */
  async bulkAddTrackingEvents(orderId, events) {
    const createdEvents = [];

    for (const event of events) {
      const created = await this.addTrackingEvent(orderId, event);
      if (created) {
        createdEvents.push(created);
      }
    }

    return createdEvents;
  }

  /**
   * Clear old tracking events (keep last 100)
   * @param {string} orderId - Order ID
   * @returns {Promise<number>} Number of events deleted
   */
  async pruneOldTrackingEvents(orderId) {
    const query = `
      query GetOldTrackingEvents($orderId: ID!) {
        trackingEvents(
          where: { order: { id: $orderId } }
          orderBy: timestamp_DESC
          skip: 100
        ) {
          id
        }
      }
    `;

    try {
      const result = await executeGraphQL(query, { orderId });
      let deleted = 0;

      for (const event of result.trackingEvents || []) {
        const mutation = `
          mutation DeleteTrackingEvent($id: ID!) {
            deleteTrackingEvent(where: { id: $id }) {
              id
            }
          }
        `;

        try {
          await executeGraphQL(mutation, { id: event.id });
          deleted++;
        } catch (error) {
          console.error(`Failed to delete event ${event.id}:`, error.message);
        }
      }

      return deleted;
    } catch (error) {
      console.error('Error pruning tracking events:', error.message);
      return 0;
    }
  }
}

module.exports = new TrackingService();
