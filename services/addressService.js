const { executeGraphQL } = require('../config/graphql');

/**
 * Address Service - Manages address operations with Hygraph
 */
class AddressService {
  /**
   * Create new address
   * @param {object} addressData - Address details
   * @returns {Promise<object>} Created address
   */
  async createAddress({
    userId,
    fullName,
    phoneNumber,
    addressLine1,
    addressLine2 = '',
    city,
    state,
    pincode,
    country,
    isDefault = false
  }) {
    // If this is the first address or marked as default, set it as default
    const mutation = `
      mutation CreateAddress(
        $userId: ID!
        $fullName: String!
        $phoneNumber: String!
        $addressLine1: String!
        $addressLine2: String
        $city: String!
        $state: String!
        $pincode: String!
        $country: String!
        $isDefault: Boolean!
      ) {
        createAddress(
          data: {
            fullName: $fullName
            phoneNumber: $phoneNumber
            addressLine1: $addressLine1
            addressLine2: $addressLine2
            city: $city
            state: $state
            pincode: $pincode
            country: $country
            isDefault: $isDefault
            user: { connect: { id: $userId } }
          }
        ) {
          id
          fullName
          phoneNumber
          addressLine1
          addressLine2
          city
          state
          pincode
          country
          isDefault
          createdAt
        }
      }
    `;

    const variables = {
      userId,
      fullName,
      phoneNumber,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      country,
      isDefault
    };

    const result = await executeGraphQL(mutation, variables);
    return result.createAddress;
  }

  /**
   * Get all addresses for a user
   * @param {string} userId - User ID
   * @returns {Promise<array>} List of user addresses
   */
  async getAddressesByUserId(userId) {
    const query = `
      query GetUserAddresses($userId: ID!) {
        addresses(
          where: { user: { id: $userId } }
          orderBy: isDefault_DESC
        ) {
          id
          fullName
          phoneNumber
          addressLine1
          addressLine2
          city
          state
          pincode
          country
          isDefault
          createdAt
          updatedAt
        }
      }
    `;

    const result = await executeGraphQL(query, { userId });
    return result.addresses || [];
  }

  /**
   * Get single address by ID
   * @param {string} addressId - Address ID
   * @returns {Promise<object>} Address details
   */
  async getAddressById(addressId) {
    const query = `
      query GetAddress($id: ID!) {
        address(where: { id: $id }) {
          id
          fullName
          phoneNumber
          addressLine1
          addressLine2
          city
          state
          pincode
          country
          isDefault
          createdAt
          updatedAt
        }
      }
    `;

    const result = await executeGraphQL(query, { id: addressId });
    return result.address;
  }

  /**
   * Update address
   * @param {string} addressId - Address ID
   * @param {object} updateData - Fields to update
   * @returns {Promise<object>} Updated address
   */
  async updateAddress(addressId, updateData) {
    const mutation = `
      mutation UpdateAddress(
        $id: ID!
        $fullName: String
        $phoneNumber: String
        $addressLine1: String
        $addressLine2: String
        $city: String
        $state: String
        $pincode: String
        $country: String
      ) {
        updateAddress(
          where: { id: $id }
          data: {
            fullName: $fullName
            phoneNumber: $phoneNumber
            addressLine1: $addressLine1
            addressLine2: $addressLine2
            city: $city
            state: $state
            pincode: $pincode
            country: $country
          }
        ) {
          id
          fullName
          phoneNumber
          addressLine1
          city
          state
          pincode
          country
        }
      }
    `;

    const variables = {
      id: addressId,
      fullName: updateData.fullName,
      phoneNumber: updateData.phoneNumber,
      addressLine1: updateData.addressLine1,
      addressLine2: updateData.addressLine2,
      city: updateData.city,
      state: updateData.state,
      pincode: updateData.pincode,
      country: updateData.country
    };

    const result = await executeGraphQL(mutation, variables);
    return result.updateAddress;
  }

  /**
   * Delete address
   * @param {string} addressId - Address ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteAddress(addressId) {
    const mutation = `
      mutation DeleteAddress($id: ID!) {
        deleteAddress(where: { id: $id }) {
          id
        }
      }
    `;

    const result = await executeGraphQL(mutation, { id: addressId });
    return !!result.deleteAddress?.id;
  }

  /**
   * Set address as default
   * @param {string} userId - User ID
   * @param {string} addressId - Address ID to set as default
   * @returns {Promise<object>} Updated address
   */
  async setDefaultAddress(userId, addressId) {
    // First, unset all other addresses as default
    const addresses = await this.getAddressesByUserId(userId);
    
    for (const addr of addresses) {
      if (addr.id !== addressId && addr.isDefault) {
        await this.updateAddressDefault(addr.id, false);
      }
    }

    // Then set the selected address as default
    return await this.updateAddressDefault(addressId, true);
  }

  /**
   * Update address default status
   * @param {string} addressId - Address ID
   * @param {boolean} isDefault - Default status
   * @returns {Promise<object>} Updated address
   */
  async updateAddressDefault(addressId, isDefault) {
    const mutation = `
      mutation UpdateAddressDefault($id: ID!, $isDefault: Boolean!) {
        updateAddress(
          where: { id: $id }
          data: { isDefault: $isDefault }
        ) {
          id
          isDefault
        }
      }
    `;

    const result = await executeGraphQL(mutation, { id: addressId, isDefault });
    return result.updateAddress;
  }

  /**
   * Get default address for user
   * @param {string} userId - User ID
   * @returns {Promise<object>} Default address
   */
  async getDefaultAddress(userId) {
    const query = `
      query GetDefaultAddress($userId: ID!) {
        addresses(
          where: { user: { id: $userId }, isDefault: true }
          first: 1
        ) {
          id
          fullName
          phoneNumber
          addressLine1
          addressLine2
          city
          state
          pincode
          country
        }
      }
    `;

    const result = await executeGraphQL(query, { userId });
    return result.addresses?.[0] || null;
  }
}

module.exports = new AddressService();
