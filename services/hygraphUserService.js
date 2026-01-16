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
          status
          image
          deviceId
          lastLogin
          createdAt
          updatedAt
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

  // Update user
  async updateUser(mobile, updateData) {
    const mutation = `
      mutation UpdateUser(
        $mobile: String!
        $authKey: String
        $deviceId: String
        $fullname: String
        $email: String
        $lastLogin: DateTime
      ) {
        updateUser(
          where: { mobile: $mobile }
          data: {
            ${updateData.authKey ? 'authKey: $authKey' : ''}
            ${updateData.deviceId ? 'deviceId: $deviceId' : ''}
            ${updateData.fullname !== undefined ? 'fullname: $fullname' : ''}
            ${updateData.email !== undefined ? 'email: $email' : ''}
            ${updateData.lastLogin ? 'lastLogin: $lastLogin' : ''}
          }
        ) {
          id
          mobile
          fullname
          email
          authKey
          status
        }
        publishUser(where: { mobile: $mobile }) {
          id
        }
      }
    `;
    
    const variables = {
      mobile: mobile.toString(),
      ...updateData
    };
    
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
          status
          image
          deviceId
          lastLogin
          createdAt
        }
      }
    `;
    
    const data = await hygraphClient.query(query, { id: userId });
    return data.user;
  }
}

module.exports = new HygraphUserService();
