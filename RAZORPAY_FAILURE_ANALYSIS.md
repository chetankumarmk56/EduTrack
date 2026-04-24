# 🔍 RAZORPAY INTEGRATION - DEEP FAILURE SCENARIO ANALYSIS

**Date**: April 24, 2026  
**System**: School Management Payment Integration  
**Analysis Depth**: Comprehensive failure mode testing

---

## 📊 PAYMENT FLOW OVERVIEW

Your system has **TWO independent verification paths**:

```
┌─────────────────────────────────────────────────────────────────┐
│                   PAYMENT LIFECYCLE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. ORDER CREATION (Frontend → Backend)                          │
│     POST /api/finance/payments/create-order                      │
│     ↓                                                             │
│     Action: Create PENDING payment record                        │
│     Status: PENDING, razorpay_order_id set, razorpay_payment_id empty │
│                                                                   │
│  2. PAYMENT AT RAZORPAY (Frontend → Razorpay)                    │
│     User enters card details, pays                               │
│     ↓                                                             │
│     Razorpay captures payment                                    │
│                                                                   │
│  3. TWO PATHS (race condition):                                  │
│     ├─── PATH A: Client Verify (Fast, ~5sec)                    │
│     │    POST /api/finance/payments/verify                       │
│     │    ↓                                                        │
│     │    Action: Mark payment SUCCESS, allocate fees            │
│     │                                                             │
│     └─── PATH B: Webhook (Async, ~5-30 min)                     │
│          POST /api/finance/webhook                               │
│          ↓                                                        │
│          Action: If not already done, mark SUCCESS & allocate    │
│                                                                   │
│  4. FINAL STATE: Payment SUCCESS, fees allocated, student updated │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔴 CRITICAL FAILURE SCENARIOS

### Scenario A: WEBHOOK DELAY (5-30 minute latency)

**Condition**: Razorpay webhook takes 5-30 minutes to reach your server

**Current Implementation**:
```python
# Client verify endpoint (fast path)
async def verify_razorpay_payment(db, institution_id, order_id, payment_id, signature):
    payment = find_payment_by_order_id(order_id)
    if payment.status == "SUCCESS":
        return True  # ✓ Already processed, skip
    
    # Verify signature and mark SUCCESS
    verify_payment_signature(...)
    payment.status = "SUCCESS"
    await allocate_payment(db, payment.id)
    await db.commit()
    return True

# Webhook endpoint (slow path)
async def handle_razorpay_webhook(db, raw_body, signature):
    # Check idempotency
    txn = find_transaction_by_payment_id(payment_id)
    if txn:
        return True  # ✓ Already processed, skip
    
    # Process webhook
    new_txn = PaymentTransaction(...)
    payment.status = "SUCCESS"
    await allocate_payment(db, payment.id)
    await db.commit()
```

**What Happens**:
1. User pays → Shows success screen immediately
2. Client calls `/verify` → Payment marked SUCCESS ✓
3. Razorpay webhook arrives 20 minutes later
4. Webhook handler finds PaymentTransaction entry → Skips (idempotent) ✓

**Risk Level**: ✅ **SAFE**

**Why**:
- Client verify path completes in ~5 seconds
- User sees success screen before webhook even arrives
- Webhook handler checks idempotency correctly
- If webhook finds transaction from earlier client verify → Skips safely

**Edge Case Risk**: ⚠️ **LOW**
- If client verify FAILS but payment was actually captured at Razorpay
- Webhook will rescue the transaction
- User gets 2 success screens but only one charge

---

### Scenario B: WEBHOOK DUPLICATION (Same webhook sent twice)

**Condition**: Razorpay resends the same webhook.payment.captured event twice

**Current Implementation**:
```python
# Idempotency check
txn_stmt = select(PaymentTransaction).where(
    PaymentTransaction.razorpay_payment_id == razorpay_payment_id
)
txn_res = await db.execute(txn_stmt)
if txn_res.scalars().first():
    logger.info(f"Webhook IDEMPOTENCY: Payment {razorpay_payment_id} already processed. Skipping.")
    return True  # ✓ Skip duplicate
