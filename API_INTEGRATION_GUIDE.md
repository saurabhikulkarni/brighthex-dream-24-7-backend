# 🚀 Complete Shipment Integration - API Documentation

## ✅ What's Complete

All 17 backend APIs have been created and integrated with your Hygraph schema and Shiprocket service.

---

## 📊 API Endpoints Overview

### **1. Orders APIs (5 endpoints)**

#### `POST /api/orders`
Create a new order
```json
{
  "userId": "user123",
  "items": [
    {
      "productId": "prod1",
      "productTitle": "T-Shirt",
      "productImage": "url",
      "quantity": 2,
      "pricePerUnit": 500
    }
  ],
  "totalAmount": 1000,
  "addressId": "addr123",
  "paymentId": "pay123"
}
```
**Response:** Order object with id, order-number, status, createdAt

---

#### `GET /api/orders?userId={userId}&skip=0&limit=50`
Get all orders for a user (with pagination)
- Query params: `userId`, `skip`, `limit`, `status` (optional)
- **Response:** Array of orders

---

#### `GET /api/orders/{orderId}`
Get single order details
**Response:** Complete order object with user, address, payments, items

---

#### `PUT /api/orders/{orderId}`
Update order status
```json
{
  "status": "PROCESSING" // PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED
}
```

---

#### `DELETE /api/orders/{orderId}`
Cancel order
**Response:** Cancelled order object

---

#### `POST /api/orders/{orderId}/create-shipment`
Create Shiprocket shipment for order
```json
{
  "email": "customer@email.com",
  "weight": 500,
  "length": 10,
  "breadth": 10,
  "height": 10,
  "order_items": [
    {
      "name": "Product Name",
      "sku": "SKU123",
      "units": 2,
      "selling_price": 500
    }
  ]
}
```
**Response:** Shipment created with shiprocketOrderId, awb, courier

---

#### `GET /api/orders/{orderId}/status`
Get order with latest tracking status
**Response:** Order object + tracking summary with timeline

---

### **2. Addresses APIs (7 endpoints)**

#### `POST /api/addresses`
Create new address
```json
{
  "userId": "user123",
  "fullName": "John Doe",
  "phoneNumber": "9876543210",
  "addressLine1": "123 Main Street",
  "addressLine2": "Apt 4B",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400001",
  "country": "India",
  "isDefault": false
}
```

---

#### `GET /api/addresses?userId={userId}`
Get all addresses for user
**Response:** Array of address objects

---

#### `GET /api/addresses/{addressId}`
Get single address details

---

#### `PUT /api/addresses/{addressId}`
Update address
```json
{
  "fullName": "Jane Doe",
  "phoneNumber": "9876543210",
  "city": "Bangalore"
}
```

---

#### `DELETE /api/addresses/{addressId}`
Delete address

---

#### `POST /api/addresses/{addressId}/set-default`
Set address as default
```json
{
  "userId": "user123"
}
```

---

#### `GET /api/addresses/default/{userId}`
Get default address for user

---

### **3. Tracking APIs (4 endpoints)**

#### `GET /api/tracking/{orderId}`
Get complete tracking timeline
**Response:** Tracking summary with:
- currentStatus
- currentLocation
- lastUpdate
- estimatedDeliveryDate
- awb, courierName
- timeline (array of all events)

---

#### `GET /api/tracking/{orderId}/events`
Get all tracking events
**Response:** Array of tracking event objects

---

#### `GET /api/tracking/{orderId}/latest`
Get latest tracking status
**Response:** Most recent tracking event

---

#### `POST /api/tracking/{orderId}/events`
Add tracking event manually (testing/manual updates)
```json
{
  "status": "In Transit",
  "location": "Mumbai Hub",
  "remarks": "Package sorted",
  "awb": "ABC123",
  "courierName": "DELHIVERY",
  "estimatedDeliveryDate": "2026-02-01"
}
```

---

#### `GET /api/tracking/reference/statuses`
Get reference of all possible tracking statuses

---

### **4. Shiprocket Webhook Integration**

When Shiprocket sends webhook:
1. ✅ **Updates order status** in Hygraph (PENDING → PROCESSING → SHIPPED → DELIVERED/CANCELLED)
2. ✅ **Stores tracking event** in database
3. ✅ **Maintains tracking history** for UI timeline

---

## 🔄 Complete Order Flow

### **Step 1: Create Address**
```
POST /api/addresses
```

### **Step 2: Create Order**
```
POST /api/orders
{
  "userId": "...",
  "items": [...],
  "totalAmount": 1000,
  "addressId": "...",
  "paymentId": "..."
}
```

### **Step 3: Create Shipment**
```
POST /api/orders/{orderId}/create-shipment
```
- Creates shipment in Shiprocket
- Updates order with tracking number
- Stores Shiprocket order ID

### **Step 4: Track Order**
```
GET /api/orders/{orderId}/status
or
GET /api/tracking/{orderId}
```
- Returns order + tracking info
- Includes timeline of all events

