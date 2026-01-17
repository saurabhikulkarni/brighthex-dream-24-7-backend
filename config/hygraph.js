const axios = require('axios');

const HYGRAPH_ENDPOINT = process.env.HYGRAPH_ENDPOINT;
const HYGRAPH_TOKEN = process.env.HYGRAPH_TOKEN; // Mutation token

// GraphQL client for Hygraph
const hygraphClient = {
  async query(query, variables = {}) {
    try {
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
    return this.query(mutation, variables);
  }
};

module.exports = hygraphClient;