```

**What Happens**:
1. Webhook #1 received → Check PaymentTransaction table
2. Table empty → Process it, insert PaymentTransaction record with razorpay_payment_id
3. Webhook #2 received (5 seconds later with same payment_id)
4. Check PaymentTransaction table
5. Found record from step 2 → Return true, skip processing

**Risk Level**: ✅ **SAFE**

**Why**:
- PaymentTransaction table uniquely keyed on razorpay_payment_id
- First webhook creates the record
- Subsequent webhooks find it and skip
- Prevents duplicate fee allocation

**Potential Issue**: ⚠️ **MEDIUM**
- **Problem**: No database constraint on PaymentTransaction.razorpay_payment_id unique
- **Impact**: If database session fails between checking and inserting, rare duplicate could occur
- **Likelihood**: Very low (would require exact timing + network failure)

**Recommended Fix**:
```sql
ALTER TABLE payment_transactions ADD CONSTRAINT uq_razorpay_payment_id UNIQUE(razorpay_payment_id);
```

---

### Scenario C: PAYMENT SUCCESS BUT DB NOT UPDATED

**Condition**: Payment marked SUCCESS at Razorpay, but database update fails

**Breakdown**:

#### C1: Client verify succeeds, allocation fails

**Current Code**:
```python
async def verify_razorpay_payment(...):
    payment.status = "SUCCESS"  # ← Mark success
    payment.razorpay_payment_id = razorpay_payment_id
    
    await self.allocate_payment(db, payment.id)  # ← Allocation can FAIL
    await self._update_student_fee(db, ...)     # ← Update can FAIL
    
    await db.commit()  # If anything above fails, rollback happens
```

**What Happens if allocate_payment() raises exception**:
1. Client submits verify request with valid signature
2. Backend marks payment.status = "SUCCESS" in memory
3. Calls allocate_payment() → Throws exception (e.g., FeeStructure not found)
4. Transaction rolls back → payment.status stays PENDING in DB
5. But Razorpay already charged the card ❌

**Risk Level**: 🔴 **CRITICAL**

**User Experience**:
- Payment charged at Razorpay ✓
- DB shows PENDING payment ✗
- System believes payment failed
- Money received but not recorded

**When Can This Happen**:
1. Student has no FeeStructure records
2. Student removed from class
3. database connection lost mid-transaction
4. Disk space full

**Recommended Fix**:

```python
async def verify_razorpay_payment(...):
    payment = find_payment_by_order_id(razorpay_order_id)
    
    if payment.status == "SUCCESS":
        return True  # Already done
    
    # CRITICAL: First validate everything can work BEFORE modifying
    validate_result = await self._validate_payment_prerequisites(db, payment.student_id)
    if not validate_result:
        payment.status = "FAILED"
        await db.commit()
        raise Exception(f"Cannot allocate payment: {validate_result.reason}")
    
    try:
        # Now safe to proceed
        verify_payment_signature(...)
        payment.status = "SUCCESS"
        payment.razorpay_payment_id = razorpay_payment_id
        
        await self.allocate_payment(db, payment.id)
        await self._update_student_fee(db, payment.student_id, payment.amount, institution_id)
        await db.commit()
        return True
        
    except Exception as e:
        await db.rollback()
        
        # Mark as FAILED so it doesn't get retried
        try:
            stmt = select(Payment).where(Payment.id == payment.id)
            res = await db.execute(stmt)
            payment_to_mark = res.scalars().first()
            if payment_to_mark and payment_to_mark.status != "FAILED":
                payment_to_mark.status = "FAILED"
                payment_to_mark.failure_reason = str(e)
                await db.commit()
        except:
            logger.critical(f"FAILED to mark payment {payment.id} as FAILED")
        
        return False