### **Step 5: Webhook Receives Updates (Auto)**
- Shiprocket sends status updates
- Backend auto-updates order status
- Stores tracking events
- Frontend polls or receives websocket updates

---

## 📱 Frontend Integration Points

### **Order Creation Screen**
```dart
// Call backend
POST /api/orders
// Then create shipment
POST /api/orders/{orderId}/create-shipment
```

### **Order Tracking Screen**
```dart
// Get tracking timeline
GET /api/tracking/{orderId}

// Listen to updates (poll every 5-10 seconds or use websocket)
GET /api/orders/{orderId}/status
```

### **Address Management Screen**
```dart
// Get all addresses
GET /api/addresses?userId={userId}

// Add address
POST /api/addresses

// Set default
POST /api/addresses/{addressId}/set-default

// Delete
DELETE /api/addresses/{addressId}
```

---

## 🔐 Environment Variables Required

Add to your `.env`:
```
HYGRAPH_ENDPOINT=https://api-us-east-1-shared-usea-07d3c0ccdab2.hygraph.com/graphql
HYGRAPH_AUTH_TOKEN=your_auth_token_here
SHIPROCKET_EMAIL=your_email@example.com
SHIPROCKET_PASSWORD=your_password
SHIPROCKET_API_TOKEN=your_token (or use email+password)
```

---

## 📋 Hygraph Schema Mapping

Your existing schema already has:
- **User** → firstName, lastName, Addresses, Orders, Payments
- **Order** → orderNumber, totalAmount, status, trackingNumber, courierName, shiprocketOrderId, userDetail, address, Payments, OrderItems
- **Address** → fullName, phoneNumber, addressLine1, addressLine2, city, state, pincode, country, isDefault
- **TrackingEvent** (NEW) → status, location, remarks, timestamp, awb, courierName, estimatedDeliveryDate, order

---

## 🧪 Testing the APIs

### **Test 1: Create Address**
```bash
curl -X POST http://localhost:3000/api/addresses \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "fullName": "John Doe",
    "phoneNumber": "9876543210",
    "addressLine1": "123 Main St",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001",
    "country": "India"
  }'
```

### **Test 2: Create Order**
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "items": [{
      "productId": "prod1",
      "productTitle": "T-Shirt",
      "quantity": 1,
      "pricePerUnit": 500
    }],
    "totalAmount": 500,
    "addressId": "addr_id_from_step_1"
  }'
```

### **Test 3: Get Tracking**
```bash
curl http://localhost:3000/api/tracking/{orderId}
```

---

## 🎯 Next Steps for Frontend

1. **Update Order Creation Flow**
   - Call POST /api/orders
   - Call POST /api/orders/{orderId}/create-shipment
   - Update UI with order details

2. **Update Order Tracking Screen**
   - Call GET /api/tracking/{orderId}
   - Build timeline UI from response
   - Poll every 10 seconds for updates

3. **Update Address Management**
   - Replace local storage with API calls
   - Call POST/GET/PUT/DELETE /api/addresses

4. **Real-time Updates (Optional)**
   - Could add Socket.io for real-time tracking updates
   - Or use polling as implemented

---

## 📝 Status Mapping

| Frontend Status | Hygraph Status | Shiprocket Status IDs |
|---|---|---|
| confirmed | PENDING | 1-5 |
| shipped | PROCESSING, SHIPPED | 3, 6, 17, 18, 42 |
| shipped | SHIPPED | 6, 17, 18 |
| in transit | SHIPPED | 17, 18, 42 |
| delivered | DELIVERED | 7 |
| cancelled | CANCELLED | 8 |

---

## ✨ Features Implemented

✅ Order CRUD operations  
✅ Address management with default selection  
✅ Tracking timeline with events  
✅ Shiprocket webhook integration  
✅ Automatic status updates from Shiprocket  
✅ Order-address relationship  
✅ Order-shipment relationship  
✅ Tracking history persistence  
✅ Status mapping (Shiprocket → App)  
✅ Error handling and validation  

---

## 🔗 Related Services

- **Shiprocket Service** - Handles Shiprocket API calls
- **Order Service** - Hygraph order operations
- **Address Service** - Hygraph address operations
- **Tracking Service** - Hygraph tracking operations
- **GraphQL Client** - Centralized Hygraph communication

All services are singleton instances for optimal performance.

---

## 🚨 Important Notes

1. **Webhook Configuration**: Configure Shiprocket webhook in dashboard to point to:
   ```
   https://your-domain.com/api/shiprocket/webhook
   ```

2. **Token Management**: Shiprocket tokens valid for 240 hours. Service auto-refreshes.

3. **Error Handling**: All endpoints return consistent JSON format with `success` flag.

4. **Rate Limiting**: API has rate limiting (100 requests per 15 minutes).

5. **CORS**: Configured for local dev and production URLs.

---

**You're ready to integrate with your Flutter frontend! 🎉**
