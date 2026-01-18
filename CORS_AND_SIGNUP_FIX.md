# CORS & Sign-up User Creation Issues - Diagnostic & Fix

## Issues Identified

### 1. **Hygraph User Creation Failure (Silent Fail)**
**Problem**: When user tries to sign up, the backend tries to create user in Hygraph but:
- Mutation fails silently
- Returns `{ id: null, mobileNumber, ... }`
- User object with `id: null` causes downstream failures
- Frontend doesn't get clear error message

**Root Causes**:
```
❌ HYGRAPH_ENDPOINT not configured
❌ HYGRAPH_TOKEN not configured or invalid
❌ Hygraph mutation name mismatch (createUserDetail vs actual schema)
❌ Hygraph field names mismatch (mobileNumber format, etc.)
❌ Network/firewall blocking Hygraph API calls
```

### 2. **CORS Configuration**
**Current Status**: ✅ Already properly configured in `server.js`
- Allows localhost:59030 (Flutter web)
- Allows Vercel production URLs
- Allows requests with no origin (Postman, mobile)
- Development mode allows any origin

**But CORS errors might show if**:
Frontend is running on different port than configured allowlist

---

## Solution 1: Add Comprehensive Error Logging

Update `services/hygraphUserService.js` to add detailed logging:

```javascript
// In createUser function - REPLACE error handling:

catch (error) {
  console.error('❌ HYGRAPH USER CREATION FAILED:', {
    errorMessage: error.message,
    errorCode: error.response?.status,
    hygraphErrors: error.response?.data?.errors,
    endpoint: process.env.HYGRAPH_ENDPOINT,
    hasToken: !!process.env.HYGRAPH_TOKEN,
    userData: {
      mobile: userData.mobile,
      firstName: userData.firstName,
      lastName: userData.lastName
    }
  });
  
  // IMPORTANT: Don't silently fail - throw error to frontend
  throw new Error(`Failed to create user in Hygraph: ${error.response?.data?.errors?.[0]?.message || error.message}`);
}
```

---

## Solution 2: Verify Hygraph Configuration

### Check 1: Environment Variables
```bash
# In .env file, verify these exist:
HYGRAPH_ENDPOINT=https://api-us-east-1.graphcms.com/v2/{YOUR_PROJECT_ID}/master
HYGRAPH_TOKEN=your-permanent-auth-token
HYGRAPH_MUTATION_TOKEN=your-mutation-token  # If different from HYGRAPH_TOKEN
```

### Check 2: Hygraph Schema Validation
Go to Hygraph console and verify:
1. **Model name**: Should be `userDetail` (NOT `User` or `user`)
2. **Fields exist**: 
   - `mobileNumber` (String, required)
   - `firstName` (String)
   - `lastName` (String)
   - `modules` (String array)
   - `shopEnabled` (Boolean)
   - `fantasyEnabled` (Boolean)

### Check 3: Token Permissions
In Hygraph:
1. Go to Settings → API Access
2. Select your mutation token
3. Verify it has `CREATE` permission on `userDetail` model

---

## Solution 3: Update Error Response in auth.js

Modify `/verify-otp` endpoint to provide clear error messages:

```javascript
// In routes/auth.js, line ~188-191, replace this:

const tempUser = await hygraphUserService.createUser({
  mobile: cleanNumber,
  firstName: req.body.firstName || 'User',
  lastName: req.body.lastName || '',
  status: 'activated',
  deviceId: deviceId || ''
});

user = tempUser;

if (!user || !user.id) {
  console.error('Failed to create user in Hygraph - no ID returned');
  return res.status(500).json({
    success: false,
    message: 'Failed to create user account. Please try again.'
  });
}

// WITH THIS:

let tempUser;
try {
  tempUser = await hygraphUserService.createUser({
    mobile: cleanNumber,
    firstName: req.body.firstName || 'User',
    lastName: req.body.lastName || '',
    modules: ['shop'],
    shopEnabled: true,
    fantasyEnabled: false
  });
  
  user = tempUser;
  
  if (!user || !user.id) {
    console.error('❌ Failed to create user in Hygraph - no ID returned');
    return res.status(500).json({
      success: false,
      message: 'Failed to create user account. Hygraph error.'
    });
  }
} catch (hygraphError) {
  console.error('❌ Hygraph creation error:', hygraphError.message);
  return res.status(500).json({
    success: false,
    message: 'User creation failed: ' + hygraphError.message
  });
}
```

---

## Solution 4: Fix CORS if Needed

