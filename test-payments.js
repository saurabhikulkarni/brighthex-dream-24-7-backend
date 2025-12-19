/**
 * Test script for Razorpay payment endpoints
 * 
 * Usage:
 * 1. Make sure your .env file has RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET
 * 2. Start your server: npm run dev
 * 3. Run this script: node test-payments.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/payments';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testCreateOrder() {
  log('\n📦 Testing: Create Order', 'cyan');
  log('─'.repeat(50), 'cyan');
  
  try {
    const response = await axios.post(`${BASE_URL}/create-order`, {
      amount: 100, // ₹1.00 (100 paise)
      currency: 'INR',
      receipt: `test_receipt_${Date.now()}`,
      notes: {
        test: true,
        description: 'Test payment order'
      }
    });

    if (response.data.success) {
      log('✅ Order created successfully!', 'green');
      log(`   Order ID: ${response.data.order.id}`, 'blue');
      log(`   Amount: ₹${response.data.order.amount / 100}`, 'blue');
      log(`   Status: ${response.data.order.status}`, 'blue');
      return response.data.order;
    } else {
      log('❌ Failed to create order', 'red');
      log(`   Error: ${response.data.message}`, 'red');
      return null;
    }
  } catch (error) {
    log('❌ Error creating order', 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Message: ${error.response.data.message}`, 'red');
    } else {
      log(`   Error: ${error.message}`, 'red');
    }
    return null;
  }
}

async function testVerifyPayment(paymentId, orderId, signature) {
  log('\n🔍 Testing: Verify Payment (via API)', 'cyan');
  log('─'.repeat(50), 'cyan');
  
  if (!paymentId) {
    log('⚠️  Skipping - No payment ID provided', 'yellow');
    log('   This test requires a real payment ID from Razorpay', 'yellow');
    return;
  }

  try {
    const params = new URLSearchParams({ payment_id: paymentId });
    if (orderId) params.append('order_id', orderId);
    if (signature) params.append('razorpay_signature', signature);

    const response = await axios.get(`${BASE_URL}/verify-payment?${params.toString()}`);

    if (response.data.success) {
      log('✅ Payment verified successfully!', 'green');
      log(`   Payment ID: ${response.data.payment.id}`, 'blue');
      log(`   Status: ${response.data.payment.status}`, 'blue');
      log(`   Amount: ₹${response.data.payment.amount / 100}`, 'blue');
      if (response.data.signature_verified !== null) {
        log(`   Signature Verified: ${response.data.signature_verified}`, 
            response.data.signature_verified ? 'green' : 'red');
      }
    } else {
      log('❌ Payment verification failed', 'red');
      log(`   Message: ${response.data.message}`, 'red');
    }
  } catch (error) {
    log('❌ Error verifying payment', 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Message: ${error.response.data.message}`, 'red');
    } else {
      log(`   Error: ${error.message}`, 'red');
    }
  }
}

async function testVerifySignature(orderId, paymentId, signature) {
  log('\n🔐 Testing: Verify Signature', 'cyan');
  log('─'.repeat(50), 'cyan');
  
  if (!orderId || !paymentId || !signature) {
    log('⚠️  Skipping - Missing required parameters', 'yellow');
    log('   This test requires orderId, paymentId, and signature from Razorpay', 'yellow');
    return;
  }

  try {
    const response = await axios.post(`${BASE_URL}/verify-signature`, {
      orderId,
      paymentId,
      signature
    });

    if (response.data.verified) {
      log('✅ Signature verified successfully!', 'green');
    } else {
      log('❌ Invalid signature', 'red');
      log(`   Message: ${response.data.message}`, 'red');
    }
  } catch (error) {
    log('❌ Error verifying signature', 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Message: ${error.response.data.message}`, 'red');
    } else {
      log(`   Error: ${error.message}`, 'red');
    }
  }
}

async function testWebhook() {
  log('\n🔔 Testing: Webhook Endpoint', 'cyan');
  log('─'.repeat(50), 'cyan');
  
  // Simulate a webhook event (without signature for testing)
  const mockWebhookEvent = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_test123',
          order_id: 'order_test123',
          amount: 10000,
          currency: 'INR',
          status: 'captured'
        }
      }
    }
  };

  try {
    const response = await axios.post(`${BASE_URL}/webhook`, mockWebhookEvent, {
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'test_signature' // Will be ignored if no secret configured
      }
    });

    if (response.data.success) {
      log('✅ Webhook processed successfully!', 'green');
      log('   Note: This is a mock webhook. Real webhooks come from Razorpay.', 'yellow');
    } else {
      log('❌ Webhook processing failed', 'red');
      log(`   Message: ${response.data.message}`, 'red');
    }
  } catch (error) {
    if (error.response && error.response.status === 400) {
      log('⚠️  Webhook signature verification failed (expected if secret is configured)', 'yellow');
    } else {
      log('❌ Error processing webhook', 'red');
      if (error.response) {
        log(`   Status: ${error.response.status}`, 'red');
        log(`   Message: ${error.response.data.message}`, 'red');
      } else {
        log(`   Error: ${error.message}`, 'red');
      }
    }
  }
}

async function checkServer() {
  log('\n🏥 Checking Server Health', 'cyan');
  log('─'.repeat(50), 'cyan');
  
  try {
    const response = await axios.get('http://localhost:3000/health');
    if (response.data.status === 'ok') {
      log('✅ Server is running!', 'green');
      return true;
    }
  } catch (error) {
    log('❌ Server is not running!', 'red');
    log('   Please start the server first: npm run dev', 'yellow');
    return false;
  }
}

async function runTests() {
  log('\n🧪 Razorpay Payment Endpoints Test Suite', 'blue');
  log('='.repeat(50), 'blue');

  // Check if server is running
  const serverRunning = await checkServer();
  if (!serverRunning) {
    process.exit(1);
  }

  // Test 1: Create Order
  const order = await testCreateOrder();

  // Test 2: Webhook (mock)
  await testWebhook();

  // Test 3: Verify Payment (requires real payment ID)
  // Uncomment and add real payment ID to test:
  // await testVerifyPayment('pay_xxxxxxxxxxxxx', 'order_xxxxxxxxxxxxx', 'signature_xxx');

  // Test 4: Verify Signature (requires real payment data)
  // Uncomment and add real data to test:
  // await testVerifySignature('order_xxx', 'pay_xxx', 'signature_xxx');

  log('\n📝 Next Steps:', 'cyan');
  log('─'.repeat(50), 'cyan');
  if (order) {
    log(`1. Use Order ID: ${order.id}`, 'blue');
    log('2. Go to Razorpay Checkout and complete a test payment', 'blue');
    log('3. After payment, you\'ll get payment_id and signature', 'blue');
    log('4. Test verify-payment endpoint with those values', 'blue');
    log('5. Or test verify-signature endpoint', 'blue');
  }
  log('\n✨ Test suite completed!', 'green');
}

// Run tests
runTests().catch(console.error);