```

**New method to add**:
```python
async def _validate_payment_prerequisites(self, db: AsyncSession, student_id: int) -> dict:
    """
    Pre-validate that payment can be processed before charging.
    Returns: {"valid": True} or {"valid": False, "reason": "..."}
    """
    # Check student exists
    student_result = await db.execute(select(Student).where(Student.id == student_id))
    if not student_result.scalars().first():
        return {"valid": False, "reason": "Student record not found"}
    
    # Check fee structures exist
    fee_result = await db.execute(select(FeeStructure).where(FeeStructure.student_id == student_id))
    if not fee_result.scalars().all():
        return {"valid": False, "reason": "No fee structures found for student"}
    
    return {"valid": True}
```

---

#### C2: Webhook succeeds, StudentFee lock fails

**Current Code**:
```python
# SELECT ... FOR UPDATE locks the row for exclusive access
fee_stmt = select(StudentFee).where(
    StudentFee.student_id == student_id,
    StudentFee.class_id == class_id
).with_for_update()

fee_res = await db.execute(fee_stmt)
student_fee = fee_res.scalars().first()

if student_fee:
    new_paid_amount = student_fee.amount_paid + amount
    if new_paid_amount > student_fee.total_amount:
        await db.rollback()
        return False  # Payment marked PENDING, money taken
    
    student_fee.amount_paid = new_paid_amount
    await db.commit()
```

**What Happens if Lock times out**:
1. Webhook receives payment_captured event
2. Tries to acquire lock on StudentFee for update
3. Lock is held by another request (e.g., admin editing fees)
4. Lock times out (default depends on PostgreSQL config)
5. Transaction rolled back
6. PaymentTransaction created but StudentFee NOT updated
7. Payment stays in weird state: ✓ captured, ✓ recorded in PaymentTransaction, ✗ fee not updated

**Risk Level**: 🔴 **CRITICAL**

**Impact**:
- Money taken from student
- StudentFee balance doesn't reflect payment
- Report cards show incorrect dues
- Reconciliation nightmare

**Recommended Fix**:
```python
# Step 4 & 5: Lock StudentFee and Update with timeout
student_id = payment.student_id

# Identify student's current class
student_res = await db.execute(select(Student.school_class_id).where(Student.id == student_id))
class_id = student_res.scalar()

if class_id:
    try:
        # SELECT ... FOR UPDATE with timeout
        fee_stmt = select(StudentFee).where(
            StudentFee.student_id == student_id,
            StudentFee.class_id == class_id
        ).with_for_update(timeout=10)  # ← Add timeout
        
        fee_res = await db.execute(fee_stmt)
        student_fee = fee_res.scalars().first()
        
        if student_fee:
            # ... rest of logic
    except Exception as lock_error:
        # Lock acquisition failed
        logger.error(f"Webhook LOCK_ERROR: Failed to acquire lock on StudentFee: {lock_error}")
        logger.error(f"Payment {razorpay_payment_id} will be retried on next webhook")
        
        # Don't mark as success - let webhook retry
        # Don't insert PaymentTransaction yet
        await db.rollback()
        return False  # This will cause Razorpay to retry
```

---

### Scenario D: USER CLOSES PAYMENT MIDWAY

**Condition**: User dismisses Razorpay payment gateway before completing

**Two Sub-scenarios**:

#### D1: User closes before payment completes

**Timeline**:
1. User clicks "Pay" → create-order endpoint called
2. PENDING payment record created in DB
3. Razorpay gateway opens
4. User closes browser/app → Payment gateway closes
5. Payment never submitted to Razorpay

**Current Implementation**:
```python
async def create_razorpay_order(db, institution_id, student_id, amount, user_id):
    # Save PENDING payment record IMMEDIATELY
    new_payment = Payment(
        student_id=student_id,
        amount=amount,
        payment_mode="UPI",
        status="PENDING",
        razorpay_order_id=razorpay_order_id,
        created_by_id=user_id,
        institution_id=institution_id
    )
    db.add(new_payment)
    await db.commit()
    return {"order_id": razorpay_order_id, ...}
