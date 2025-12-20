# How to View Server Logs

## Option 1: Run Server in Foreground (Recommended for Debugging)

Stop the background server and run it in the foreground to see logs:

```powershell
# Stop background server
Get-Process | Where-Object {$_.ProcessName -eq "node"} | Stop-Process -Force

# Run in foreground (you'll see all logs)
npm start
```

Or with debug mode:
```powershell
npm run debug
```

## Option 2: Check Background Process Output

The server logs are written to:
`C:\Users\91957\.cursor\projects\c-Users-91957-OneDrive-Desktop-shopping-app-backend\terminals\[ID].txt`

## What to Look For in Logs

After making a create-order API call, you should see:

✅ **Success logs:**
- `✅ Hygraph endpoint configured: [endpoint]`
- `🔍 Hygraph Configuration Check:`
- `✅ Payment created in Hygraph: [payment_id]`
- `✅ Order created in Hygraph: [order_id]`
- `✅ Payment linked to order in Hygraph`

❌ **Error logs:**
- `❌ Hygraph Service Error Details:`
- `⚠️  Failed to create payment in Hygraph: [error message]`
- `⚠️  Failed to create order in Hygraph: [error message]`
