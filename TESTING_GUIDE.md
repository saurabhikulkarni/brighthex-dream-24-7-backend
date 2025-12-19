# 🧪 Payment Testing Guide

This guide will help you test the Razorpay payment integration.

## 📋 Prerequisites

1. ✅ `.env` file created (already done)
2. ✅ Razorpay test credentials configured
3. ✅ Dependencies installed

## 🚀 Quick Start

### Step 1: Start the Server

```bash
npm run dev
```

The server should start on `http://localhost:3000`

### Step 2: Test the Endpoints

You have **3 ways** to test:

---

## Method 1: Automated Test Script (Recommended)

Run the automated test script:

```bash
node test-payments.js
```

This will:
- ✅ Check if server is running
- ✅ Test order creation
- ✅ Test webhook endpoint (mock)
- ✅ Show you what to do next

---

## Method 2: Browser Test (Visual)

1. Open `test-payment.html` in your browser
2. Enter amount (default: ₹1)
3. Click "Pay Now"
4. Complete payment in Razorpay checkout
5. See verification results

**Note:** Make sure your server is running first!

---

## Method 3: Manual API Testing

### Test 1: Create Order

```bash
curl -X POST http://localhost:3000/api/payments/create-order \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "currency": "INR"}'
```

Expected response:
```json
{
  "success": true,
  "order": {
    "id": "order_xxxxx",
    "amount": 100,
    "currency": "INR",
    "status": "created"
  }
}
```

### Test 2: Verify Payment (After Real Payment)

After completing a payment, use the payment ID:

```bash
curl "http://localhost:3000/api/payments/verify-payment?payment_id=pay_xxxxx"
```

### Test 3: Verify Signature (After Real Payment)

```bash
curl -X POST http://localhost:3000/api/payments/verify-signature \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order_xxxxx",
    "paymentId": "pay_xxxxx",
    "signature": "signature_xxxxx"
  }'
```

---

## 🔔 Testing Webhooks

### Option A: Without Webhook Secret (Current Setup)

Your webhook endpoint will work without `RAZORPAY_WEBHOOK_SECRET`:

1. Go to Razorpay Dashboard → Webhooks
2. Add webhook URL: `http://your-server.com/api/payments/webhook`
3. Select events: `payment.captured`, `payment.failed`
4. Save

**Note:** For local testing, use a tool like:
- [ngrok](https://ngrok.com/) to expose localhost
- [webhook.site](https://webhook.site/) for testing

### Option B: Test Webhook Locally

You can test the webhook endpoint manually:

```bash
curl -X POST http://localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-razorpay-signature: test_signature" \
  -d '{
    "event": "payment.captured",
    "payload": {
      "payment": {
        "entity": {
          "id": "pay_test123",
          "order_id": "order_test123",
          "amount": 10000,
          "status": "captured"
        }
      }
    }
  }'
```

---

## 🎯 Complete Payment Flow Test

### Using Test Payment Page:

1. **Start server:**
   ```bash
   npm run dev
   ```

2. **Open `test-payment.html` in browser**

3. **Enter test amount** (e.g., ₹1)

4. **Click "Pay Now"**

5. **In Razorpay Checkout:**
   - Use test card: `4111 1111 1111 1111`
   - CVV: Any 3 digits
   - Expiry: Any future date
   - Name: Any name

6. **Complete payment**

7. **See verification results** in the browser

---

## ✅ Expected Results

### Successful Payment:
- ✅ Order created
- ✅ Payment completed
- ✅ Signature verified
- ✅ Payment status: `captured`

### Server Logs:
You should see:
```
📦 Order created: order_xxxxx
✅ Payment signature verified successfully
```

---

## 🐛 Troubleshooting

### Server not starting?
- Check if port 3000 is available
- Verify `.env` file exists
- Check Razorpay credentials

### Payment not working?
- Verify `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `.env`
- Make sure you're using test keys (start with `rzp_test_`)
- Check browser console for errors

### Webhook not receiving?
- Webhook secret is optional - it will work without it
- For local testing, use ngrok to expose your server
- Check server logs for webhook events

---

## 📝 Test Checklist

- [ ] Server starts successfully
- [ ] Order creation works
- [ ] Payment can be completed
- [ ] Signature verification works
- [ ] Verify-payment endpoint works
- [ ] Webhook endpoint accepts requests (optional)

---

## 🎉 You're All Set!

Your payment system is ready to test. Start with the automated test script or the HTML test page for the easiest testing experience.

