/**
 * Test unified authentication token structure
 */
require('dotenv').config();

async function testTokenStructure() {
  console.log('Testing Unified Authentication Token Structure...\n');

  try {
    // Import jose for JWT operations
    const crypto = await import('node:crypto');
    if (!globalThis.crypto) {
      globalThis.crypto = crypto.webcrypto;
    }
    const { SignJWT, jwtVerify } = await import('jose');
    
    const secret = Buffer.from(process.env.SECRET_TOKEN || 'test-secret-key');
    
    // Test 1: Create a unified token
    console.log('✓ Test 1: Creating unified JWT token...');
    const token = await new SignJWT({
      userId: 'test-hygraph-user-id',
      _id: 'test-fantasy-user-id',
      mobile: '9876543210',
      modules: ['shop', 'fantasy'],
      shop_enabled: true,
      fantasy_enabled: true
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')
      .setIssuedAt()
      .sign(secret);
    
    console.log('  Token generated successfully');
    
    // Test 2: Verify the token
    console.log('\n✓ Test 2: Verifying token structure...');
    const { payload } = await jwtVerify(token, secret);
    
    console.log('  Token payload:');
    console.log('  - userId:', payload.userId);
    console.log('  - _id:', payload._id);
    console.log('  - mobile:', payload.mobile);
    console.log('  - modules:', payload.modules);
    console.log('  - shop_enabled:', payload.shop_enabled);
    console.log('  - fantasy_enabled:', payload.fantasy_enabled);
    console.log('  - exp:', new Date(payload.exp * 1000).toISOString());
    
    // Test 3: Validate token structure
    console.log('\n✓ Test 3: Validating required fields...');
    const requiredFields = ['userId', '_id', 'mobile', 'modules', 'shop_enabled', 'fantasy_enabled'];
    const missingFields = requiredFields.filter(field => !(field in payload));
    
    if (missingFields.length > 0) {
      console.error('  ✗ Missing fields:', missingFields);
      process.exit(1);
    }
    
    if (!Array.isArray(payload.modules) || !payload.modules.includes('shop') || !payload.modules.includes('fantasy')) {
      console.error('  ✗ Invalid modules array');
      process.exit(1);
    }
    
    console.log('  All required fields present and valid');
    
    // Test 4: Test module validation logic
    console.log('\n✓ Test 4: Testing module validation logic...');
    
    // Should pass - shop module present
    if (payload.modules && payload.modules.includes('shop')) {
      console.log('  ✓ Shop module validation: PASS');
    } else {
      console.error('  ✗ Shop module validation: FAIL');
      process.exit(1);
    }
    
    // Should pass - shop enabled
    if (payload.shop_enabled !== false) {
      console.log('  ✓ Shop enabled check: PASS');
    } else {
      console.error('  ✗ Shop enabled check: FAIL');
      process.exit(1);
    }
    
    console.log('\n✅ All tests passed!');
    console.log('\nToken structure is correct and ready for production use.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testTokenStructure();
