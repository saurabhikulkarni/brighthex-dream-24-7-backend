/**
 * Check Hygraph Schema to see what enums and types are available
 */

require('dotenv').config();
const axios = require('axios');

async function checkSchema() {
  console.log('\n=== Checking Hygraph Schema ===\n');
  
  const endpoint = process.env.HYGRAPH_ENDPOINT;
  
  if (!endpoint) {
    console.error('❌ HYGRAPH_ENDPOINT not configured');
    return;
  }
  
  // Query the schema for Payment and Order types
  const schemaQuery = `
    query IntrospectionQuery {
      __schema {
        types {
          name
          kind
          enumValues {
            name
          }
          fields {
            name
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    }
  `;
  
  try {
    console.log('Fetching schema...');
    const response = await axios.post(
      endpoint,
      { query: schemaQuery },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );
    
    if (response.data.errors) {
      console.error('❌ Errors:', JSON.stringify(response.data.errors, null, 2));
      return;
    }
    
    const types = response.data.data.__schema.types;
    
    // Find Payment and Order types
    console.log('\n=== Payment Type ===');
    const paymentType = types.find(t => t.name === 'Payment');
    if (paymentType) {
      console.log('Payment fields:');
      paymentType.fields?.forEach(field => {
        const typeName = field.type.name || field.type.ofType?.name || field.type.kind;
        console.log(`  - ${field.name}: ${typeName}`);
      });
    } else {
      console.log('Payment type not found');
    }
    
    // Find PaymentStatus enum
    console.log('\n=== PaymentStatus Enum ===');
    const paymentStatusEnum = types.find(t => t.name === 'PaymentStatus');
    if (paymentStatusEnum && paymentStatusEnum.enumValues) {
      console.log('PaymentStatus values:');
      paymentStatusEnum.enumValues.forEach(val => {
        console.log(`  - ${val.name}`);
      });
    } else {
      console.log('PaymentStatus enum not found');
      // Check for similar enums
      const statusEnums = types.filter(t => t.kind === 'ENUM' && t.name.toLowerCase().includes('status'));
      if (statusEnums.length > 0) {
        console.log('\nFound status-related enums:');
        statusEnums.forEach(e => {
          console.log(`  - ${e.name}: ${e.enumValues?.map(v => v.name).join(', ')}`);
        });
      }
    }
    
    // Find Order type
    console.log('\n=== Order Type ===');
    const orderType = types.find(t => t.name === 'Order');
    if (orderType) {
      console.log('Order fields:');
      orderType.fields?.forEach(field => {
        const typeName = field.type.name || field.type.ofType?.name || field.type.kind;
        console.log(`  - ${field.name}: ${typeName}`);
      });
    } else {
      console.log('Order type not found');
    }
    
    // Find OrderStatus enum
    console.log('\n=== OrderStatus Enum ===');
    const orderStatusEnum = types.find(t => t.name === 'OrderStatus');
    if (orderStatusEnum && orderStatusEnum.enumValues) {
      console.log('OrderStatus values:');
      orderStatusEnum.enumValues.forEach(val => {
        console.log(`  - ${val.name}`);
      });
    } else {
      console.log('OrderStatus enum not found');
    }
    
    // Check createPayment mutation signature
    console.log('\n=== createPayment Mutation ===');
    const mutationType = types.find(t => t.name === 'Mutation');
    if (mutationType) {
      const createPayment = mutationType.fields?.find(f => f.name === 'createPayment');
      if (createPayment) {
        console.log('createPayment arguments:');
        // We need to check the input type
        const inputType = createPayment.args?.find(a => a.name === 'data')?.type;
        if (inputType) {
          const inputTypeName = inputType.name || inputType.ofType?.name;
          const paymentInputType = types.find(t => t.name === inputTypeName);
          if (paymentInputType && paymentInputType.inputFields) {
            paymentInputType.inputFields.forEach(field => {
              const typeName = field.type.name || field.type.ofType?.name || field.type.kind;
              console.log(`  - ${field.name}: ${typeName}`);
            });
          }
        }
      } else {
        console.log('createPayment mutation not found');
      }
    }
    
  } catch (error) {
    console.error('❌ Failed to fetch schema:');
    console.error('   Error:', error.message);
    if (error.response?.data) {
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  console.log('\n=== Schema Check Complete ===\n');
}

checkSchema().catch(console.error);
