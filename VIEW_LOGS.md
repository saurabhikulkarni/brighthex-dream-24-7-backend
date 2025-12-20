# How to View Server Logs

## Method 1: Run Server in Foreground (Recommended - Easiest)

This is the **best way** to see logs in real-time:

1. **Stop any running background server:**
   ```powershell
   Get-Process | Where-Object {$_.ProcessName -eq "node"} | Stop-Process -Force
   ```

2. **Run server in foreground:**
   ```powershell
   npm run debug
   ```

3. **In another terminal, make your API call** - you'll see all logs appear in real-time!

4. **To stop:** Press `Ctrl+C` in the terminal where the server is running

---

## Method 2: Check Background Process Output

If the server is running in the background, logs are written to a file. However, it's easier to just run it in foreground (Method 1).

---

## What to Look For in Logs

When you make a create-order API call, you should see:

### ✅ Success Logs:
- `✅ Hygraph endpoint configured: [endpoint]`
- `🔍 Hygraph Configuration Check:`
- `✅ Payment created in Hygraph: [payment_id]`
- `✅ Order created in Hygraph: [order_id]`
- `✅ Payment linked to order in Hygraph`

### ❌ Error Logs (if something fails):
- `❌ Hygraph Service Error Details:`
- `⚠️  Failed to create payment in Hygraph: [error message]`
- `⚠️  Failed to create order in Hygraph: [error message]`

---

## Quick Test After Starting Server

Once the server is running in foreground, test with:

```powershell
$body = @{
    amount = 200
    currency = "INR"
    userId = "cmje1j9900v5j07ploqi5n9uq"
    orderNumber = "TEST-" + (Get-Date -Format "yyyyMMddHHmmss")
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/payments/create-order" -Method POST -Body $body -ContentType "application/json"
```

Watch the server terminal for Hygraph logs!
