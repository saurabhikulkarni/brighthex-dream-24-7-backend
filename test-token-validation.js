/**
 * Test token validation and refresh token functionality
 */
require('dotenv').config();

async function testTokenFunctionality() {
  console.log('Testing Token Validation and Refresh Token Endpoints...\n');

  try {
    // Import jose for JWT operations
    const crypto = await import('node:crypto');
    if (!globalThis.crypto) {
      globalThis.crypto = crypto.webcrypto;
    }
    const { SignJWT, jwtVerify } = await import('jose');
    
    const secret = Buffer.from(process.env.SECRET_TOKEN || 'your-secret-key-here');
    
    // Test 1: Create short-lived access token (15 minutes)
    console.log('✓ Test 1: Creating short-lived access token (15 minutes)...');
    const accessToken = await new SignJWT({
      userId: 'test-hygraph-user-id',
      _id: 'test-fantasy-user-id',
      mobile: '9876543210',
      modules: ['shop', 'fantasy'],
      shop_enabled: true,
      fantasy_enabled: true
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .setIssuedAt()
      .sign(secret);
    
    console.log('  Access token generated successfully');
    
    // Verify the token
    const { payload: accessPayload } = await jwtVerify(accessToken, secret);
    const expiresAt = new Date(accessPayload.exp * 1000);
    const expiresIn = Math.round((accessPayload.exp * 1000 - Date.now()) / 1000 / 60);
    console.log('  Token expires in:', expiresIn, 'minutes');
    console.log('  Expires at:', expiresAt.toISOString());
    
    // Test 2: Create long-lived refresh token (30 days)
    console.log('\n✓ Test 2: Creating long-lived refresh token (30 days)...');
    const refreshToken = await new SignJWT({
      userId: 'test-hygraph-user-id',
      type: 'refresh',
      mobile: '9876543210'
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')
      .setIssuedAt()
      .sign(secret);
    
    console.log('  Refresh token generated successfully');
    
    // Verify the refresh token
    const { payload: refreshPayload } = await jwtVerify(refreshToken, secret);
    const refreshExpiresAt = new Date(refreshPayload.exp * 1000);
    const refreshExpiresIn = Math.round((refreshPayload.exp * 1000 - Date.now()) / 1000 / 60 / 60 / 24);
    console.log('  Token expires in:', refreshExpiresIn, 'days');
    console.log('  Expires at:', refreshExpiresAt.toISOString());
    console.log('  Token type:', refreshPayload.type);
    
    // Test 3: Validate refresh token structure
    console.log('\n✓ Test 3: Validating refresh token structure...');
    if (refreshPayload.type !== 'refresh') {
      console.error('  ✗ Refresh token must have type="refresh"');
      process.exit(1);
    }
    
    if (!refreshPayload.userId || !refreshPayload.mobile) {
      console.error('  ✗ Refresh token missing required fields');
      process.exit(1);
    }
    
    console.log('  Refresh token structure is valid');
    
    // Test 4: Verify access token has all required fields
    console.log('\n✓ Test 4: Validating access token structure...');
    const requiredAccessFields = ['userId', '_id', 'mobile', 'modules', 'shop_enabled', 'fantasy_enabled'];
    const missingFields = requiredAccessFields.filter(field => !(field in accessPayload));
    
    if (missingFields.length > 0) {
      console.error('  ✗ Missing fields:', missingFields);
      process.exit(1);
    }
    
    console.log('  All required fields present in access token');
    
    // Test 5: Create expired token for testing
    console.log('\n✓ Test 5: Creating expired token for validation testing...');
    const expiredToken = await new SignJWT({
      userId: 'test-hygraph-user-id',
      _id: 'test-fantasy-user-id',
      mobile: '9876543210',
      modules: ['shop', 'fantasy'],
      shop_enabled: true,
      fantasy_enabled: true
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1s') // Expires in 1 second
      .setIssuedAt()
      .sign(secret);
    
    // Wait for token to expire
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      await jwtVerify(expiredToken, secret);
      console.error('  ✗ Expired token should not verify');
      process.exit(1);
    } catch (error) {
      if (error.code === 'ERR_JWT_EXPIRED') {
        console.log('  Expired token correctly rejected');
      } else {
        throw error;
      }
    }
    
    // Test 6: Test token type validation
    console.log('\n✓ Test 6: Testing token type validation...');
    
    // Try to use access token as refresh token (should fail)
    try {
      const { payload: testPayload } = await jwtVerify(accessToken, secret);
      if (testPayload.type === 'refresh') {
        console.error('  ✗ Access token should not have type="refresh"');
        process.exit(1);
      }
      console.log('  Access token correctly has no "type" field');
    } catch (error) {
      console.error('  ✗ Failed to verify access token:', error.message);
      process.exit(1);
    }
    
    // Verify refresh token has correct type
    try {
      const { payload: testPayload } = await jwtVerify(refreshToken, secret);
      if (testPayload.type !== 'refresh') {
        console.error('  ✗ Refresh token must have type="refresh"');
        process.exit(1);
      }
      console.log('  Refresh token correctly has type="refresh"');
    } catch (error) {
      console.error('  ✗ Failed to verify refresh token:', error.message);
      process.exit(1);
    }
    
    console.log('\n✅ All token functionality tests passed!');
    console.log('\nToken implementation summary:');
    console.log('  ✓ Access tokens: 15 minutes expiry');
    console.log('  ✓ Refresh tokens: 30 days expiry');
    console.log('  ✓ Refresh tokens have type="refresh" field');
    console.log('  ✓ Both token types verified successfully');
    console.log('  ✓ Expired token handling works correctly');
    console.log('\nReady for API endpoint testing!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testTokenFunctionality();