```

**What Happens**:
1. Order created at Razorpay with order_id
2. PENDING payment record in DB with that order_id
3. User closes gateway
4. Order expires at Razorpay (default 15 min)
5. PENDING payment record stays in DB forever

**Risk Level**: 🟡 **MEDIUM**

**Issues**:
- Orphaned PENDING payments accumulate
- Reports might count pending as "in progress"
- Confuses users if they see old payment attempts

**Recommended Fix**:

```python
# Add a cleanup task that runs periodically (Celery or scheduled)

async def cleanup_expired_pending_payments(db: AsyncSession):
    """
    Mark PENDING payments as FAILED if their order has expired at Razorpay.
    Runs every 30 minutes.
    """
    from datetime import datetime, timedelta
    
    # Payments pending for more than 20 minutes (Razorpay expires at 15)
    threshold_time = datetime.utcnow() - timedelta(minutes=20)
    
    stmt = select(Payment).where(
        Payment.status == "PENDING",
        Payment.created_at < threshold_time,
        Payment.razorpay_order_id.isnot(None)
    )
    
    result = await db.execute(stmt)
    expired_payments = result.scalars().all()
    
    for payment in expired_payments:
        # Try to verify if order really expired at Razorpay
        try:
            order = razorpay_client.order.fetch(payment.razorpay_order_id)
            
            if order['status'] == 'created':  # Still open, not captured
                # Check age
                order_created_time = datetime.fromtimestamp(order['created_at'])
                if datetime.utcnow() - order_created_time > timedelta(minutes=15):
                    # Order is old and still uncaptured → mark as FAILED
                    payment.status = "FAILED"
                    logger.info(f"CLEANUP: Marked expired payment {payment.id} as FAILED")
                    
        except Exception as e:
            logger.warning(f"CLEANUP: Could not verify order {payment.razorpay_order_id}: {e}")
            # If we can't verify, don't touch it
    
    await db.commit()
```

#### D2: User closes after payment captures but before verify call

**Timeline**:
1. User clicks "Pay"
2. Creates order, opens Razorpay gateway
3. User pays successfully
4. Razorpay shows confirmation screen
5. User closes browser immediately
6. Payment/verify endpoint never called

**What Happens**:
1. Razorpay has charged the card ✓
2. Razorpay sends webhook after 5-30 minutes
3. Webhook marks payment SUCCESS, allocates fees ✓
4. User eventually logs back in and sees payment recorded

**Risk Level**: ✅ **SAFE**

**Why**:
- Webhook will eventually process it
- Delay is acceptable (user sees it on next login)
- Money is safe

**User Experience**:
- User unsure if payment went through
- Logs back in → Sees it was processed
- All good

**Optional Enhancement** (not critical):
```javascript
// Frontend: Add retry logic if verify fails
const handlePaymentSuccess = async (razorpayOrderId, razorpayPaymentId, signature) => {
    try {
        const response = await fetch('/api/finance/payments/verify', {
            method: 'POST',
            body: JSON.stringify({
                razorpay_order_id: razorpayOrderId,
                razorpay_payment_id: razorpayPaymentId,
                razorpay_signature: signature
            })
        });
        
        if (!response.ok) {
            showMessage("Payment processing. Confirming with server...");
            // Don't redirect yet, let user see confirmation when they reload
        } else {
            showMessage("Payment Successful!");
        }
    } catch (error) {
        showMessage("Payment confirmed at gateway. Will sync on next page load.");
        // Webhook will catch it
    }
};
```

---

## 📊 RISK MATRIX

| Scenario | Likelihood | Severity | Current Status | Risk Level |
|----------|-----------|----------|-----------------|------------|
| A: Webhook Delay (5-30 min) | Medium | Low | Idempotent checks work | ✅ SAFE |
| B: Webhook Duplication | Low | Medium | Has idempotency check | ⚠️ MEDIUM |
| C1: Verify succeeds, allocation fails | Low | Critical | No pre-validation | 🔴 CRITICAL |
| C2: Webhook succeeds, lock fails | Low | Critical | No timeout on lock | 🔴 CRITICAL |
| D1: User closes before payment | High | Medium | Orphaned records persist | 🟡 MEDIUM |
| D2: User closes after payment | High | Low | Webhook recovers | ✅ SAFE |

---

## 🛠️ PRIORITY FIXES

### Priority 1 - CRITICAL (Deploy immediately)

1. **Add prerequisite validation before payment processing**
   - Check student, fee structures exist
   - Prevent allocation failures
   - File: `finance_service.py`, `verify_razorpay_payment()`

2. **Add lock timeout on StudentFee update**
   - Prevent hung transactions
   - Add timeout=10 to `with_for_update()`
   - File: `finance_service.py`, `handle_razorpay_webhook()`

3. **Add unique constraint on PaymentTransaction.razorpay_payment_id**
   - Prevent webhook duplication at database level
   - Migration: Add unique constraint

### Priority 2 - MEDIUM (Next sprint)

4. **Add cleanup task for expired pending payments**
   - Mark old PENDING payments as FAILED
   - Celery task runs every 30 minutes

5. **Add failure reasons to Payment record**
   - Track why payment failed
   - Helps debugging

### Priority 3 - NICE TO HAVE

6. **Add frontend retry logic**
   - Graceful handling if verify endpoint unreachable
   - Better user experience

---

## 🧪 TESTING RECOMMENDATIONS

### Webhook Delay Simulation
```bash
# Simulate 20-minute delay by manually calling webhook endpoint with old timestamp
curl -X POST http://localhost:8000/api/finance/webhook \
  -H "X-Razorpay-Signature: <signature>" \
  -d '<webhook_payload>'
  
