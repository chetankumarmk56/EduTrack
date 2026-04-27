from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional, Tuple
from datetime import datetime
import razorpay
import logging
import json

from app.core.config import settings
from app.core.logger import logger 
from app.models.finance import Payment, FeeStructure, PaymentAllocation, PaymentTransaction, StudentFee, StudentFeeStatus
from app.models.directory import Student
from app.models.academic import SchoolClass
from app.schemas.finance import (
    StudentDuesResponse, CategoryWiseDue, FinanceSummaryResponse, 
    CategoryTotal, DefaulterResponse
)

class FinanceService:
    def __init__(self):
        # Initialize Razorpay client if keys are provided
        if settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET:
            self.razorpay_client = razorpay.Client(
                auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
            )
        else:
            self.razorpay_client = None

    async def get_or_create_student_fee(
        self, 
        db: AsyncSession, 
        student_id: int, 
        class_id: int, 
        institution_id: int,
        total_amount: float = 0.0,
        due_date: Optional[datetime] = None
    ) -> StudentFee:
        """
        Idempotently get or create a StudentFee record.
        """
        from sqlalchemy.exc import IntegrityError
        
        # 1. Try to fetch existing
        stmt = select(StudentFee).where(
            StudentFee.student_id == student_id,
            StudentFee.class_id == class_id
        )
        res = await db.execute(stmt)
        existing = res.scalars().first()
        
        if existing:
            return existing

        # 2. Try to create new
        from datetime import date
        try:
            async with db.begin_nested(): # Create a SAVEPOINT
                new_fee = StudentFee(
                    student_id=student_id,
                    class_id=class_id,
                    institution_id=institution_id,
                    total_amount=total_amount,
                    due_amount=total_amount,
                    amount_paid=0.0,
                    due_date=due_date if due_date else date.today(),
                    status=StudentFeeStatus.UNPAID
                )
                db.add(new_fee)
                await db.flush() # Flush to trigger unique constraint check
                logger.info(f"FEE_IDEMPOTENCY: Created new StudentFee for Student {student_id}, Class {class_id}")
                return new_fee
        except IntegrityError as e:
            logger.warning(f"FEE_IDEMPOTENCY: Constraint violation for Student {student_id}, Class {class_id}. Details: {str(e)}")
            # The SAVEPOINT is automatically rolled back by async with db.begin_nested() on exception
            # Fetch again in case it was a duplicate
            res = await db.execute(stmt)
            return res.scalars().first()

    async def get_student_dues(self, db: AsyncSession, institution_id: int, student_id: int) -> Optional[StudentDuesResponse]:
        # Fetch student details
        student_result = await db.execute(
            select(Student).where(Student.id == student_id, Student.institution_id == institution_id)
        )
        student = student_result.scalars().first()
        if not student:
            return None

        # Fetch student fee from StudentFee
        stmt = select(StudentFee).where(StudentFee.student_id == student_id, StudentFee.institution_id == institution_id)
        result = await db.execute(stmt)
        fees = result.scalars().all()

        total_due = 0.0
        breakdown = []

        for fee in fees:
            total_due += fee.due_amount
            if fee.total_amount > 0:
                breakdown.append(CategoryWiseDue(
                    fee_type="TUITION", # Map to generic tuition
                    total=fee.total_amount,
                    paid=fee.amount_paid,
                    due=fee.due_amount
                ))

        return StudentDuesResponse(
            student_id=student_id,
            student_name=student.name,
            total_due=total_due,
            breakdown=breakdown
        )

    async def get_student_payments(self, db: AsyncSession, institution_id: int, student_id: int, skip: int = 0, limit: int = 100) -> List[Payment]:
        stmt = select(Payment).where(
            Payment.student_id == student_id
        ).options(selectinload(Payment.allocations)).order_by(Payment.created_at.desc()).offset(skip).limit(limit)
        
        result = await db.execute(stmt)
        return result.scalars().all()

    async def get_all_payments(
        self, 
        db: AsyncSession, 
        institution_id: int,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        mode: Optional[str] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[List[Payment], int]:
        # Build query
        stmt = select(Payment).where(Payment.institution_id == institution_id)
        count_stmt = select(func.count(Payment.id)).where(Payment.institution_id == institution_id)

        if date_from:
            stmt = stmt.where(Payment.created_at >= date_from)
            count_stmt = count_stmt.where(Payment.created_at >= date_from)
        if date_to:
            stmt = stmt.where(Payment.created_at <= date_to)
            count_stmt = count_stmt.where(Payment.created_at <= date_to)
        if mode:
            stmt = stmt.where(Payment.payment_mode == mode)
            count_stmt = count_stmt.where(Payment.payment_mode == mode)
        if status:
            stmt = stmt.where(Payment.status == status)
            count_stmt = count_stmt.where(Payment.status == status)

        # Count total
        total_result = await db.execute(count_stmt)
        total = total_result.scalar()

        # Get items
        stmt = stmt.options(selectinload(Payment.allocations)).order_by(Payment.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(stmt)
        items = result.scalars().all()

        return items, total

    async def create_razorpay_order(
        self, 
        db: AsyncSession, 
        institution_id: int, 
        student_id: int, 
        amount: float,
        user_id: int
    ) -> dict:
        # Convert amount to paise (smallest currency unit)
        amount_paise = int(amount * 100)
        
        # Detection of sandbox mode (placeholder keys)
        is_mock = "placeholder" in (settings.RAZORPAY_KEY_ID or "").lower() or "placeholder" in (settings.RAZORPAY_KEY_SECRET or "").lower()
        
        if is_mock:
            razorpay_order_id = f"order_mock_{int(datetime.now().timestamp())}"
            logger.info("Simulated Payment Mode: Skipping Razorpay API call.")
        else:
            try:
                # Create order in Razorpay
                order_data = {
                    "amount": amount_paise,
                    "currency": "INR",
                    "receipt": f"receipt_inst{institution_id}_std{student_id}_{int(datetime.now().timestamp())}",
                    "notes": {
                        "student_id": student_id,
                        "institution_id": institution_id,
                        "created_by": user_id
                    }
                }
                razorpay_order = self.razorpay_client.order.create(data=order_data)
                razorpay_order_id = razorpay_order["id"]
            except Exception as e:
                logger.error(f"Razorpay Order Error: {e}")
                raise Exception(f"Failed to create Razorpay order: {str(e)}")

        # Save PENDING payment record
        new_payment = Payment(
            student_id=student_id,
            amount=amount,
            payment_mode="UPI", # Defaulting to UPI for online, will update on verification
            status="PENDING",
            razorpay_order_id=razorpay_order_id,
            created_by_id=user_id,
            institution_id=institution_id
        )
        db.add(new_payment)
        await db.commit()
        await db.refresh(new_payment)

        return {
            "order_id": razorpay_order_id,
            "amount": amount_paise, 
            "key_id": settings.RAZORPAY_KEY_ID,
            "currency": "INR",
            "is_mock": is_mock
        }

    async def _validate_payment_prerequisites(
        self, 
        db: AsyncSession, 
        student_id: int
    ) -> dict:
        """
        Pre-validate that payment can be processed before confirming payment.
        Returns: {"valid": True} or {"valid": False, "reason": "..."}
        
        This prevents charge-but-no-record scenarios where payment is charged
        but fails during allocation due to missing data.
        """
        # Check student exists and is active
        student_result = await db.execute(
            select(Student).where(Student.id == student_id)
        )
        student = student_result.scalars().first()
        
        if not student:
            logger.warning(f"VALIDATION: Student {student_id} not found")
            return {"valid": False, "reason": "Student record not found"}
        
        if not student.school_class_id:
            logger.warning(f"VALIDATION: Student {student_id} not assigned to any class")
            return {"valid": False, "reason": "Student not assigned to any class"}
        
        # Check fee structures exist (fallback method)
        fee_result = await db.execute(
            select(FeeStructure).where(FeeStructure.student_id == student_id)
        )
        fees = fee_result.scalars().all()
        
        if not fees:
            logger.warning(f"VALIDATION: No fee structures found for student {student_id}")
            return {"valid": False, "reason": "No fee structures configured for this student"}
        
        logger.info(f"VALIDATION: All prerequisites met for student {student_id}")
        return {"valid": True}


    async def verify_razorpay_payment(
        self, 
        db: AsyncSession, 
        institution_id: int, 
        razorpay_order_id: str,
        razorpay_payment_id: str,
        razorpay_signature: str
    ) -> bool:
        """
        Verify the authenticity of a Razorpay payment and update status.
        CRITICAL: Validates prerequisites before marking payment SUCCESS to prevent
        "charged but not recorded" scenarios.
        """
        # Find the payment record
        stmt = select(Payment).where(
            Payment.razorpay_order_id == razorpay_order_id,
            Payment.institution_id == institution_id
        )
        result = await db.execute(stmt)
        payment = result.scalars().first()
        
        if not payment:
            raise Exception("Payment record not found for this order ID.")
            
        if payment.status == "SUCCESS":
            logger.info(f"Payment {payment.id} already marked SUCCESS. Returning cached result.")
            return True # Already verified

        # CRITICAL FIX #1: Pre-validate everything before modifying payment status
        validation_result = await self._validate_payment_prerequisites(db, payment.student_id)
        if not validation_result["valid"]:
            logger.error(f"CRITICAL: Payment {payment.id} cannot be allocated: {validation_result['reason']}")
            # Mark as FAILED so it doesn't retry
            payment.status = "FAILED"
            await db.commit()
            raise Exception(f"Cannot allocate payment: {validation_result['reason']}")

        # Prepare parameters for verification
        params_dict = {
            'razorpay_order_id': razorpay_order_id,
            'razorpay_payment_id': razorpay_payment_id,
            'razorpay_signature': razorpay_signature
        }
        
        try:
            # Check for mock order verification
            if razorpay_order_id.startswith("order_mock_") or razorpay_payment_id == "pay_mock_success":
                logger.info(f"Simulated Payment Mode: Bypassing signature verification for order {razorpay_order_id}")
            else:
                # This raises SignatureVerificationError if invalid
                self.razorpay_client.utility.verify_payment_signature(params_dict)
            
            # Update Payment to SUCCESS (Buffer changes, don't commit yet)
            payment.status = "SUCCESS"
            payment.razorpay_payment_id = razorpay_payment_id
            
            logger.info(f"Payment {payment.id} verified successfully for order {razorpay_order_id}. Initializing allocation...")

            # Trigger allocation logic (Flushes but doesn't commit)
            await self.allocate_payment(db, payment.id)
            
            # AUTOMATION: Update StudentFee
            await self._update_student_fee(db, payment.student_id, payment.amount, institution_id)

            # Final Commit for both status update and allocations
            await db.commit()
            logger.info(f"Successfully processed verification and allocation for payment {payment.id}.")
            
            return True
            
        except Exception as e:
            logger.error(f"Verification/Allocation Failed for Order {razorpay_order_id}: {str(e)}")
            # Rollback any partial changes (like allocations or status updates)
            await db.rollback()
            
            # Start a new attempt to mark as FAILED
            try:
                # Re-fetch manually within the same session after rollback
                stmt = select(Payment).where(Payment.id == payment.id)
                res = await db.execute(stmt)
                payment_to_mark = res.scalars().first()
                if payment_to_mark and payment_to_mark.status != "FAILED":
                    payment_to_mark.status = "FAILED"
                    await db.commit()
                    logger.info(f"Payment {payment.id} successfully marked as FAILED after rollback.")
            except Exception as rollback_err:
                logger.critical(f"FATAL: Failed to mark payment {payment.id} as FAILED: {rollback_err}")
                
            return False

    async def allocate_payment(self, db: AsyncSession, payment_id: int):
        """
        Distribute a successful payment across student fees based on priority.
        Logic:
        1. Get payment amount
        2. Fetch fee_structure sorted by priority ASC
        3. For each fee: allocate remaining amount, update paid_amount, insert allocation
        """
        # Fetch the payment
        stmt = select(Payment).where(Payment.id == payment_id)
        result = await db.execute(stmt)
        payment = result.scalars().first()
        if not payment or payment.status != "SUCCESS":
            return

        # Fetch fee structures for this student, sorted by priority
        fee_stmt = select(FeeStructure).where(
            FeeStructure.student_id == payment.student_id
        ).order_by(FeeStructure.priority.asc())
        fee_result = await db.execute(fee_stmt)
        fees = fee_result.scalars().all()

        remaining_payment = payment.amount
        logger.info(f"Starting allocation for Payment ID {payment_id} (Student: {payment.student_id}, Amount: {payment.amount})")

        allocated_count = 0
        for fee in fees:
            if remaining_payment <= 0:
                break
            
            # Calculate how much can be allocated to this fee
            due_on_fee = max(0.0, fee.total_amount - fee.paid_amount)
            if due_on_fee <= 0:
                continue

            allocation_amount = min(remaining_payment, due_on_fee)
            
            # Update fee paid amount
            fee.paid_amount += allocation_amount
            
            # Create allocation record
            allocation = PaymentAllocation(
                payment_id=payment.id,
                fee_type=fee.fee_type,
                allocated_amount=allocation_amount,
                institution_id=payment.institution_id
            )
            db.add(allocation)
            
            # Log transaction for audit trail
            transaction = PaymentTransaction(
                razorpay_payment_id=payment.razorpay_payment_id or f"manual_{payment.id}",
                order_id=payment.razorpay_order_id or f"order_manual_{payment.id}",
                amount=allocation_amount,
                status="allocated",
                metadata={"fee_type": fee.fee_type, "allocation_id": allocation.id}
            )
            db.add(transaction)
            
            remaining_payment -= allocation_amount
            allocated_count += 1
            logger.debug(f"Allocated {allocation_amount} to {fee.fee_type} for Student {payment.student_id}. Remaining: {remaining_payment}")

        logger.info(f"Allocation Engine completed. Created {allocated_count} allocation records. Unallocated balance: {remaining_payment}")
        # Note: We assume the caller handles commit
        await db.flush()

    async def allocate_payment_to_fees(self, db: AsyncSession, payment_id: int):
        # Deprecated: use allocate_payment
        await self.allocate_payment(db, payment_id)

    async def record_manual_payment(
        self, 
        db: AsyncSession, 
        institution_id: int, 
        student_id: int, 
        amount: float, 
        mode: str, 
        note: Optional[str], 
        user_id: int
    ) -> Payment:
        """
        Record a manual payment (Cash/Manual UPI) and immediately allocate it to fees.
        """
        logger.info(f"Recording manual payment: Student {student_id}, Amount {amount}, Mode {mode}")
        
        # Create successful payment record
        payment = Payment(
            student_id=student_id,
            amount=amount,
            payment_mode=mode,
            status="SUCCESS",
            note=note,
            created_by_id=user_id,
            institution_id=institution_id
        )
        db.add(payment)
        
        # Use flush to get payment.id for allocation logic
        await db.flush()
        
        # Trigger allocation (also uses flush internally)
        await self.allocate_payment(db, payment.id)
        
        # AUTOMATION: Update StudentFee
        await self._update_student_fee(db, student_id, amount, institution_id)

        # Commit the entire manual payment + allocation block
        await db.commit()
        
        # Re-fetch with allocations loaded for the response
        stmt = select(Payment).where(Payment.id == payment.id).options(selectinload(Payment.allocations))
        res = await db.execute(stmt)
        return res.scalars().first()

    async def handle_razorpay_webhook(
        self, 
        db: AsyncSession, 
        raw_body: bytes, 
        signature: str
    ) -> bool:
        """
        Securely process Razorpay webhook notifications.
        """
        if not settings.RAZORPAY_WEBHOOK_SECRET:
            logger.critical("RAZORPAY_WEBHOOK_SECRET not configured. Webhook ignored.")
            return False

        # 1. Verify Signature
        try:
            self.razorpay_client.utility.verify_webhook_signature(
                raw_body.decode('utf-8'),
                signature,
                settings.RAZORPAY_WEBHOOK_SECRET
            )
        except Exception as e:
            logger.error(f"Webhook signature verification failed: {e}")
            return False

        # 2. Parse Payload
        payload = json.loads(raw_body)
        event = payload.get("event")
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        # 3. Webhook Hardening: Extract IDs
        razorpay_order_id = payment_entity.get("order_id")
        razorpay_payment_id = payment_entity.get("id")
        amount_paise = payment_entity.get("amount")
        amount = amount_paise / 100 if amount_paise else 0

        if not razorpay_order_id or not razorpay_payment_id:
            logger.warning(f"Webhook event {event} missing order_id or payment_id. Ignored.")
            return True

        # Step 1 & 2: Check Idempotency
        txn_stmt = select(PaymentTransaction).where(PaymentTransaction.razorpay_payment_id == razorpay_payment_id)
        txn_res = await db.execute(txn_stmt)
        if txn_res.scalars().first():
            logger.info(f"Webhook IDEMPOTENCY: Payment {razorpay_payment_id} already processed. Skipping.")
            return True

        # Step 3: Atomic Transaction
        try:
            # We are already in a session context, but we want to ensure these are atomic.
            # In FastAPI Depends(get_db), the session is committed at the end.
            # To ensure atomic rollback for this specific block:
            
            if event == "payment.captured":
                logger.info(f"Webhook: Captured payment {razorpay_payment_id} for order {razorpay_order_id}. Processing...")
                
                # 1. Insert into PaymentTransaction
                new_txn = PaymentTransaction(
                    razorpay_payment_id=razorpay_payment_id,
                    order_id=razorpay_order_id,
                    amount=amount,
                    status="captured"
                )
                db.add(new_txn)

                # 2. Find associated Payment record
                stmt = select(Payment).where(Payment.razorpay_order_id == razorpay_order_id)
                res = await db.execute(stmt)
                payment = res.scalars().first()

                if not payment:
                    logger.error(f"Webhook FATAL: No local payment record for order {razorpay_order_id}. Rollback.")
                    return False

                # Step 4 & 5: Lock StudentFee and Update
                # We need to find the student_id from the payment
                student_id = payment.student_id
                
                # Identify student's current class
                student_res = await db.execute(select(Student.school_class_id).where(Student.id == student_id))
                class_id = student_res.scalar()
                
                if class_id:
                    # CRITICAL FIX #2: Add lock timeout to prevent hung transactions
                    # SELECT ... FOR UPDATE with NOWAIT to avoid hanging indefinitely
                    try:
                        fee_stmt = select(StudentFee).where(
                            StudentFee.student_id == student_id,
                            StudentFee.class_id == class_id
                        ).with_for_update(nowait=True)  # ← Will raise if can't acquire immediately
                        
                        fee_res = await db.execute(fee_stmt)
                        student_fee = fee_res.scalars().first()
                        
                        if student_fee:
                            logger.info(f"Webhook LOCK: StudentFee {student_fee.id} locked for update.")
                            
                            # Step 6: Validate Overpayment
                            new_paid_amount = student_fee.amount_paid + amount
                            if new_paid_amount > student_fee.total_amount:
                                logger.error(f"Webhook VALIDATION: Overpayment detected for Student {student_id}. Paid: {new_paid_amount}, Total: {student_fee.total_amount}. Rollback.")
                                await db.rollback()
                                return False

                            # Update fields
                            student_fee.amount_paid = new_paid_amount
                            student_fee.due_amount = student_fee.total_amount - new_paid_amount
                            
                            # Update status
                            if student_fee.due_amount <= 0:
                                student_fee.status = StudentFeeStatus.PAID
                            elif student_fee.amount_paid > 0:
                                student_fee.status = StudentFeeStatus.PARTIAL
                            else:
                                student_fee.status = StudentFeeStatus.UNPAID
                            
                            logger.info(f"Webhook UPDATE: StudentFee {student_fee.id} updated. New due: {student_fee.due_amount}")
                    
                    except Exception as lock_error:
                        # Lock acquisition failed (another request has the lock)
                        logger.warning(f"Webhook LOCK_TIMEOUT: Failed to acquire lock on StudentFee for Student {student_id}: {lock_error}")
                        logger.warning(f"Webhook will be retried. Payment will be updated but StudentFee deferring to retry.")
                        # Don't rollback - let webhook retry next time
                        # This is safer than rolling back and leaving payment in PENDING state
                        await db.rollback()
                        return False  # Cause Razorpay to retry this webhook

                # Update Payment record
                payment.status = "SUCCESS"
                payment.razorpay_payment_id = razorpay_payment_id
                
                # Trigger allocations (also uses task locking)
                await self.allocate_payment(db, payment.id)

                # Step 7: Commit
                await db.commit()
                logger.info(f"Webhook SUCCESS: Atomic update completed for payment {razorpay_payment_id}.")

            elif event == "payment.failed":
                # Still record the transaction for idempotency of failure processing
                new_txn = PaymentTransaction(
                    razorpay_payment_id=razorpay_payment_id,
                    order_id=razorpay_order_id,
                    amount=amount,
                    status="failed"
                )
                db.add(new_txn)

                stmt = select(Payment).where(Payment.razorpay_order_id == razorpay_order_id)
                res = await db.execute(stmt)
                payment = res.scalars().first()
                if payment and payment.status != "FAILED":
                    payment.status = "FAILED"
                    payment.razorpay_payment_id = razorpay_payment_id
                
                await db.commit()
                logger.info(f"Webhook: Payment {razorpay_payment_id} marked as FAILED.")

            return True

        except Exception as e:
            logger.error(f"Webhook CRITICAL: Failed to process event {event}: {str(e)}")
            await db.rollback()
            return False

        return True

    async def get_finance_summary(self, db: AsyncSession, institution_id: int) -> FinanceSummaryResponse:
        """
        Calculate institutional finance summary using optimized aggregations.
        """
        # 1. Total Collected (from successful payments)
        collected_stmt = select(func.sum(Payment.amount)).where(
            Payment.institution_id == institution_id,
            Payment.status == "SUCCESS"
        )
        collected_res = await db.execute(collected_stmt)
        total_collected = collected_res.scalar() or 0.0

        # 2. Total Pending (from StudentFee)
        pending_stmt = select(func.sum(StudentFee.due_amount)).where(
            StudentFee.institution_id == institution_id
        )
        pending_res = await db.execute(pending_stmt)
        total_pending = pending_res.scalar() or 0.0

        # 3. Categorical Collected (Since we only track total fee now, map to 'TUITION')
        cat_collected = [CategoryTotal(category="TUITION", amount=total_collected)] if total_collected > 0 else []

        # 4. Categorical Pending
        cat_pending = [CategoryTotal(category="TUITION", amount=total_pending)] if total_pending > 0 else []

        return FinanceSummaryResponse(
            total_collected=total_collected,
            total_pending=total_pending,
            category_collected=cat_collected,
            category_pending=cat_pending
        )

    async def get_defaulters(self, db: AsyncSession, institution_id: int) -> List[DefaulterResponse]:
        """
        Identify students with outstanding balances.
        """
        stmt = select(
            Student.id,
            Student.name,
            func.sum(StudentFee.due_amount).label("total_due"),
            SchoolClass.display_name.label("class_name")
        ).join(
            StudentFee, Student.id == StudentFee.student_id
        ).join(
            SchoolClass, Student.school_class_id == SchoolClass.id, isouter=True
        ).where(
            Student.institution_id == institution_id
        ).group_by(
            Student.id, Student.name, SchoolClass.display_name
        ).having(
            func.sum(StudentFee.due_amount) > 0
        ).order_by(
            func.sum(StudentFee.due_amount).desc()
        )

        result = await db.execute(stmt)
        return [
            DefaulterResponse(
                student_id=row[0],
                student_name=row[1],
                total_due=row[2],
                class_name=row[3]
            ) for row in result.all()
        ]

    async def _update_student_fee(self, db: AsyncSession, student_id: int, amount: float, institution_id: int):
        """
        Update the StudentFee record after a successful payment.
        """
        from app.models.finance import StudentFee, StudentFeeStatus
        from app.models.directory import Student
        
        logger.info(f"FEE_SYNC: Updating StudentFee for Student {student_id}, Amount: {amount}")

        # 1. Identify student's current class
        student_res = await db.execute(select(Student.school_class_id).where(Student.id == student_id))
        class_id = student_res.scalar()
        if not class_id:
            logger.warning(f"FEE_SYNC: Student {student_id} not assigned to any class. Skipping fee update.")
            return

        # 2. Fetch StudentFee record
        fee_stmt = select(StudentFee).where(
            StudentFee.student_id == student_id,
            StudentFee.class_id == class_id,
            StudentFee.institution_id == institution_id
        )
        fee_res = await db.execute(fee_stmt)
        student_fee = fee_res.scalars().first()

        if not student_fee:
            logger.warning(f"FEE_SYNC: No StudentFee record found for Student {student_id} in Class {class_id}.")
            return

        # 3. Global Safeguard: Skip if already paid
        if student_fee.due_amount <= 0 and amount > 0:
            logger.warning(f"FEE_SAFEGUARD: Student {student_id} already has zero/negative due. Skipping payment update.")
            return

        # 4. Strict Validation: amount_paid never exceeds total_amount
        new_paid_amount = student_fee.amount_paid + amount
        if new_paid_amount > student_fee.total_amount:
            logger.error(f"FEE_VALIDATION: Overpayment for Student {student_id}. Attempted: {new_paid_amount}, Max: {student_fee.total_amount}")
            # Requirement: Prevent amount_paid > total_amount
            # Capping and logging for manual payments, Webhook uses rollback
            new_paid_amount = student_fee.total_amount

        # 5. Update fields
        student_fee.amount_paid = new_paid_amount
        # Safeguard: due_amount never negative
        student_fee.due_amount = max(0.0, student_fee.total_amount - student_fee.amount_paid)

        # 6. Update Status
        if student_fee.due_amount <= 0:
            student_fee.status = StudentFeeStatus.PAID
        elif student_fee.amount_paid > 0:
            student_fee.status = StudentFeeStatus.PARTIAL
        else:
            student_fee.status = StudentFeeStatus.UNPAID

        logger.info(f"AUDIT_PAYMENT: StudentFee {student_fee.id} updated for Student {student_id}. Paid: {student_fee.amount_paid}, Due: {student_fee.due_amount}, Status: {student_fee.status}")
        await db.flush()

finance_service = FinanceService()
