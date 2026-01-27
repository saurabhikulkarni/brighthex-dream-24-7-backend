# OTP Session Not Found - Fix & Solution

## Problem Summary
Users were receiving OTP successfully but getting **"OTP session not found"** error during verification.

## Root Causes

### 1. **Missing Session ID in Verification Request**
- Frontend may not be passing `sessionId` to the `/verify-otp` endpoint
- Service had no fallback when `sessionId` was missing

### 2. **Mobile Number Format Inconsistency**
- `send-otp`: Cleans number with `replace(/\D/g, '').trim()`
- `verify-otp`: Was also cleaning but had issues with leading zeros or country codes

### 3. **No Session ID Return from Verification**
- After verification succeeded, the `sessionId` was not returned from `verifyOtp()`
- Made it impossible to delete the OTP after successful login

### 4. **Insufficient Debug Logging**
- No way to track what was happening during OTP verification
- Difficult to diagnose mismatches

## Changes Made

### 1. **Enhanced OTP Service** (`services/otpService.js`)

#### Added comprehensive logging:
```javascript
console.log('🔍 verifyOtp called with:', {
  mobileNumber,
  otp: '***',
  sessionId: sessionId ? 'provided' : 'NOT provided',
  storageSize: otpStorage.size
});
```

#### Improved fallback mechanism:
- If `sessionId` is provided, use it (fast path)
- If not found or not provided, search by mobile number (fallback)
- Return the actual `sessionId` used for successful verification

#### Added session ID to return value:
```javascript
return {
  verified: true,
  message: 'OTP verified successfully',
  sessionId: foundSessionId  // NEW: Return the session ID
};
```

### 2. **Enhanced Auth Route** (`routes/auth.js`)

#### Improved verify-otp endpoint:
- Added debug logging for all inputs
- Show if sessionId was provided or not
- Show cleaned mobile number length

#### Proper session ID deletion:
```javascript
const finalSessionId = verificationResult.sessionId || sessionId;
if (finalSessionId) {
  console.log('🗑️  Deleting OTP session:', finalSessionId.substring(0, 10) + '...');
  await otpService.deleteOtp(finalSessionId);
}
```

## How OTP Flow Now Works

### Send OTP:
```
1. User sends: { mobileNumber: "98 7654 3210" }
2. Clean to: "9876543210" (10 digits)
3. Store with sessionId: "abc123def456..."
4. Send SMS via MSG91
5. Return: { sessionId: "abc123def456..." }
```

### Verify OTP:
```
1. Frontend sends: { mobileNumber, otp, sessionId }
2. Log: "sessionId provided: yes/no"
3. Look up by sessionId first (fast)
4. If not found, fallback to mobile number search
5. Verify OTP matches
6. Return: { verified: true, sessionId: "..." }
7. Delete OTP from storage using returned sessionId
```

## Debugging OTP Issues

### Check Storage Size
When you see "OTP session not found", check logs for:
```
storageSize: X
storageKeys: ["abc...", "def...", "ghi..."]
```

### Verify Mobile Number Format
Ensure both endpoints receive and clean consistently:
```javascript
const cleanNumber = mobileNumber.replace(/\D/g, '').trim();
// Must be exactly 10 digits, starting with 6-9
```

### Session ID Mismatch
If frontend didn't receive sessionId during send-otp:
```javascript
// Old (wrong):
res.json({ success: true, message: 'OTP sent' });

// New (correct):
res.json({ success: true, message: 'OTP sent', sessionId: sessionId });
```

## Frontend Requirements

### When calling send-otp:
```javascript
const response = await fetch('/api/auth/send-otp', {
  method: 'POST',
  body: JSON.stringify({ mobileNumber })
});

const data = await response.json();
// IMPORTANT: Save the sessionId!
const sessionId = data.sessionId;
```

### When calling verify-otp:
```javascript
const response = await fetch('/api/auth/verify-otp', {
  method: 'POST',
  body: JSON.stringify({
    mobileNumber,
    otp,
    sessionId  // IMPORTANT: Send the sessionId back!
  })
});
```

## Testing

### Run Diagnostics:
```bash
node test-otp-diagnostics.js
```

This will test:
- ✅ Generate and store OTP
- ✅ Verify with sessionId
- ✅ Verify without sessionId (fallback)
- ✅ Invalid OTP handling
- ✅ Mobile number mismatch handling

### Manual Testing:

1. **Send OTP:**
```bash
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"mobileNumber": "9876543210"}'
```

Response should include `sessionId`:
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "sessionId": "a1b2c3d4e5f6..."
}
```

2. **Verify OTP:**
```bash
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "mobileNumber": "9876543210",
    "otp": "123456",
    "sessionId": "a1b2c3d4e5f6..."
  }'
```

Response should include verified user data and tokens.

## Key Log Messages to Look For

### Success:
```
✅ OTP verified successfully - sessionId: abc...
🗑️  Deleting OTP session: abc...
✅ User login successful
```

### Issues:
```
🔍 Looking up by sessionId: abc... Found: false
🔄 Fallback: searching by mobile number...
❌ OTP session not found (storageSize: 0)
❌ Invalid OTP (attempts: 1/5)
❌ Mobile number mismatch
⏱️  OTP expired
```

## Environment Check

Ensure `.env` has all required variables:
```
MSG91_AUTH_KEY=your_key
MSG91_TEMPLATE_ID=your_template
MSG91_SENDER_ID=your_sender
SECRET_TOKEN=your_jwt_secret
```

## Status
✅ **Fixed** - OTP session not found issue resolved with improved fallback and logging
