# Hygraph Setup Instructions

## Endpoint Configuration

Based on your Flutter config, your Hygraph endpoint is:
```
https://ap-south-1.cdn.hygraph.com/content/cmj85rtgv038n07uo8egj5fkb/master
```

For GraphQL API calls, append `/graphql` to make it:
```
https://ap-south-1.cdn.hygraph.com/content/cmj85rtgv038n07uo8egj5fkb/master/graphql
```

## Environment Variables

Add this to your `.env` file:

```env
HYGRAPH_ENDPOINT=https://ap-south-1.cdn.hygraph.com/content/cmj85rtgv038n07uo8egj5fkb/master/graphql
```

**Note:** `HYGRAPH_TOKEN` is optional and not needed for public endpoints. Only add it if your endpoint requires authentication.

## Verify Setup

After adding the endpoint, restart your server and check the logs. You should NOT see:
```
⚠️  Hygraph endpoint not configured
```

If you see that warning, double-check your `.env` file.
