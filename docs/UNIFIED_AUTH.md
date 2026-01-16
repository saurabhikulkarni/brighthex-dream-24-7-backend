# Unified Authentication System

## Overview
Single authentication system that works across both Shop and Fantasy modules.

## Architecture
1. User logs in via Shop backend `/api/auth/verify-otp`
2. User created in Hygraph (Shop database)
3. User automatically synced to Fantasy MongoDB
4. Single JWT token issued valid for both backends
5. Token contains module access information

## Token Structure
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

## API Endpoints

### Login
- **POST** `/api/auth/send-otp` - Send OTP
- **POST** `/api/auth/verify-otp` - Verify OTP and get unified token

### Logout
- **POST** `/api/auth/logout` - Logout from all modules

## Module Access Control
- Middleware validates `modules` array and `shop_enabled` flag
- Returns 403 if shop access is disabled

## Token Blacklist
- Uses Redis to store blacklisted tokens
- Tokens automatically expire based on JWT expiry time
- Checked on every authenticated request

## Hygraph Schema Updates
Required fields in User model:
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
