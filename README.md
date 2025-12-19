# Shopping App Backend API

Backend server for MSG91 OTP and Razorpay payment processing.

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
