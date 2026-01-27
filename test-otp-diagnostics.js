#!/usr/bin/env node
/**
 * OTP Storage Diagnostics Tool
 * Helps debug OTP session issues
 */

const otpService = require('./services/otpService');

// Mock the otpService to access internal storage
const crypto = require('crypto');

// Manually implement test
async function runDiagnostics() {
  console.log('🔍 OTP Service Diagnostics\n');
  
  // Test 1: Generate and store OTP
  console.log('Test 1: Generate and Store OTP');
  const testMobile = '9876543210';
  const testOtp = otpService.generateOtp();
  const sessionId = await otpService.storeOtp(testMobile, testOtp);
  
  console.log('✅ Generated:', testOtp);
  console.log('✅ Session ID:', sessionId);
  console.log('✅ Mobile:', testMobile);
  
  // Test 2: Verify with correct OTP and sessionId
  console.log('\nTest 2: Verify with correct OTP and sessionId');
  const result1 = await otpService.verifyOtp(testMobile, testOtp, sessionId);
  console.log('✅ Result:', result1);
  
  // Test 3: Store another OTP and verify by mobile number only
  console.log('\nTest 3: Verify by mobile number (no sessionId)');
  const testMobile2 = '8765432109';
  const testOtp2 = otpService.generateOtp();
  const sessionId2 = await otpService.storeOtp(testMobile2, testOtp2);
  
  console.log('✅ Generated:', testOtp2);
  console.log('✅ Mobile:', testMobile2);
  
  const result2 = await otpService.verifyOtp(testMobile2, testOtp2, null); // No sessionId
  console.log('✅ Result:', result2);
  
  // Test 4: Invalid OTP
  console.log('\nTest 4: Verify with invalid OTP');
  const testMobile3 = '7654321098';
  const testOtp3 = otpService.generateOtp();
  const sessionId3 = await otpService.storeOtp(testMobile3, testOtp3);
  
  const result3 = await otpService.verifyOtp(testMobile3, '000000', sessionId3);
  console.log('❌ Result:', result3);
  
  // Test 5: Mobile number mismatch
  console.log('\nTest 5: Verify with mismatched mobile number');
  const result4 = await otpService.verifyOtp('1111111111', testOtp3, sessionId3);
  console.log('❌ Result:', result4);
  
  console.log('\n✅ All diagnostics complete!');
}

runDiagnostics().catch(console.error);
