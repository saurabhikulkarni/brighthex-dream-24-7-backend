# Hygraph Setup Instructions

## ⚠️ CRITICAL: API Endpoint vs CDN Endpoint

Hygraph has TWO types of endpoints:
- **CDN Endpoint** (`.cdn.`) - READ-ONLY, for fetching data only
- **Content Management API** (`api-`) - Full access, supports mutations

**For user creation/updates, you MUST use the Content Management API!**

## Endpoint Configuration

Based on your Hygraph project, your endpoints are:

❌ **CDN Endpoint (READ-ONLY - DO NOT USE FOR MUTATIONS):**
```
https://ap-south-1.cdn.hygraph.com/content/cmj85rtgv038n07uo8egj5fkb/master
```

✅ **Content Management API (REQUIRED FOR USER CREATION):**
```
https://api-ap-south-1.hygraph.com/v2/cmj85rtgv038n07uo8egj5fkb/master
```

## Environment Variables

Add this to your `.env` file:

```env
# IMPORTANT: Use api- endpoint, NOT cdn endpoint!
HYGRAPH_ENDPOINT=https://api-ap-south-1.hygraph.com/v2/cmj85rtgv038n07uo8egj5fkb/master

# REQUIRED for mutations (user creation, updates, etc.)
# Get from: Hygraph Dashboard → Settings → API Access → Permanent Auth Tokens
HYGRAPH_TOKEN=your_permanent_auth_token_here
```

## Getting Your Permanent Auth Token

1. Go to [Hygraph Dashboard](https://app.hygraph.com)
2. Open your project
3. Navigate to **Settings** → **API Access**
4. Scroll to **Permanent Auth Tokens**
5. Click **Create Token**
6. Give it a name (e.g., "Shop Backend")
7. Set permissions:
   - ✅ **Content API**: Read, Create, Update, Delete
   - ✅ **Models**: UserDetail (at minimum)
8. Copy the token and add it to your `.env` file

## Verify Setup

After adding the endpoint and token, restart your server and check the logs. You should see:
```
✅ Hygraph endpoint configured: https://api-ap-south-1.hygraph.com/v2/...
```

If you see this warning, double-check your `.env` file:
```
⚠️  Hygraph endpoint not configured
```

## Common Issues

### "Hygraph user creation failed" Error
- **Cause**: Using CDN endpoint or missing token
- **Fix**: Use `api-` endpoint and add `HYGRAPH_TOKEN`

### "401 Unauthorized" Error
- **Cause**: Invalid or expired token
- **Fix**: Generate a new Permanent Auth Token

### "403 Forbidden" Error
- **Cause**: Token doesn't have mutation permissions
- **Fix**: Edit token permissions in Hygraph Dashboard
