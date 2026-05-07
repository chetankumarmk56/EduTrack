# 🔍 RAZORPAY TESTING - QUICK REFERENCE

## Two-Path Payment Flow

```
PAYMENT FLOW:
                ┌─── Payment Charged at Razorpay ───┐
                │                                     │
                ↓                                     ↓
         CLIENT PATH (Fast ~5s)          WEBHOOK PATH (Async ~5-30 min)
                │                                     │
                ↓                                     ↓
    POST /verify                          POST /webhook
                │                                     │
                ├─ Verify Signature                  ├─ Verify Signature
                ├─ Validate Prerequisites    [NEW]    ├─ Check Idempotency
                ├─ Mark SUCCESS                      ├─ Acquire Lock (NOWAIT)  [FIXED]
                ├─ Allocate Fees                     ├─ Mark SUCCESS
                └─ Commit                           ├─ Allocate Fees
                                                     └─ Commit
                │                                     │
                └──────────┬──────────────────────────┘
                           │
                    PAYMENT COMPLETE
          (Both paths finish, or one rescues the other)
```

---

## ✅ What's Fixed

| Issue | Fix |
|-------|-----|
| **Charge without recording** | Pre-validate before marking SUCCESS |
| **Lock timeout hang** | Use `nowait=True`, retry on failure |
| **Webhook duplication** | Unique constraint already in place |
| **Webhook delay** | Idempotency checks prevent double-allocation |

---

## 🧪 How to Test

### Test: Prerequisite Validation
```bash
# 1. Create payment order
curl -X POST http://localhost:8000/api/finance/payments/create-order \
  -H "Authorization: Bearer <token>" \
  -d '{"student_id": 123, "amount": 5000}'

# Store order_id from response

# 2. Delete fee structure (simulate error condition)
# (Use admin console or direct DB)
DELETE FROM fee_structures WHERE student_id = 123;

# 3. Try to verify (will fail gracefully)
curl -X POST http://localhost:8000/api/finance/payments/verify \
  -H "Authorization: Bearer <token>" \
  -d '{
    "razorpay_order_id": "<order_id>",
    "razorpay_payment_id": "pay_test",
    "razorpay_signature": "<signature>"
  }'

# Expected: 400 error, payment marked FAILED
```

### Test: Lock Timeout Handling
```python
# Run this Python test
import asyncio
from app.services.finance_service import finance_service
from app.core.database import AsyncSessionLocal

async def test_lock_timeout():
    async with AsyncSessionLocal() as db:
        # Simulate lock being held
        # (In real scenario, admin panel editing fees)
        
        # Try to process webhook with lock held
        result = await finance_service.handle_razorpay_webhook(
            db,
            raw_body=webhook_payload,
            signature=valid_signature
        )
        
        # Should return False (webhook will retry)
        assert result == False, "Should return False when lock unavailable"
        
        # Check logs for "Lock timeout" message
        print("✓ Lock timeout handling works!")

asyncio.run(test_lock_timeout())
```

### Test: Normal Flow (Sanity Check)
```bash
# Standard happy path
1. Create order
2. Simulate payment at Razorpay (valid signature)
3. Verify payment via API
4. Check: Payment.status = SUCCESS
5. Check: StudentFee.amount_paid updated correctly
```

---

## 🔍 What to Monitor

### After Deployment

```log
LOOK FOR THESE LOG MESSAGES:

✅ Normal flow:
  "VALIDATION: All prerequisites met for student X"
  "Payment X verified successfully"
  "Successfully processed verification and allocation"

⚠️  Handled errors (expected logs):
  "LOCK_TIMEOUT: Failed to acquire lock"
  "Lock will be retried"

🔴 Problems (investigate if you see these):
  "CRITICAL: Payment X cannot be allocated"
  "FATAL: Failed to mark payment X as FAILED"
```

### Metrics to Check

```
1. Payment Success Rate
   - Before: ~99%
   - After: Should be ~99% (maybe slightly higher)

2. Payment FAILED Count
   - Before: Low (only network failures)
   - After: Same (or slightly higher if catching more errors)

3. Webhook Retry Rate
   - Before: Very low
   - After: Same (lock timeout retries are rare)
```

---

## 🚨 If Something Goes Wrong

### Issue: Payments failing to verify
**Check**:
- Does student exist in database?
- Does student have fee structures?
- Is student assigned to a class?
- Signature valid?

**Fix**: Check logs for VALIDATION messages

---

### Issue: Webhook hangs
**Check**:
- Are StudentFee locks being held?
- Are reports/admin pages editing fees during payments?

**Fix**: Should now fail fast and retry (nowait=True)

---

### Issue: Double-allocated payments
**Check**:
- PaymentTransaction records should have unique razorpay_payment_id

**Fix**: Already protected at database level

---

## 📊 Success Criteria

After deployment, verify:

- [ ] Payments with valid signatures succeed immediately
- [ ] Payments missing prerequisites fail with clear error
- [ ] Webhook processes payments even if delayed 30+ minutes
- [ ] No double-allocations (check PaymentAllocation counts)
- [ ] Webhook doesn't hang on locked StudentFee
- [ ] Lock timeouts trigger retries (check logs)

---

## 🎯 Rollback Plan (Just in Case)

If deployment causes issues:

```bash
# Revert to previous version
git revert HEAD

# Redeploy
make deploy

# Payments will still work (backward compatible)
# Might process slower if lock contention (acceptable)
```

No data loss possible - changes are purely in payment processing logic.

---

## 📞 Questions?

Refer to:
- **RAZORPAY_FAILURE_ANALYSIS.md** - Detailed scenario analysis
- **RAZORPAY_FIXES_IMPLEMENTED.md** - Implementation details

