# 🔍 CODE SCAN DIAGNOSTIC REPORT - Sign-up Failures

## CRITICAL ISSUES FOUND (Root Causes)

### ❌ ISSUE #1: HYGRAPH_TOKEN NOT SET (PRIMARY CAUSE OF USER CREATION FAILURE)
**Location**: `.env` file  
**Severity**: 🔴 CRITICAL

```bash
# Current (BROKEN):
HYGRAPH_ENDPOINT=https://ap-south-1.cdn.hygraph.com/content/cmj85rtgv038n07uo8egj5fkb/master 
# HYGRAPH_TOKEN is optional - only needed for mutations (create/update/delete operations)    
# HYGRAPH_TOKEN=your_hygraph_mutation_token_here

# Should be (FIXED):
HYGRAPH_ENDPOINT=https://ap-south-1.cdn.hygraph.com/content/cmj85rtgv038n07uo8egj5fkb/master
HYGRAPH_TOKEN=your_actual_permanent_auth_token_from_hygraph
```

**Why This Breaks Sign-up**:
1. When user tries to sign up → `/verify-otp` endpoint called
2. Backend tries to create user in Hygraph with `hygraphUserService.createUser()`
3. GraphQL mutation sent WITHOUT `Authorization: Bearer {token}` header
4. Hygraph API rejects request (no auth)
5. Error thrown: "Hygraph user creation failed"
6. User not created ❌

**Fix**:
- Go to Hygraph Dashboard → Settings → API Access → Permanent Auth Tokens
- Create or copy existing token with mutations permission
- Add to `.env`: `HYGRAPH_TOKEN=your_token_here`

---

### ❌ ISSUE #2: MSG91 SENDOTP ERROR HANDLING RETURNS FALSE, BLOCKS USER CREATION
**Location**: `routes/auth.js` lines 120-135  
**Severity**: 🟠 HIGH

```javascript
// Current flow in send-otp endpoint:
if (sendResult.success) {
  res.json({ success: true, ... });
} else {
  // OTP send failed → endpoint returns error
  await otpService.deleteOtp(sessionId);
  res.status(500).json({
    success: false,
    message: sendResult.message || 'Failed to send OTP'
  });
}
```

**What's Happening**:
If MSG91 API call fails (network, credentials, etc.), the entire OTP flow stops. User can't proceed to sign-up.

**Common MSG91 Failures**:
1. **Invalid AUTH_KEY**: `MSG91_AUTH_KEY=460639ALxMlUU8Q688c88b6P1` - verify this is correct
2. **Invalid TEMPLATE_ID**: `MSG91_TEMPLATE_ID=688b0b58d6fc05287e15c132` - verify template exists
3. **Mobile number format**: Code sends `91{mobileNumber}` but MSG91 might need different format
4. **Network timeout**: MSG91 service unreachable (check firewall, VPN)

**Check In .env**:
```bash
# VERIFY THESE ARE CORRECT:
MSG91_AUTH_KEY=460639ALxMlUU8Q688c88b6P1     # ← Check this at msg91.com
MSG91_TEMPLATE_ID=688b0b58d6fc05287e15c132   # ← Check this at msg91.com
MSG91_SENDER_ID=BHTTPL                        # ← Verify this is approved
```

---

### ❌ ISSUE #3: SERVER ERROR HANDLING - ERRORS NOT VISIBLE IN LOGS
**Location**: `routes/auth.js` line 145-149  
**Severity**: 🟡 MEDIUM

```javascript
catch (error) {
  console.error('Error in send-otp:', error);  // ← Generic logging
  res.status(500).json({
    success: false,
    message: 'Internal server error. Please try again later.'
  });
}
```

**Problem**: If anything fails, you get "Internal server error" with no details. Hard to debug.

**Should be**:
```javascript
catch (error) {
  console.error('❌ SEND-OTP ERROR:', {
    message: error.message,
    stack: error.stack,
    otpGeneratedYet: !!otp,
    msg91Attempted: !!sendResult,
    responseStatus: error.response?.status
  });
  // ... return error
}
```

---

### ❌ ISSUE #4: VERIFY-OTP ENDPOINT - MISSING ERROR DETAILS
**Location**: `routes/auth.js` line 153+ (verify-otp endpoint)  
**Severity**: 🟡 MEDIUM

**Current behavior**:
- If Hygraph user creation fails → returns generic "Failed to create user"
- Frontend doesn't know what the actual error is
- Makes it hard to debug

**What should happen**:
Endpoint now has better error logging (after our recent fix), but frontend still needs clear messages.

---

## EXECUTION FLOW - WHAT HAPPENS ON SIGN-UP

```
User enters mobile: 9049522492
                    ↓
POST /api/auth/send-otp
                    ↓
✅ Validate mobile format
                    ↓
🔴 PROBLEM #1: Generate OTP (OK)
                    ↓
✅ Store OTP in memory
                    ↓
🔴 PROBLEM #2: Send OTP via MSG91
                    ↓
   If MSG91 call succeeds:
   ↓
   ✅ Return sessionId to frontend
   ↓
   User gets OTP on phone
   ↓
   User enters OTP → POST /api/auth/verify-otp
   ↓
   🔴 PROBLEM #3: Verify OTP
   ✅ OTP verified
   ↓
   🔴 PROBLEM #1 (CRITICAL): Create user in Hygraph
   ✗ BLOCKED: HYGRAPH_TOKEN not set
   ✗ User creation fails
   ✗ Sign-up fails
   
   If MSG91 call fails:
   ↓
   ❌ Return error to frontend
   ✗ User can't proceed
```

