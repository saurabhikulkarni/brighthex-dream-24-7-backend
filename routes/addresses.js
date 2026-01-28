const express = require('express');
const router = express.Router();
const addressService = require('../services/addressService');

/**
 * POST /api/addresses
 * Create new address
 */
router.post('/', async (req, res) => {
  try {
    const {
      userId,
      fullName,
      phoneNumber,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      country,
      isDefault = false
    } = req.body;

    // Validation
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    if (!fullName || !phoneNumber || !addressLine1 || !city || !state || !pincode || !country) {
      return res.status(400).json({
        success: false,
        message: 'All required address fields must be provided'
      });
    }

    // Check if user has any addresses
    const existingAddresses = await addressService.getAddressesByUserId(userId);
    const shouldBeDefault = isDefault || existingAddresses.length === 0;

    const address = await addressService.createAddress({
      userId,
      fullName,
      phoneNumber,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      country,
      isDefault: shouldBeDefault
    });

    console.log(`✅ Address created: ${address.id}`);

    res.status(201).json({
      success: true,
      message: 'Address created successfully',
      data: address
    });
  } catch (error) {
    console.error('❌ Error creating address:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create address'
    });
  }
});

/**
 * GET /api/addresses
 * Get all addresses for user
 */
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const addresses = await addressService.getAddressesByUserId(userId);

    res.json({
      success: true,
      data: addresses,
      count: addresses.length
    });
  } catch (error) {
    console.error('❌ Error fetching addresses:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch addresses'
    });
  }
});

/**
 * GET /api/addresses/:addressId
 * Get single address
 */
router.get('/:addressId', async (req, res) => {
  try {
    const { addressId } = req.params;

    if (!addressId) {
      return res.status(400).json({
        success: false,
        message: 'Address ID is required'
      });
    }

    const address = await addressService.getAddressById(addressId);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    res.json({
      success: true,
      data: address
    });
  } catch (error) {
    console.error('❌ Error fetching address:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch address'
    });
  }
});

/**
 * PUT /api/addresses/:addressId
 * Update address
 */
router.put('/:addressId', async (req, res) => {
  try {
    const { addressId } = req.params;
    const updateData = req.body;

    if (!addressId) {
      return res.status(400).json({
        success: false,
        message: 'Address ID is required'
      });
    }

    // Validate at least one field is provided
    const allowedFields = [
      'fullName', 'phoneNumber', 'addressLine1', 'addressLine2',
      'city', 'state', 'pincode', 'country'
    ];

    const hasValidField = allowedFields.some(field => updateData[field] !== undefined);
    if (!hasValidField) {
      return res.status(400).json({
        success: false,
        message: 'At least one address field must be provided'
      });
    }

    const updatedAddress = await addressService.updateAddress(addressId, {
      fullName: updateData.fullName,
      phoneNumber: updateData.phoneNumber,
      addressLine1: updateData.addressLine1,
      addressLine2: updateData.addressLine2,
      city: updateData.city,
      state: updateData.state,
      pincode: updateData.pincode,
      country: updateData.country
    });

    if (!updatedAddress) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    res.json({
      success: true,
      message: 'Address updated successfully',
      data: updatedAddress
    });
  } catch (error) {
    console.error('❌ Error updating address:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update address'
    });
  }
});

/**
 * DELETE /api/addresses/:addressId
 * Delete address
 */
router.delete('/:addressId', async (req, res) => {
  try {
    const { addressId } = req.params;

    if (!addressId) {
      return res.status(400).json({
        success: false,
        message: 'Address ID is required'
      });
    }

    const success = await addressService.deleteAddress(addressId);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'Address not found or could not be deleted'
      });
    }

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting address:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete address'
    });
  }
});

/**
 * POST /api/addresses/:addressId/set-default
 * Set address as default
 */
router.post('/:addressId/set-default', async (req, res) => {
  try {
    const { addressId } = req.params;
    const { userId } = req.body;

    if (!addressId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Address ID and User ID are required'
      });
    }

    await addressService.setDefaultAddress(userId, addressId);

    res.json({
      success: true,
      message: 'Address set as default successfully'
    });
  } catch (error) {
    console.error('❌ Error setting default address:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to set default address'
    });
  }
});

/**
 * GET /api/addresses/default/:userId
 * Get default address for user
 */
router.get('/default/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const address = await addressService.getDefaultAddress(userId);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'No default address found'
      });
    }

    res.json({
      success: true,
      data: address
    });
  } catch (error) {
    console.error('❌ Error fetching default address:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch default address'
    });
  }
});

module.exports = router;
