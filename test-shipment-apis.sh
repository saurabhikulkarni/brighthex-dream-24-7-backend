#!/bin/bash

# 🧪 Test Script for Shipment APIs
# Usage: bash test-shipment-apis.sh

BASE_URL="http://localhost:3000"
USER_ID="test-user-123"

echo "🧪 Testing Shipment Integration APIs"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Create Address
echo "${YELLOW}[1] Testing POST /api/addresses${NC}"
ADDRESS_RESPONSE=$(curl -s -X POST "$BASE_URL/api/addresses" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'$USER_ID'",
    "fullName": "Test User",
    "phoneNumber": "9876543210",
    "addressLine1": "123 Main Street",
    "addressLine2": "Apt 4B",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001",
    "country": "India",
    "isDefault": true
  }')

echo "Response: $ADDRESS_RESPONSE"
ADDRESS_ID=$(echo $ADDRESS_RESPONSE | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "Address ID: $ADDRESS_ID"
echo ""

# Test 2: Get All Addresses
echo "${YELLOW}[2] Testing GET /api/addresses?userId=${USER_ID}${NC}"
curl -s "$BASE_URL/api/addresses?userId=$USER_ID" | jq '.' || echo "Address fetch failed"
echo ""

# Test 3: Create Order
echo "${YELLOW}[3] Testing POST /api/orders${NC}"
ORDER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/orders" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'$USER_ID'",
    "items": [
      {
        "productId": "prod123",
        "productTitle": "Test T-Shirt",
        "productImage": "https://example.com/img.jpg",
        "quantity": 2,
        "pricePerUnit": 500
      }
    ],
    "totalAmount": 1000,
    "addressId": "'$ADDRESS_ID'"
  }')

echo "Response: $ORDER_RESPONSE"
ORDER_ID=$(echo $ORDER_RESPONSE | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "Order ID: $ORDER_ID"
echo ""

# Test 4: Get Order Details
echo "${YELLOW}[4] Testing GET /api/orders/{orderId}${NC}"
curl -s "$BASE_URL/api/orders/$ORDER_ID" | jq '.' || echo "Order fetch failed"
echo ""

# Test 5: Get Tracking
echo "${YELLOW}[5] Testing GET /api/tracking/{orderId}${NC}"
curl -s "$BASE_URL/api/tracking/$ORDER_ID" | jq '.' || echo "Tracking fetch failed"
echo ""

# Test 6: Get User Orders
echo "${YELLOW}[6] Testing GET /api/orders?userId=${USER_ID}${NC}"
curl -s "$BASE_URL/api/orders?userId=$USER_ID" | jq '.' || echo "Orders list fetch failed"
echo ""

# Test 7: Add Tracking Event (Manual)
echo "${YELLOW}[7] Testing POST /api/tracking/{orderId}/events${NC}"
curl -s -X POST "$BASE_URL/api/tracking/$ORDER_ID/events" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "Order Confirmed",
    "location": "Mumbai Warehouse",
    "remarks": "Order received and confirmed",
    "awb": "ABC123XYZ"
  }' | jq '.' || echo "Tracking event creation failed"
echo ""

# Test 8: Get Tracking Events
echo "${YELLOW}[8] Testing GET /api/tracking/{orderId}/events${NC}"
curl -s "$BASE_URL/api/tracking/$ORDER_ID/events" | jq '.' || echo "Tracking events fetch failed"
echo ""

# Test 9: Update Address
echo "${YELLOW}[9] Testing PUT /api/addresses/{addressId}${NC}"
curl -s -X PUT "$BASE_URL/api/addresses/$ADDRESS_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Updated User"
  }' | jq '.' || echo "Address update failed"
echo ""

# Test 10: Update Order Status
echo "${YELLOW}[10] Testing PUT /api/orders/{orderId}${NC}"
curl -s -X PUT "$BASE_URL/api/orders/$ORDER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "PROCESSING"
  }' | jq '.' || echo "Order update failed"
echo ""

# Test 11: Shiprocket Webhook Test
echo "${YELLOW}[11] Testing GET /api/shiprocket/webhook/test${NC}"
curl -s "$BASE_URL/api/shiprocket/webhook/test" | jq '.' || echo "Webhook test failed"
echo ""

# Test 12: Get Order Statuses Reference
echo "${YELLOW}[12] Testing GET /api/shiprocket/order-statuses${NC}"
curl -s "$BASE_URL/api/shiprocket/order-statuses" | jq '.' || echo "Statuses fetch failed"
echo ""

# Test 13: Get Tracking Status Reference
echo "${YELLOW}[13] Testing GET /api/tracking/reference/statuses${NC}"
curl -s "$BASE_URL/api/tracking/reference/statuses" | jq '.' || echo "Tracking statuses fetch failed"
echo ""

# Test 14: Get Default Address
echo "${YELLOW}[14] Testing GET /api/addresses/default/{userId}${NC}"
curl -s "$BASE_URL/api/addresses/default/$USER_ID" | jq '.' || echo "Default address fetch failed"
echo ""

echo "${GREEN}✅ Testing Complete!${NC}"
echo ""
echo "Summary:"
echo "- Address ID: $ADDRESS_ID"
echo "- Order ID: $ORDER_ID"
echo "- User ID: $USER_ID"
echo ""
echo "Next steps:"
echo "1. Verify all responses returned 'success': true"
echo "2. Check Hygraph for created records"
echo "3. Test order creation with shipment"