---

## ROOT CAUSE ANALYSIS

### Why User is NOT Created in Hygraph

1. **Primary**: `HYGRAPH_TOKEN` not set in `.env`
   - No Authorization header sent with mutation
   - Hygraph rejects request
   - User creation fails silently
   - Error caught but swallowed (returns generic "user not created")

2. **Secondary**: If MSG91 fails
   - OTP never reaches user's phone
   - Even if user retries, can't enter OTP
   - Sign-up blocked at step 1

3. **Tertiary**: Network/API configuration issues
   - Firewall blocking Hygraph/MSG91
   - Wrong credentials
   - Rate limiting

---

## STEP-BY-STEP FIX PLAN

### STEP 1: Set HYGRAPH_TOKEN (IMMEDIATE - BLOCKING ISSUE)
```bash
# 1. Go to https://hygraph.com → Login
# 2. Select your project → Settings → API Access → Permanent Auth Tokens
# 3. Create new token or use existing
# 4. Copy token
# 5. Add to .env:
HYGRAPH_TOKEN=your_token_here
# 6. Restart server
```

### STEP 2: Verify MSG91 Credentials
```bash
# Check these in msg91.com dashboard:
# 1. MSG91_AUTH_KEY - correct?
# 2. MSG91_TEMPLATE_ID - exists?
# 3. MSG91_SENDER_ID - approved?

# Test MSG91 manually:
curl -X POST https://control.msg91.com/api/v5/otp \
  -H "Content-Type: application/json" \
  -H "authkey: 460639ALxMlUU8Q688c88b6P1" \
  -d '{
    "template_id": "688b0b58d6fc05287e15c132",
    "mobile": "919049522492",
    "otp": "123456"
  }'
```

### STEP 3: Verify Hygraph Schema
```bash
# Go to Hygraph → Models → check:
1. Model name: userDetail (NOT user, NOT User)
2. Fields exist:
   - mobileNumber (String, Required)
   - firstName (String, Optional)
   - lastName (String, Optional)
   - modules (String Array)
   - shopEnabled (Boolean)
   - fantasyEnabled (Boolean)
   - shopTokens (Integer, default 0)
```

### STEP 4: Enable Detailed Logging
```bash
# Start server with debug mode:
DEBUG=true npm start
# This logs all requests/responses
```

### STEP 5: Test End-to-End
```bash
# Terminal 1: Start server with logging
cd D:\shop-backend\brighthex-dream-24-7-backend
DEBUG=true npm start

# Terminal 2: Send OTP
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"mobileNumber": "9049522492"}'

# Watch logs in Terminal 1 for:
# - MSG91 request/response
# - Any errors

# Then in Terminal 2: Verify OTP
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "mobileNumber": "9049522492",
    "otp": "123456",
    "firstName": "Test",
    "lastName": "User"
  }'

# Watch Terminal 1 logs for:
# - Hygraph mutation request
# - Hygraph response (success or error)
```

---

## CURRENT .env STATUS

✅ **MSG91 Set**:
- AUTH_KEY: `460639ALxMlUU8Q688c88b6P1`
- TEMPLATE_ID: `688b0b58d6fc05287e15c132`
- SENDER_ID: `BHTTPL`

✅ **Hygraph Endpoint Set**:
- ENDPOINT: `https://ap-south-1.cdn.hygraph.com/content/cmj85rtgv038n07uo8egj5fkb/master`

❌ **Hygraph Token MISSING** (CRITICAL):
- TOKEN: NOT SET (commented out)
- This is why user creation fails!

---

## FILES TO REVIEW

1. **Critical**: `.env` - Add HYGRAPH_TOKEN
2. **Important**: `services/msg91Service.js` - Verify MSG91 API calls
3. **Important**: `config/hygraph.js` - Uses HYGRAPH_TOKEN for auth
4. **Reference**: `routes/auth.js` - send-otp & verify-otp endpoints
5. **Reference**: `services/hygraphUserService.js` - User creation logic

---

## QUICK CHECKLIST TO FIX SIGN-UP

- [ ] Add `HYGRAPH_TOKEN=...` to `.env`
- [ ] Restart server: `npm start`
- [ ] Verify MSG91 credentials in dashboard
- [ ] Test `/send-otp` endpoint with curl
- [ ] Check server logs for MSG91 response
- [ ] If OTP sent, test `/verify-otp` endpoint
- [ ] Watch logs for Hygraph mutation response
- [ ] If user created, sign-up works! ✅

---

## Expected Success Logs (After Fixes)

```
✅ User login successful - hygraph_user_id: clx4k6d8f000001jpg3g4h9kl, shopTokens: 0
📞 Raw mobile number received: 9049522492
📞 Clean mobile number: 9049522492
✅ OTP sent successfully
📝 OTP verified
✅ New user created in Hygraph with ID: clx4k6d8f000001jpg3g4h9kl
✅ Fantasy sync completed successfully
✅ Token generated successfully
```

If you see errors instead, they'll now be detailed and actionable.

