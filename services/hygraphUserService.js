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
          modules
          shopEnabled
          fantasyEnabled
          fantasyUserId
          shopTokens
        }
      }
    `;
    
    try {
      console.log(`🔍 Finding user by mobile: ${mobile}`);
      const data = await hygraphClient.query(query, { mobileNumber: mobile.toString() });
      
      if (data.userDetails && data.userDetails.length > 0) {
        console.log(`✅ User found in Hygraph: ${data.userDetails[0].id}`);
        return data.userDetails[0];
      }
      
      console.log(`📭 No user found with mobile: ${mobile}`);
      return null;
    } catch (error) {
      // If mobileNumber filter doesn't work, try fetching all and filtering client-side
      console.warn('⚠️ findUserByMobile with where clause failed, trying fallback:', error.message);
      
      try {
        const fallbackQuery = `
          query GetAllUsers {
            userDetails(first: 500) {
              id
              mobileNumber
              firstName
              lastName
              username
              modules
              shopEnabled
              fantasyEnabled
              fantasyUserId
              shopTokens
            }
          }
        `;
        
        const fallbackData = await hygraphClient.query(fallbackQuery);
        const user = fallbackData.userDetails?.find(u => u.mobileNumber === mobile.toString());
        
        if (user) {
          console.log(`✅ User found via fallback: ${user.id}`);
          return user;
        }
        
        console.log(`📭 No user found via fallback for mobile: ${mobile}`);
        return null;
      } catch (fallbackError) {
        // Fallback also failed - log but DON'T throw
        // Return null so verify-otp will try to create user
        console.error('❌ Both findUserByMobile queries failed:', {
          primaryError: error.message,
          fallbackError: fallbackError.message
        });
        // Return null - let the caller decide what to do
        return null;
      }
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
          modules
          shopEnabled
          fantasyEnabled
          fantasyUserId
          shopTokens
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
      console.error('❌ HYGRAPH USER CREATION FAILED:', {
        errorMessage: error.message,
        statusCode: error.response?.status,
        hygraphErrors: error.response?.data?.errors,
        endpoint: process.env.HYGRAPH_ENDPOINT,
        hasToken: !!process.env.HYGRAPH_TOKEN,
        userData: {
          mobile: userData.mobile,
          firstName: userData.firstName,
          lastName: userData.lastName,
          modules: userData.modules
        }
      });
      
      // Throw error instead of silently failing
      const errorMsg = error.response?.data?.errors?.[0]?.message || error.message;
      throw new Error(`Hygraph user creation failed: ${errorMsg}`);
    }
  }

  // Update user by mobile
  async updateUser(mobile, updateData) {
    // Build data fields dynamically
    const dataFields = [];
    const variables = { mobileNumber: mobile.toString() };
    
    if (updateData.firstName !== undefined) {
      dataFields.push('firstName: $firstName');
      variables.firstName = updateData.firstName;
    }
    if (updateData.lastName !== undefined) {
      dataFields.push('lastName: $lastName');
      variables.lastName = updateData.lastName;
    }
    if (updateData.fantasy_user_id !== undefined) {
      dataFields.push('fantasyUserId: $fantasyUserId');
      variables.fantasyUserId = updateData.fantasy_user_id;
    }
    
    const mutation = `
      mutation UpdateUser(
        $mobileNumber: String!
        ${updateData.firstName !== undefined ? '$firstName: String' : ''}
        ${updateData.lastName !== undefined ? '$lastName: String' : ''}
        ${updateData.fantasy_user_id !== undefined ? '$fantasyUserId: String' : ''}
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
          modules
          shopEnabled
          fantasyEnabled
          fantasyUserId
          shopTokens
        }
      }
    `;
    
    const data = await hygraphClient.mutate(mutation, variables);
    return data.updateUserDetail;
  }

  // Update user by ID (for fantasyUserId and module fields)
  async updateUserById(userId, updateData) {
    // Build data fields dynamically
    const dataFields = [];
    const variables = { id: userId };
    
    if (updateData.fantasy_user_id !== undefined) {
      dataFields.push('fantasyUserId: $fantasyUserId');
      variables.fantasyUserId = updateData.fantasy_user_id;
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
        ${updateData.fantasy_user_id !== undefined ? '$fantasyUserId: String' : ''}
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
          modules
          shopEnabled
          fantasyEnabled
          fantasyUserId
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
          modules
          shopEnabled
          fantasyEnabled
          shopTokens
          fantasyUserId
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