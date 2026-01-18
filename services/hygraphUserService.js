const hygraphClient = require('../config/hygraph');

class HygraphUserService {
  // Find user by mobile number
  async findUserByMobile(mobile) {
    const query = `
      query GetUserByMobile($mobileNumber: String!) {
        userDetails(where: { mobileNumber: $mobileNumber }, first: 1) {
          id
          mobileNumber
          firstName
          lastName
          username
          refreshToken
          modules
          shopEnabled
          fantasyEnabled
        }
      }
    `;
    
    try {
      const data = await hygraphClient.query(query, { mobileNumber: mobile.toString() });
      return data.userDetails && data.userDetails.length > 0 ? data.userDetails[0] : null;
    } catch (error) {
      // If mobileNumber filter doesn't work, try fetching all and filtering client-side
      console.warn('findUserByMobile with where clause failed, trying without where clause:', error.message);
      const fallbackQuery = `
        query GetAllUsers {
          userDetails(first: 100) {
            id
            mobileNumber
            firstName
            lastName
            username
            refreshToken
            modules
            shopEnabled
            fantasyEnabled
          }
        }
      `;
      
      const fallbackData = await hygraphClient.query(fallbackQuery);
      const user = fallbackData.userDetails?.find(u => u.mobileNumber === mobile.toString());
      return user || null;
    }
  }

  // Create new user
  async createUser(userData) {
    const mutation = `
      mutation CreateUser(
        $mobileNumber: String!
        $firstName: String
        $lastName: String
        $modules: [String!]!
        $shopEnabled: Boolean!
        $fantasyEnabled: Boolean!
      ) {
        createUserDetail(
          data: {
            mobileNumber: $mobileNumber
            firstName: $firstName
            lastName: $lastName
            modules: $modules
            shopEnabled: $shopEnabled
            fantasyEnabled: $fantasyEnabled
          }
        ) {
          id
          mobileNumber
          firstName
          lastName
          username
          refreshToken
          modules
          shopEnabled
          fantasyEnabled
        }
      }
    `;
    
    try {
      const data = await hygraphClient.mutate(mutation, {
        mobileNumber: userData.mobile.toString(),
        firstName: userData.firstName || 'User',
        lastName: userData.lastName || '',
        modules: userData.modules || ['shop'],
        shopEnabled: true,
        fantasyEnabled: false
      });
      
      return data.createUserDetail;
    } catch (error) {
      console.error('Error creating user:', error.message);
      // Return a minimal user object to allow login to proceed
      return {
        id: null,
        mobileNumber: userData.mobile.toString(),
        firstName: userData.firstName || 'User',
        modules: userData.modules || ['shop'],
        shopEnabled: true,
        fantasyEnabled: false
      };
    }
  }

  // Update user by mobile
  async updateUser(mobile, updateData) {
    // Build data fields dynamically
    const dataFields = [];
    const variables = { mobileNumber: mobile.toString() };
    
    if (updateData.refreshToken !== undefined) {
      dataFields.push('refreshToken: $refreshToken');
      variables.refreshToken = updateData.refreshToken;
    }
    if (updateData.firstName !== undefined) {
      dataFields.push('firstName: $firstName');
      variables.firstName = updateData.firstName;
    }
    if (updateData.lastName !== undefined) {
      dataFields.push('lastName: $lastName');
      variables.lastName = updateData.lastName;
    }
    if (updateData.fantasy_user_id !== undefined) {
      dataFields.push('fantasy_user_id: $fantasy_user_id');
      variables.fantasy_user_id = updateData.fantasy_user_id;
    }
    
    const mutation = `
      mutation UpdateUser(
        $mobileNumber: String!
        ${updateData.refreshToken !== undefined ? '$refreshToken: String' : ''}
        ${updateData.firstName !== undefined ? '$firstName: String' : ''}
        ${updateData.lastName !== undefined ? '$lastName: String' : ''}
        ${updateData.fantasy_user_id !== undefined ? '$fantasy_user_id: String' : ''}
      ) {
        updateUserDetail(
          where: { mobileNumber: $mobileNumber }
          data: {
            ${dataFields.join('\n            ')}
          }
        ) {
          id
          mobileNumber
          firstName
          lastName
          username
          refreshToken
          modules
          shopEnabled
          fantasyEnabled
        }
      }
    `;
    
    const data = await hygraphClient.mutate(mutation, variables);
    return data.updateUserDetail;
  }

  // Update user by ID (for fantasy_user_id and module fields)
  async updateUserById(userId, updateData) {
    // Build data fields dynamically
    const dataFields = [];
    const variables = { id: userId };
    
    if (updateData.fantasy_user_id !== undefined) {
      dataFields.push('fantasy_user_id: $fantasy_user_id');
      variables.fantasy_user_id = updateData.fantasy_user_id;
    }
    if (updateData.shopEnabled !== undefined) {
      dataFields.push('shopEnabled: $shopEnabled');
      variables.shopEnabled = updateData.shopEnabled;
    }
    if (updateData.fantasyEnabled !== undefined) {
      dataFields.push('fantasyEnabled: $fantasyEnabled');
      variables.fantasyEnabled = updateData.fantasyEnabled;
    }
    if (updateData.modules !== undefined) {
      dataFields.push('modules: $modules');
      variables.modules = updateData.modules;
    }
    
    const mutation = `
      mutation UpdateUserById(
        $id: ID!
        ${updateData.fantasy_user_id !== undefined ? '$fantasy_user_id: String' : ''}
        ${updateData.shopEnabled !== undefined ? '$shopEnabled: Boolean' : ''}
        ${updateData.fantasyEnabled !== undefined ? '$fantasyEnabled: Boolean' : ''}
        ${updateData.modules !== undefined ? '$modules: [String!]' : ''}
      ) {
        updateUserDetail(
          where: { id: $id }
          data: {
            ${dataFields.join('\n            ')}
          }
        ) {
          id
          mobileNumber
          firstName
          lastName
          username
          refreshToken
          modules
          shopEnabled
          fantasyEnabled
        }
      }
    `;
    
    const data = await hygraphClient.mutate(mutation, variables);
    return data.updateUserDetail;
  }

  // Find user by ID
  async findUserById(userId) {
    const query = `
      query GetUserById($id: ID!) {
        userDetail(where: { id: $id }) {
          id
          mobileNumber
          firstName
          lastName
          username
          refreshToken
          modules
          shopEnabled
          fantasyEnabled
        }
      }
    `;
    
    try {
      const data = await hygraphClient.query(query, { id: userId });
      return data.userDetail || null;
    } catch (error) {
      console.error('Error finding user by ID:', error.message);
      return null;
    }
  }
}

module.exports = new HygraphUserService();