### If Flutter Frontend Getting CORS Error:

**Check your Flutter web dev server port**:
```bash
flutter run -d web --web-port=59030
```

**If using different port, add to server.js**:
```javascript
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:59030',
  'http://localhost:YOUR_PORT',  // ADD YOUR PORT HERE
  'http://127.0.0.1:YOUR_PORT',
  // ... rest of origins
];
```

### Test CORS with curl:
```bash
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:59030" \
  -d '{"mobileNumber": "9049522492"}'
```

If you get CORS error in response headers, update `allowedOrigins`.

---

## Solution 5: Frontend CORS Error Handling

**Flutter code** should handle errors properly:

```dart
Future<void> signUp(String mobile, String firstName, String lastName) async {
  try {
    final response = await http.post(
      Uri.parse('$baseUrl/api/auth/send-otp'),  // Or your signup endpoint
      headers: {
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'mobileNumber': mobile,
        'firstName': firstName,
        'lastName': lastName,
      }),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      if (data['success']) {
        // OTP sent successfully
        showSuccess('OTP sent to $mobile');
      } else {
        // Backend returned error
        showError(data['message'] ?? 'Sign up failed');
      }
    } else if (response.statusCode == 0) {
      // CORS error or network error
      showError('Network error - check CORS or backend connection');
      print('Response: ${response.body}');
    } else {
      // Other HTTP errors
      showError('Server error: ${response.statusCode}');
      print('Response: ${response.body}');
    }
  } catch (e) {
    showError('Error: $e');
    print('Exception: $e');
  }
}
```

---

## Quick Diagnosis Checklist

**Run this to diagnose**:

```bash
# 1. Check if backend is running
curl http://localhost:3000/api/auth/send-otp

# 2. Check if CORS is working
curl -X OPTIONS http://localhost:3000/api/auth/send-otp \
  -H "Origin: http://localhost:59030" \
  -v

# 3. Check Hygraph connection
node -e "
const config = require('./config/hygraph');
config.query('query { __typename }')
  .then(() => console.log('✅ Hygraph connected'))
  .catch(e => console.log('❌ Hygraph error:', e.message))
"

# 4. Check environment variables
grep HYGRAPH .env

# 5. Test user creation endpoint
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"mobileNumber": "9049522492", "otp": "123456"}'
```

---

## Implementation Priority

1. **FIRST**: Add detailed error logging (Solution 1)
   - Helps identify exact failure point
   
2. **SECOND**: Verify Hygraph config (Solution 2)
   - Check .env variables
   - Check schema in Hygraph console
   
3. **THIRD**: Update error responses (Solution 3)
   - Frontend gets clear error messages
   
4. **FOURTH**: Test CORS (Solution 4)
   - Only if getting CORS errors in browser
   
5. **FIFTH**: Frontend error handling (Solution 5)
   - Gives better UX on errors

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Hygraph GraphQL errors: Invalid mutation name` | Wrong model name | Change `createUserDetail` to match your Hygraph schema |
| `Authorization required` | Missing/invalid token | Update `HYGRAPH_TOKEN` in .env |
| `Field not found: mobileNumber` | Field name mismatch | Check Hygraph schema field names |
| `CORS policy: Origin not allowed` | Flutter port not whitelisted | Add your Flutter port to `allowedOrigins` in server.js |
| `Cannot read property 'id' of null` | User creation returned null | Check Hygraph mutation errors in logs |

---

## Testing End-to-End

```javascript
// Test script: save as test-signup.js

const axios = require('axios');

async function testSignup() {
  const baseUrl = 'http://localhost:3000';
  const mobile = '9049522492';
  
  try {
    // Step 1: Send OTP
    console.log('📱 Sending OTP...');
    const otpRes = await axios.post(`${baseUrl}/api/auth/send-otp`, {
      mobileNumber: mobile
    });
    console.log('✅ OTP sent:', otpRes.data);
    
    // Step 2: Verify OTP (manual - get from logs)
    const otp = '123456'; // Get from your test OTP service
    
    console.log('🔑 Verifying OTP...');
    const verifyRes = await axios.post(`${baseUrl}/api/auth/verify-otp`, {
      mobileNumber: mobile,
      otp: otp,
      firstName: 'Test',
      lastName: 'User'
    });
    console.log('✅ User created:', verifyRes.data.user);
    
  } catch (error) {
    console.error('❌ Error:', {
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    });
  }
}

testSignup();
```

Run with: `node test-signup.js`

