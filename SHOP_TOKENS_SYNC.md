# Shop Tokens Sync Implementation

## Overview
Updated Shop Backend authentication endpoints to sync shopTokens balance on user login, token refresh, and token validation.

## Changes Made

### 1. **POST /api/auth/verify-otp** (Login Endpoint)
**Purpose**: User login with OTP verification

**New Behavior**:
- ✅ Gets `hygraph_user_id` from user creation/lookup
- ✅ Fetches latest `shopTokens` from Hygraph via `findUserById()`
- ✅ Returns current balance in response
- ✅ Logs transaction: `✅ User login successful - hygraph_user_id: {id}, shopTokens: {balance}`

**Response Update**:
```json
{
  "success": true,
  "user": {
    "userId": "user-id",
    "hygraph_user_id": "user-id",
    "fantasy_user_id": "fantasy-id",
    "shopTokens": 0,
    "isNewUser": false
  }
}
```

### 2. **POST /api/auth/validate-token** (Token Validation Endpoint)
**Purpose**: Validate existing token and return user info

**New Behavior**:
- ✅ Fetches current `shopTokens` from Hygraph user record
- ✅ Returns balance with token validation result
- ✅ Logs: `📱 Token validated for user: {id}, shopTokens: {balance}`

**Response Update**:
```json
{
  "success": true,
  "valid": true,
  "user": {
    "id": "user-id",
    "shopTokens": 0
  }
}
```

### 3. **POST /api/auth/refresh-token** (Token Refresh Endpoint)
**Purpose**: Generate new access token using refresh token

**New Behavior**:
- ✅ Fetches current `shopTokens` from Hygraph user record
- ✅ Returns updated balance with new token
- ✅ Logs: `💰 Token refreshed for user: {id}, shopTokens: {balance}`

**Response Update**:
```json
{
  "success": true,
  "token": "new-access-token",
  "user": {
    "id": "user-id",
    "shopTokens": 0
  }
}
```

## Technical Details

### Data Flow
```
User Login/Token Operation
    ↓
Verify JWT/OTP
    ↓
Fetch User from Hygraph (includes shopTokens field)
    ↓
Extract shopTokens value (defaults to 0)
    ↓
Log transaction with balance
    ↓
Return shopTokens in user response object
```

### Cache Strategy
- **Session/Cache**: Hygraph is queried on every login/validation/refresh
- **No explicit caching layer**: Relies on Hygraph's response time (typically <100ms)
- **Frontend responsibility**: Frontend caches balance and updates on header refresh

### Integration Points
- **Service**: `hygraphUserService.findUserById(userId)`
  - Query includes: `shopTokens`, `fantasyUserId`, `shopEnabled`, `fantasyEnabled`
  - Returns full user object with all fields

- **Authentication Flow**:
  1. User calls `/verify-otp` with mobile + OTP
  2. Backend creates/finds user in Hygraph
  3. Backend fetches user with `findUserById()` to get shopTokens
  4. Backend returns token + current balance to frontend
  5. Frontend stores both token and shopTokens in session/state

### Logging Pattern
All endpoints now log with emoji prefixes for easy tracking:
- `✅` - Successful login with balance
- `📱` - Token validation with balance
- `💰` - Token refresh with balance

## Frontend Integration

### On App Launch
```javascript
// 1. User logs in
const loginResponse = await POST('/api/auth/verify-otp', { mobile, otp });
store.shopTokens = loginResponse.user.shopTokens;
store.authToken = loginResponse.authToken;

// 2. Store in session/cache
sessionStorage.setItem('shopTokens', loginResponse.user.shopTokens);
```

### On Token Refresh
```javascript
// Token about to expire, refresh it
const refreshResponse = await POST('/api/auth/refresh-token', { refreshToken });
store.authToken = refreshResponse.token;
store.shopTokens = refreshResponse.user.shopTokens; // Update balance
```

### On Header Display
```javascript
// Show balance in app header
const balanceResponse = await GET('/api/wallet/shop-tokens-only', {
  headers: { 'Authorization': 'Bearer ' + authToken }
});
displayBalance(balanceResponse.data.shopTokens);
```

## Database Queries

### Hygraph Query (findUserById)
```graphql
query GetUserById($id: ID!) {
  userDetail(where: { id: $id }) {
    id
    mobileNumber
    firstName
    lastName
    shopTokens
    fantasyUserId
    shopEnabled
    fantasyEnabled
  }
}
```

### No mutations needed
- Login flow: Only reads user data
- No automatic token purchases
- shopTokens updated only by `/api/wallet/receive-shop-tokens-from-fantasy` endpoint

## Error Handling

All endpoints maintain existing error handling:
- 400: Invalid input / missing fields
- 401: Invalid/expired token or unverified OTP
- 500: Server error with error message

Added logging to catch Hygraph failures:
- If `findUserById()` fails: Falls back to `shopTokens = 0`
- Logs warning but continues (doesn't block login)

## Testing

### Test verify-otp endpoint
```bash
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"mobileNumber": "9049522492", "otp": "123456"}'

# Expect: shopTokens in user response object
```

### Test validate-token endpoint
```bash
curl -X POST http://localhost:3000/api/auth/validate-token \
  -H "Content-Type: application/json" \
  -d '{"token": "eyJhbGc..."}'

# Expect: shopTokens in user response object
```

### Test refresh-token endpoint
```bash
curl -X POST http://localhost:3000/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "eyJhbGc..."}'

# Expect: new token + shopTokens in response
```

## Related Endpoints

- **POST /api/wallet/receive-shop-tokens-from-fantasy** - Fantasy app tops up shop tokens
- **GET /api/wallet/shop-tokens-only** - Quick balance retrieval for UI headers

## Files Modified
- `routes/auth.js` - Updated 3 endpoints (verify-otp, validate-token, refresh-token)
