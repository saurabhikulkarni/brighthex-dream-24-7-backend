const hygraphClient = require('../config/hygraph');

class HygraphUserService {
  // Find user by mobile number
  async findUserByMobile(mobile) {
    const query = `
      query GetUserByMobile($mobile: String!) {
        user(where: { mobile: $mobile }) {
          id
          mobile
          fullname
          email
          authKey
          refreshToken
          status
          image
          deviceId
          lastLogin
          createdAt
          updatedAt
          fantasy_user_id
        }
      }
    `;
    
    const data = await hygraphClient.query(query, { mobile: mobile.toString() });
    return data.user;
  }

  // Create new user
  async createUser(userData) {
    const mutation = `
      mutation CreateUser(
        $mobile: String!
        $authKey: String
        $deviceId: String
        $status: String
      ) {
        createUser(
          data: {
            mobile: $mobile
            authKey: $authKey
            deviceId: $deviceId
            status: $status
            lastLogin: "${new Date().toISOString()}"
          }
        ) {
          id
          mobile
          fullname
          email
          authKey
          status
          image
          deviceId
          lastLogin
        }
        publishUser(where: { mobile: $mobile }) {
          id
        }
      }
    `;
    
    const data = await hygraphClient.mutate(mutation, {
      mobile: userData.mobile.toString(),
      authKey: userData.authKey || '',
      deviceId: userData.deviceId || '',
      status: userData.status || 'activated'
    });
    
    return data.createUser;
  }

  // Update user by mobile
  async updateUser(mobile, updateData) {
    // Build data fields dynamically
    const dataFields = [];
    const variables = { mobile: mobile.toString() };
    
    if (updateData.authKey !== undefined) {
      dataFields.push('authKey: $authKey');
      variables.authKey = updateData.authKey;
    }
    if (updateData.refreshToken !== undefined) {
      dataFields.push('refreshToken: $refreshToken');
      variables.refreshToken = updateData.refreshToken;
    }
    if (updateData.deviceId !== undefined) {
      dataFields.push('deviceId: $deviceId');
      variables.deviceId = updateData.deviceId;
    }
    if (updateData.fullname !== undefined) {
      dataFields.push('fullname: $fullname');
      variables.fullname = updateData.fullname;
    }
    if (updateData.email !== undefined) {
      dataFields.push('email: $email');
      variables.email = updateData.email;
    }
    if (updateData.lastLogin !== undefined) {
      dataFields.push('lastLogin: $lastLogin');
      variables.lastLogin = updateData.lastLogin;
    }
    
    const mutation = `
      mutation UpdateUser(
        $mobile: String!
        ${updateData.authKey !== undefined ? '$authKey: String' : ''}
        ${updateData.refreshToken !== undefined ? '$refreshToken: String' : ''}
        ${updateData.deviceId !== undefined ? '$deviceId: String' : ''}
        ${updateData.fullname !== undefined ? '$fullname: String' : ''}
        ${updateData.email !== undefined ? '$email: String' : ''}
        ${updateData.lastLogin !== undefined ? '$lastLogin: DateTime' : ''}
      ) {
        updateUser(
          where: { mobile: $mobile }
          data: {
            ${dataFields.join('\n            ')}
          }
        ) {
          id
          mobile
          fullname
          email
          authKey
          refreshToken
          status
        }
        publishUser(where: { mobile: $mobile }) {
          id
        }
      }
    `;
    
    const data = await hygraphClient.mutate(mutation, variables);
    return data.updateUser;
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
    if (updateData.shop_enabled !== undefined) {
      dataFields.push('shop_enabled: $shop_enabled');
      variables.shop_enabled = updateData.shop_enabled;
    }
    if (updateData.fantasy_enabled !== undefined) {
      dataFields.push('fantasy_enabled: $fantasy_enabled');
      variables.fantasy_enabled = updateData.fantasy_enabled;
    }
    if (updateData.modules !== undefined) {
      dataFields.push('modules: $modules');
      variables.modules = updateData.modules;
    }
    
    const mutation = `
      mutation UpdateUserById(
        $id: ID!
        ${updateData.fantasy_user_id !== undefined ? '$fantasy_user_id: String' : ''}
        ${updateData.shop_enabled !== undefined ? '$shop_enabled: Boolean' : ''}
        ${updateData.fantasy_enabled !== undefined ? '$fantasy_enabled: Boolean' : ''}
        ${updateData.modules !== undefined ? '$modules: [String!]' : ''}
      ) {
        updateUser(
          where: { id: $id }
          data: {
            ${dataFields.join('\n            ')}
          }
        ) {
          id
          mobile
          fullname
          email
          authKey
          status
        }
        publishUser(where: { id: $id }) {
          id
        }
      }
    `;
    
    const data = await hygraphClient.mutate(mutation, variables);
    return data.updateUser;
  }

  // Find user by ID
  async findUserById(userId) {
    const query = `
      query GetUserById($id: ID!) {
        user(where: { id: $id }) {
          id
          mobile
          fullname
          email
          authKey
          refreshToken
          status
          image
          deviceId
          lastLogin
          createdAt
          fantasy_user_id
        }
      }
    `;
    
    const data = await hygraphClient.query(query, { id: userId });
    return data.user;
  }
}

module.exports = new HygraphUserService();
