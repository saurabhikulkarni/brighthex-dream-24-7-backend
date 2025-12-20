/**
 * Test Hygraph Connection
 * This script tests the Hygraph connection and tries to create a payment
 */

require('dotenv').config();
const axios = require('axios');

async function testHygraph() {
  console.log('\n=== Testing Hygraph Connection ===\n');
  
  const endpoint = process.env.HYGRAPH_ENDPOINT;
  const token = process.env.HYGRAPH_TOKEN;
  
  console.log('Configuration:');
  console.log('  Endpoint:', endpoint || 'NOT SET');
  console.log('  Token:', token ? 'SET' : 'NOT SET (optional)\n');
  
  if (!endpoint) {
    console.error('❌ HYGRAPH_ENDPOINT not configured in .env');
    return;
  }
  
  // Test 1: Simple schema query
  console.log('Test 1: Checking GraphQL endpoint...');
  try {
    const testQuery = `
      query {
        __typename
      }
    `;
    
    const response = await axios.post(
      endpoint,
      { query: testQuery },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        timeout: 10000
      }
    );
    
    if (response.data.errors) {
      console.error('❌ GraphQL Errors:', JSON.stringify(response.data.errors, null, 2));
    } else {
      console.log('✅ GraphQL endpoint is accessible');
      console.log('   Response:', JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.error('❌ Connection failed:');
    console.error('   Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    return;
  }
  
  // Test 2: Try to create a payment (this will likely fail with schema errors, but shows us what's wrong)
  console.log('\nTest 2: Testing payment creation mutation...');
  const testUserId = 'cmje1j9900v5j07ploqi5n9uq';
  const testMutation = `
    mutation CreatePayment(
      $userId: ID!,
      $razorpayOrderId: String!,
      $amount: Float!,
      $currency: String!,
      $paymentStatus: PaymentStatus!
    ) {
      createPayment(
        data: {
          userDetail: {connect: {id: $userId}}
          razorpayOrderId: $razorpayOrderId
          amount: $amount
          currency: $currency
          paymentStatus: $paymentStatus
        }
      ) {
        id
        razorpayOrderId
        amount
        currency
        paymentStatus
      }
    }
  `;
  
  try {
    const response = await axios.post(
      endpoint,
      {
        query: testMutation,
        variables: {
          userId: testUserId,
          razorpayOrderId: 'order_TEST_' + Date.now(),
          amount: 150.0, // In rupees (not paise)
          currency: 'INR',
          paymentStatus: 'PENDING'
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        timeout: 10000
      }
    );
    
    if (response.data.errors) {
      console.error('❌ Mutation Errors:');
      response.data.errors.forEach(err => {
        console.error('   -', err.message);
        if (err.extensions) {
          console.error('     Extensions:', JSON.stringify(err.extensions, null, 2));
        }
      });
    } else if (response.data.data?.createPayment) {
      console.log('✅ Payment created successfully!');
      console.log('   Payment:', JSON.stringify(response.data.data.createPayment, null, 2));
    } else {
      console.log('⚠️  Unexpected response:', JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.error('❌ Mutation failed:');
    console.error('   Error:', error.message);
    if (error.response?.data) {
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  console.log('\n=== Test Complete ===\n');
}

testHygraph().catch(console.error);
