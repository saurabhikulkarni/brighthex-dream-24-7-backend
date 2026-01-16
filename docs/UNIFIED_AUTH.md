# Unified Authentication System

## Overview
Single authentication system that works across both Shop and Fantasy modules.

## Architecture
1. User logs in via Shop backend `/api/auth/verify-otp`
2. User created in Hygraph (Shop database)
3. User automatically synced to Fantasy MongoDB
4. Access token (15 min) + Refresh token (30 days) issued
5. Token contains module access information

## Token Structure

### Access Token (15 minutes)
```json
{
  "userId": "hygraph-user-id",
  "_id": "mongodb-user-id",
  "mobile": "9876543210",
  "modules": ["shop", "fantasy"],
  "shop_enabled": true,
  "fantasy_enabled": true,
  "exp": 1234567890
}
```

### Refresh Token (30 days)
```json
{
  "userId": "hygraph-user-id",
  "type": "refresh",
  "mobile": "9876543210",
  "exp": 1234567890
}
```

## API Endpoints

### Login
- **POST** `/api/auth/send-otp` - Send OTP
- **POST** `/api/auth/verify-otp` - Verify OTP and get unified tokens

### Logout
- **POST** `/api/auth/logout` - Logout from all modules

### Token Management

#### Token Validation
**POST** `/api/auth/validate-token`

Validate JWT token and check its status.

**Request:**
```json
{
  "token": "jwt-token-here"
}
```

**Response (Valid Token):**
```json
{
  "success": true,
  "valid": true,
  "message": "Token is valid",
  "user": {
    "id": "user-id",
    "fantasy_user_id": "fantasy-id",
    "mobile": "9876543210",
    "email": "user@example.com",
    "name": "John Doe",
    "modules": ["shop", "fantasy"],
    "shop_enabled": true,
    "fantasy_enabled": true,
    "expiresAt": "2024-12-31T23:59:59.000Z"
  }
}
```

**Response (Invalid Token):**
```json
{
  "success": true,
  "valid": false,
  "message": "Invalid or expired token"
}
```

#### Token Refresh
**POST** `/api/auth/refresh-token`

Generate new access token using refresh token.

**Request:**
```json
{
  "refreshToken": "refresh-token-here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "token": "new-access-token-here",
  "user": {
    "id": "user-id",
    "fantasy_user_id": "fantasy-id",
    "mobile": "9876543210",
    "email": "user@example.com",
    "name": "John Doe",
    "modules": ["shop", "fantasy"],
    "shop_enabled": true,
    "fantasy_enabled": true
  }
}
```

## Token Lifecycle

1. **Login:** User receives access token (15 min) + refresh token (30 days)
2. **API Calls:** Use access token in Authorization header
3. **Token Expiry:** After 15 minutes, access token expires
4. **Refresh:** Use refresh token to get new access token
5. **Logout:** Both tokens are invalidated

## Module Access Control
- Middleware validates `modules` array and `shop_enabled` flag
- Returns 403 if shop access is disabled

## Token Blacklist
- Uses Redis to store blacklisted tokens
- Tokens automatically expire based on JWT expiry time
- Checked on every authenticated request

## Hygraph Schema Updates
Required fields in User model:
- `authKey: String` - Current access token
- `refreshToken: String` - Current refresh token
- `shop_enabled: Boolean` (default: true)
- `fantasy_enabled: Boolean` (default: true)
- `modules: [String]` (default: ["shop", "fantasy"])
- `fantasy_user_id: String`

## Fantasy Backend Integration
- Shop backend calls Fantasy `/api/user/internal/sync-user`
- Requires `X-Internal-Secret` header for authentication
- Syncs user data on login/registration

## Troubleshooting
- If Fantasy sync fails, user can still use Shop module
- Check `FANTASY_API_URL` and `INTERNAL_API_SECRET` configuration
- Monitor logs for sync errors

## Environment Variables
Required environment variables:
- `SECRET_TOKEN` - JWT secret key (must be same as Fantasy backend)
- `FANTASY_API_URL` - Fantasy backend API URL
- `INTERNAL_API_SECRET` - Secret for internal API calls
- `REDIS_URL` - Redis connection URL (default: redis://localhost:6379)
