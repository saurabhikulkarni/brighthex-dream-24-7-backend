const axios = require('axios');

const HYGRAPH_ENDPOINT = process.env.HYGRAPH_ENDPOINT;
const HYGRAPH_TOKEN = process.env.HYGRAPH_TOKEN; // Mutation token

// Validate configuration on startup
if (!HYGRAPH_ENDPOINT) {
  console.error('❌ CRITICAL: HYGRAPH_ENDPOINT not configured in .env');
  console.error('   User creation will FAIL until this is fixed.');
} else if (HYGRAPH_ENDPOINT.includes('.cdn.')) {
  console.error('❌ CRITICAL: Using CDN endpoint which is READ-ONLY!');
  console.error('   Current: ' + HYGRAPH_ENDPOINT);
  console.error('   Required: Use api- endpoint for mutations (user creation)');
  console.error('   Example: https://api-ap-south-1.hygraph.com/v2/{PROJECT_ID}/master');
  console.error('   User creation will FAIL until this is fixed.');
} else {
  console.log('✅ Hygraph endpoint configured:', HYGRAPH_ENDPOINT);
}

if (!HYGRAPH_TOKEN) {
  console.error('❌ CRITICAL: HYGRAPH_TOKEN not configured in .env');
  console.error('   Mutations (create/update/delete) will FAIL without a token.');
  console.error('   Get token from: Hygraph Dashboard → Settings → API Access → Permanent Auth Tokens');
} else {
  console.log('✅ Hygraph token configured');
}

// GraphQL client for Hygraph
const hygraphClient = {
  async query(query, variables = {}) {
    try {
      // Pre-flight validation
      if (!HYGRAPH_ENDPOINT) {
        throw new Error('HYGRAPH_ENDPOINT not configured. Set it in .env file.');
      }
      
      if (HYGRAPH_ENDPOINT.includes('.cdn.') && query.trim().toLowerCase().startsWith('mutation')) {
        throw new Error('Cannot run mutations on CDN endpoint. Use api- endpoint instead.');
      }

      const response = await axios.post(
        HYGRAPH_ENDPOINT,
        { query, variables },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(HYGRAPH_TOKEN && { Authorization: `Bearer ${HYGRAPH_TOKEN}` })
          }
        }
      );
      
      if (response.data.errors) {
        console.error('Hygraph GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
        console.error('Full response:', JSON.stringify(response.data, null, 2));
        throw new Error(response.data.errors[0].message);
      }
      
      return response.data.data;
    } catch (error) {
      // Check if this is an axios error with response data
      if (error.response && error.response.data && error.response.data.errors) {
        console.error('Hygraph API errors:', JSON.stringify(error.response.data.errors, null, 2));
        console.error('Status code:', error.response.status);
      }
      console.error('Hygraph request failed:', error.message);
      throw error;
    }
  },

  async mutate(mutation, variables = {}) {
    // Additional validation for mutations
    if (!HYGRAPH_TOKEN) {
      throw new Error('HYGRAPH_TOKEN is required for mutations. Set it in .env file.');
    }
    
    if (HYGRAPH_ENDPOINT && HYGRAPH_ENDPOINT.includes('.cdn.')) {
      throw new Error('CDN endpoint does not support mutations. Use api- endpoint: https://api-ap-south-1.hygraph.com/v2/{PROJECT_ID}/master');
    }
    
    return this.query(mutation, variables);
  }
};

module.exports = hygraphClient;
