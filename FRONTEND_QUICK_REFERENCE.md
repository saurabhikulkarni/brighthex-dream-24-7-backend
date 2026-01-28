# 📱 Quick API Reference for Frontend Integration

## 🎯 Endpoints at a Glance

### **ADDRESSES**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/addresses` | Create address |
| GET | `/api/addresses?userId={id}` | Get all user addresses |
| GET | `/api/addresses/{id}` | Get single address |
| PUT | `/api/addresses/{id}` | Update address |
| DELETE | `/api/addresses/{id}` | Delete address |
| POST | `/api/addresses/{id}/set-default` | Set default address |
| GET | `/api/addresses/default/{userId}` | Get default address |

### **ORDERS**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/orders` | Create order |
| GET | `/api/orders?userId={id}` | Get user orders |
| GET | `/api/orders/{id}` | Get order details |
| PUT | `/api/orders/{id}` | Update order status |
| DELETE | `/api/orders/{id}` | Cancel order |
| POST | `/api/orders/{id}/create-shipment` | Create Shiprocket shipment |
| GET | `/api/orders/{id}/status` | Get order with tracking |

### **TRACKING**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/tracking/{orderId}` | Get full tracking timeline |
| GET | `/api/tracking/{orderId}/events` | Get all tracking events |
| GET | `/api/tracking/{orderId}/latest` | Get latest status |
| POST | `/api/tracking/{orderId}/events` | Add tracking event |

---

## 💾 Data Models

### **Order**
```dart
{
  "id": "order_id",
  "order-number": "ORD1234567890",
  "total-amount": 1000,
  "status": "PENDING|PROCESSING|SHIPPED|DELIVERED|CANCELLED",
  "tracking-number": "ABC123XYZ",
  "courierName": "DELHIVERY",
  "shiprocketOrderId": "sr123",
  "createdAt": "2026-01-28T...",
  "userDetail": {...},
  "address": {...},
  "Payments": [...]
}
```

### **Address**
```dart
{
  "id": "addr_id",
  "fullName": "John Doe",
  "phoneNumber": "9876543210",
  "addressLine1": "123 Main St",
  "addressLine2": "Apt 4B",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400001",
  "country": "India",
  "isDefault": false,
  "createdAt": "2026-01-28T..."
}
```

### **Tracking**
```dart
{
  "orderId": "order_id",
  "currentStatus": "In Transit",
  "currentLocation": "Mumbai Hub",
  "lastUpdate": "2026-01-28T...",
  "estimatedDeliveryDate": "2026-01-30",
  "awb": "ABC123",
  "courierName": "DELHIVERY",
  "timeline": [
    {
      "status": "Picked Up",
      "location": "Mumbai",
      "remarks": "Package picked",
      "timestamp": "2026-01-28T..."
    }
  ]
}
```

---

## 🔄 Common Flows

### **1️⃣ Complete Order with Address**
```
1. POST /api/addresses → Get addressId
2. POST /api/orders {addressId} → Get orderId
3. POST /api/orders/{orderId}/create-shipment → Shipment created
4. GET /api/tracking/{orderId} → Track shipment
```

### **2️⃣ Get Order Status**
```
GET /api/orders/{orderId}/status
→ Returns order + latest tracking info
```

### **3️⃣ Track Package**
```
GET /api/tracking/{orderId}
→ Returns complete timeline with all events
```

### **4️⃣ Manage Addresses**
```
POST /api/addresses → Create
GET /api/addresses?userId={id} → List
PUT /api/addresses/{id} → Update
DELETE /api/addresses/{id} → Delete
POST /api/addresses/{id}/set-default → Set default
```

---

## ✅ Response Format

All endpoints return:
```json
{
  "success": true,
  "message": "Action completed",
  "data": {...},
  "count": 5
}
```

On error:
```json
{
  "success": false,
  "message": "Error description"
}
```

---

## 🚦 Status Values

```
Order Status:
- PENDING (awaiting processing)
- PROCESSING (preparing shipment)
- SHIPPED (in transit)
- DELIVERED (delivered)
- CANCELLED (cancelled)

Tracking Status:
- Order Confirmed
- Label Generated
- Picked Up
- In Transit
- Reached Destination Hub
- Out for Delivery
- Delivered
- Cancelled
- RTO Initiated
- RTO Delivered
- Pending
- Lost
- Damaged
- Undelivered
```

---

## 🔗 Usage Example (Dart/Flutter)

```dart
// Create Address
final addressResponse = await http.post(
  Uri.parse('$baseUrl/api/addresses'),
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({
    'userId': userId,
    'fullName': 'John Doe',
    'phoneNumber': '9876543210',
    'addressLine1': '123 Main St',
    'city': 'Mumbai',
    'state': 'Maharashtra',
    'pincode': '400001',
    'country': 'India'
  }),
);

// Create Order
final orderResponse = await http.post(
  Uri.parse('$baseUrl/api/orders'),
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({
    'userId': userId,
    'items': [...],
    'totalAmount': 1000,
    'addressId': addressId,
  }),
);

// Create Shipment
await http.post(
  Uri.parse('$baseUrl/api/orders/$orderId/create-shipment'),
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({
    'email': 'customer@email.com',
    'weight': 500,
    'length': 10,
    'breadth': 10,
    'height': 10,
  }),
);

// Get Tracking
final trackingResponse = await http.get(
  Uri.parse('$baseUrl/api/tracking/$orderId'),
);

// Deserialize
final tracking = jsonDecode(trackingResponse.body);
if (tracking['success']) {
  final timeline = tracking['data']['timeline'];
  // Build UI with timeline
}
```

---

## 📊 Polling for Updates

For real-time tracking, poll tracking endpoint every 10 seconds:

```dart
Timer.periodic(Duration(seconds: 10), (timer) async {
  final response = await http.get(
    Uri.parse('$baseUrl/api/tracking/$orderId'),
  );
  final tracking = jsonDecode(response.body)['data'];
  
  // Update UI with new tracking info
  setState(() {
    currentStatus = tracking['currentStatus'];
    timeline = tracking['timeline'];
  });
});
```

---

## 🔐 Required Headers

```
Content-Type: application/json
Authorization: Bearer {token} (if auth needed)
```

---

## 🛠️ Debugging

Check response body for exact error:
```dart
print(response.body); // Shows error message
```

Common errors:
- `400` - Missing required fields
- `404` - Resource not found
- `500` - Server error (check backend logs)

---

## ⚡ Performance Tips

1. Cache address list locally
2. Poll tracking every 10-30 seconds (not every second)
3. Use pagination for order list (limit=50)
4. Load images async

---

## 📞 API Base URL

Development: `http://localhost:3000`  
Production: `https://your-domain.com`

---

**Ready to integrate! 🚀**