# Then verify client verify was already processed (idempotency works)
```

### Webhook Duplication Test
```bash
# Send the same webhook twice rapidly
for i in {1..2}; do
  curl -X POST http://localhost:8000/api/finance/webhook \
    -H "X-Razorpay-Signature: <signature>" \
    -d '<same_webhook_payload>' &
done

# Verify only ONE allocation was created
SELECT COUNT(*) FROM payment_allocations WHERE payment_id = X;
```

### Payment Cancellation Test
```bash
1. Create order → Get order_id
2. Open Razorpay gateway (don't pay)
3. Wait 20 minutes
4. Check: Payment should be marked FAILED (after cleanup runs)
5. Try to create payment again → Should allow new order
```

---

## ✅ SECURITY NOTES

**Current Security Measures** (Working):
- ✓ Signature verification on all webhooks
- ✓ Signature verification on client verify  
- ✓ Idempotency checks prevent duplicate allocation
- ✓ DB locking prevents concurrent updates
- ✓ Amount validation prevents overpayment

**Weak Points**:
- ⚠️ No database constraint on unique payment_id (relying on APP logic)
- ⚠️ No pre-validation before processing (can fail mid-transaction)
- ⚠️ No timeout on DB locks (can hang indefinitely)

---

## 🎯 IMPLEMENTATION CHECKLIST

- [ ] Add `_validate_payment_prerequisites()` method
- [ ] Add prerequisite check in `verify_razorpay_payment()`
- [ ] Add `timeout=10` to StudentFee `with_for_update()`
- [ ] Add migration for unique constraint on PaymentTransaction
- [ ] Add `failure_reason` column to Payment table
- [ ] Create cleanup task for expired pending payments
- [ ] Test webhook delay scenario
- [ ] Test webhook duplication
- [ ] Test payment cancellation
- [ ] Update documentation

---

## 📝 CONCLUSION

Your payment system is **generally well-designed** with **idempotency and locking** that prevent most issues. However, **2 critical gaps** can cause money to be charged but not recorded:

1. **No pre-validation failure** → Allocation fails mid-transaction
2. **No lock timeout** → Webhook hangs waiting for lock

Both are fixable with ~30 lines of code. The fixes are backward compatible and non-breaking.

**Recommendation**: Deploy Priority 1 fixes in next release. Schedule Priority 2 for following sprint.

