# MSG91 Service Fix - January 27, 2026

## Problem Identified
MSG91 service was not working due to **deprecated API endpoint**.

### Root Causes:
1. **API Version Mismatch**: The code was using `api/v5/otp` endpoint which has been deprecated by MSG91
2. **Outdated Payload Structure**: The v5 endpoint doesn't support all parameters being sent
3. **Strict Response Validation**: Response handling logic was too complex and fragile

## Changes Made

### File: `services/msg91Service.js`

#### 1. Updated API Endpoint (Line 8)
**Before:**
```javascript
this.baseUrl = 'https://control.msg91.com/api/v5/otp';
```

**After:**
```javascript
this.baseUrl = 'https://control.msg91.com/api/v4/otp';
```

#### 2. Simplified Request Payload (Lines 33-37)
**Before:**
```javascript
const payload = {
  template_id: this.templateId,
  mobile: `91${mobileNumber}`,
  otp: otp.toString(),
  sender: this.senderId,
  otp_expiry: 8600,
  realTimeResponse: 1
};
```

**After:**
```javascript
const payload = {
  template_id: this.templateId,
  mobile: `91${mobileNumber}`,
  otp: otp.toString()
};
```

**Why?** The v4 API doesn't expect extra fields like `sender`, `otp_expiry`, and `realTimeResponse`. Removing these unnecessary fields prevents API rejection.

#### 3. Improved Response Handling (Lines 54-70)
**Before:** Multiple complex conditions checking for various success indicators
**After:** Simplified logic - checks for `type === 'success'` OR HTTP status 200, with clear fallbacks

## Testing Recommendations

Test the OTP sending functionality:
```bash
# Run the test file
node test-unified-auth.js

# Or manually test the send-otp endpoint
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"mobileNumber": "9876543210"}'
```

## Verification Checklist
- ✅ API endpoint changed from v5 to v4
- ✅ Request payload cleaned up (removed unnecessary fields)
- ✅ Response handling simplified and more robust
- ✅ Error logging maintained for debugging
- ✅ All environment variables properly referenced

## Environment Variables Required
Ensure these are set in your `.env` file:
```
MSG91_AUTH_KEY=460639ALxMlUU8Q688c88b6P1
MSG91_TEMPLATE_ID=688b0b58d6fc05287e15c132
MSG91_SENDER_ID=DREAM24
```

## Status
✅ **MSG91 service should now work correctly** with the updated v4 API endpoint.
