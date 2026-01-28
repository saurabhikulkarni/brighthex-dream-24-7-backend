const axios = require('axios');

// Hygraph GraphQL configuration
const HYGRAPH_ENDPOINT = process.env.HYGRAPH_ENDPOINT || 'https://api-us-east-1-shared-usea-07d3c0ccdab2.hygraph.com/graphql';
const HYGRAPH_AUTH_TOKEN = process.env.HYGRAPH_AUTH_TOKEN;

/**
 * Execute GraphQL query/mutation against Hygraph
 * @param {string} query - GraphQL query or mutation string
 * @param {object} variables - Variables for the query
 * @returns {Promise<object>} Response data from Hygraph
 */
async function executeGraphQL(query, variables = {}) {
  if (!HYGRAPH_ENDPOINT || !HYGRAPH_AUTH_TOKEN) {
    throw new Error('Hygraph credentials not configured. Set HYGRAPH_ENDPOINT and HYGRAPH_AUTH_TOKEN');
  }

  try {
    const response = await axios.post(
      HYGRAPH_ENDPOINT,
      {
        query,
        variables
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${HYGRAPH_AUTH_TOKEN}`
        },
        timeout: 30000
      }
    );

    if (response.data.errors) {
      console.error('❌ GraphQL Errors:', JSON.stringify(response.data.errors, null, 2));
      throw new Error(`GraphQL Error: ${response.data.errors.map(e => e.message).join(', ')}`);
    }

    return response.data.data;
  } catch (error) {
    console.error('❌ Hygraph GraphQL Error:', error.message);
    throw error;
  }
}

module.exports = {
  executeGraphQL
};
