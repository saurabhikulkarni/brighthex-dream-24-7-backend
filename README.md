# Shopping App Backend API

Backend server for MSG91 OTP, Razorpay payment processing, and unified authentication with Fantasy module.

---

## 🆕 Unified Authentication System

This backend now supports **unified authentication** across Shop and Fantasy modules. A single JWT token works for both backends.

**Key Features:**
- Single login for both Shop and Fantasy modules
- JWT token valid across both backends
- Module-based access control
- Token blacklist using Redis
- Graceful degradation if Fantasy backend is unavailable

**Documentation:**
- [Unified Authentication Guide](./docs/UNIFIED_AUTH.md)
- [Hygraph Schema Migration](./docs/HYGRAPH_MIGRATION.md)

**Required Environment Variables:**
```env
SECRET_TOKEN=your-shared-secret-key-here
FANTASY_API_URL=https://fantasy-api.yourdomain.com
INTERNAL_API_SECRET=your-strong-random-secret-here
REDIS_URL=redis://localhost:6379
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

Edit `.env`:
```env
MSG91_AUTH_KEY=your_msg91_key
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

### 3. Run Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

Server runs on `http://localhost:3000`

---

## 📡 API Endpoints

### Authentication

**Send OTP:**
```bash
POST /api/auth/send-otp
Body: { "mobileNumber": "9876543210" }
```

**Verify OTP & Login:**
```bash
POST /api/auth/verify-otp
Body: { "mobileNumber": "9876543210", "otp": "123456", "sessionId": "..." }
Response: {
  "success": true,
  "token": "jwt-access-token-here",
  "refreshToken": "jwt-refresh-token-here",
  "user": {
    "id": "hygraph-user-id",
    "fantasy_user_id": "mongodb-user-id",
    "mobile": "9876543210",
    "modules": ["shop", "fantasy"],
    "shop_enabled": true,
    "fantasy_enabled": true
  }
}
```

**Validate Token:**
```bash
POST /api/auth/validate-token
Body: { "token": "jwt-token" }
Response: { "success": true, "valid": true, "user": { ... } }
```

**Refresh Token:**
```bash
POST /api/auth/refresh-token
Body: { "refreshToken": "refresh-token-here" }
Response: { "success": true, "token": "new-access-token" }
```

**Logout (Unified):**
```bash
POST /api/auth/logout
Headers: { "Authorization": "Bearer <token>" }
```

**Get Current User:**
```bash
GET /api/auth/me
Headers: { "Authorization": "Bearer <token>" }
```

**Update Profile:**
```bash
PUT /api/auth/profile
Headers: { "Authorization": "Bearer <token>" }
Body: { "fullname": "John Doe", "email": "john@example.com" }
```

### MSG91 OTP

**Send OTP:**
```bash
POST /api/auth/send-otp
Body: { "mobileNumber": "9876543210" }
```

**Verify OTP:**
```bash
POST /api/auth/verify-otp
Body: { "mobileNumber": "9876543210", "otp": "123456", "sessionId": "..." }
```

### Razorpay Payments

**Create Order:**
```bash
POST /api/payments/create-order
Body: { "amount": 1000, "currency": "INR", "receipt": "order_123" }
```

**Verify Signature:**
```bash
POST /api/payments/verify-signature
Body: { "orderId": "...", "paymentId": "...", "signature": "..." }
```

**Webhook (Optional):**
```bash
POST /api/payments/webhook
# Configure webhook URL in Razorpay dashboard
# Webhook secret is optional - if not set, webhooks work without verification
```

**Verify Payment via Redirect URL (Alternative to Webhooks):**
```bash
GET /api/payments/verify-payment?payment_id=pay_xxx&order_id=order_xxx&razorpay_signature=xxx
# Use this as redirect URL in Razorpay payment options
```

---

## 🚀 Deployment Notes

### Vercel Deployment

When deploying to Vercel, ensure the following environment variables are configured:

**MSG91 Configuration:**
```env
MSG91_AUTH_KEY=460639ALxMlUU8Q688c88b6P1
MSG91_TEMPLATE_ID=688b0b58d6fc05287e15c132
MSG91_SENDER_ID=DREAM24
```

**⚠️ Important:** The `MSG91_SENDER_ID` must be set to `DREAM24` (approved sender ID). Using an unapproved sender ID like `BHTTPL` will cause OTP requests to fail.

**Steps to update on Vercel:**
1. Go to Vercel Dashboard → Project Settings → Environment Variables
2. Add or update: `MSG91_SENDER_ID=DREAM24`
3. Redeploy the application for changes to take effect

---

## 🔐 Security Notes

- Never commit `.env` file
- Use environment variables for all secrets
- Enable HTTPS in production
- Configure CORS properly
- Use rate limiting

---

## 📚 Documentation

See `BACKEND_SERVER_SETUP.md` for detailed setup instructions.

---

## 🐛 Troubleshooting

**MSG91 not working:**
- Check MSG91_AUTH_KEY in .env
- Verify template ID is correct
- **Verify Sender ID is approved:** Ensure `MSG91_SENDER_ID=DREAM24` (approved sender ID)
- Check MSG91 dashboard for API status

**Razorpay not working:**
- Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET
- Verify keys are from same environment (test/live)
- Check Razorpay dashboard

**Payment Verification Options:**
1. **Webhooks (Recommended)**: Set up webhook URL in Razorpay dashboard
   - `RAZORPAY_WEBHOOK_SECRET` is optional but recommended for security
   - Without secret, webhooks still work but without signature verification
2. **Redirect URLs**: Use `/api/payments/verify-payment` as redirect URL
   - Works without webhook secret
   - Payment verification happens via API call
3. **Frontend Verification**: Use `/api/payments/verify-signature` endpoint
   - Verify payment signature on frontend after payment

---

## 📝 License

ISC
