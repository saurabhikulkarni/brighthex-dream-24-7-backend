# Hygraph Integration for Payments

This document explains how payment and order data is synced with Hygraph.

## Setup

### 1. Environment Variables

Add these to your `.env` file:

```env
HYGRAPH_ENDPOINT=https://your-project-id.hygraph.app/graphql
HYGRAPH_TOKEN=your_hygraph_permanent_auth_token
```

Get these from:
- **Endpoint**: Your Hygraph project settings → API Access → Content API
- **Token**: Generate a Permanent Auth Token in API Access settings

### 2. Required Fields

When calling `/api/payments/create-order`, include:
- `userId` (required if Hygraph is configured)
- `orderNumber` (optional, but required to create Order in Hygraph)
- `shippingAddressId` (optional)

## Integration Points

### 1. Create Order Endpoint (`POST /api/payments/create-order`)

**What happens:**
1. Creates Razorpay order
2. Creates Payment record in Hygraph with `paymentStatus: PENDING`
3. Creates Order record in Hygraph (if `orderNumber` provided) with `orderStatus: PENDING`
4. Links Payment to Order in Hygraph

**Request Example:**
```json
{
  "amount": 100,
  "currency": "INR",
  "userId": "hygraph_user_id_here",
  "orderNumber": "ORD-12345",
  "shippingAddressId": "hygraph_address_id_here"
}
```

### 2. Verify Signature Endpoint (`POST /api/payments/verify-signature`)

**What happens:**
1. Verifies Razorpay payment signature
2. Updates Payment in Hygraph: `paymentStatus: COMPLETED` (or `FAILED`)
3. Updates Order in Hygraph: `orderStatus: CONFIRMED` (if payment successful)

### 3. Verify Payment Endpoint (`GET /api/payments/verify-payment`)

**What happens:**
1. Verifies payment from Razorpay
2. Updates Payment in Hygraph with payment status
3. Updates Order in Hygraph to `CONFIRMED` if payment successful
4. Redirects to frontend with status

### 4. Webhook Endpoint (`POST /api/payments/webhook`)

**What happens:**
- `payment.captured`: Updates Payment `paymentStatus: COMPLETED` and Order `orderStatus: CONFIRMED`
- `payment.failed`: Updates Payment `paymentStatus: FAILED`
- `order.paid`: Updates Order `orderStatus: CONFIRMED`

## Status Mapping

### Razorpay Payment Status → Hygraph PaymentStatus

| Razorpay Status | Hygraph PaymentStatus |
|----------------|----------------------|
| `captured` | `COMPLETED` |
| `authorized` | `PROCESSING` |
| `failed` | `FAILED` |
| `refunded` | `REFUNDED` |
| `pending` | `PENDING` |
| `cancelled` | `CANCELLED` |

### Payment Status → Order Status

When payment status becomes `COMPLETED`:
- Order `orderStatus` → `CONFIRMED`

## Field Name Notes

**Important:** Use these field names in Hygraph:
- Order: `orderStatus` (not `status`)
- Payment: `paymentStatus` (not `status`)

## Amount Handling

- **Razorpay**: Amounts are in **paise** (smallest currency unit)
- **Hygraph**: Amounts are stored as **Float** in rupees
- **Conversion**: The service automatically converts paise → rupees (divide by 100)

Example:
- Razorpay: `amount: 10000` (paise) = ₹100
- Hygraph: `amount: 100.0` (rupees)

## Error Handling

- If Hygraph update fails, the Razorpay operation still succeeds
- Errors are logged but don't block the payment flow
- Check server logs for Hygraph errors

## Testing Without Hygraph

The payment flow works without Hygraph configured:
- If `HYGRAPH_ENDPOINT` is missing, Hygraph operations are skipped
- Only Razorpay operations proceed
- All endpoints remain functional

## Example Flow

```
1. Frontend → POST /api/payments/create-order
   {
     "amount": 100,
     "userId": "user_123",
     "orderNumber": "ORD-001"
   }

2. Backend:
   - Creates Razorpay order: order_Rtn00tyLJjZtP3
   - Creates Payment in Hygraph: paymentStatus = PENDING
   - Creates Order in Hygraph: orderStatus = PENDING
   - Links Payment to Order

3. User completes payment in Razorpay

4. Razorpay → GET /api/payments/verify-payment
   - Updates Payment: paymentStatus = COMPLETED
   - Updates Order: orderStatus = CONFIRMED
   - Redirects to frontend

5. Frontend receives payment status and updates UI
```

## Hygraph Service Methods

Available in `services/hygraphService.js`:

- `createPayment(paymentData)` - Create payment record
- `updatePaymentStatus(razorpayOrderId, status, additionalData)` - Update payment status
- `createOrder(orderData)` - Create order record
- `updateOrderStatus(orderId, status)` - Update order status
- `findPaymentByRazorpayOrderId(razorpayOrderId)` - Find payment by Razorpay order ID
- `linkPaymentToOrder(paymentId, orderId)` - Link payment to order
