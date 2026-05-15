import asyncio
import sys
import os
from unittest.mock import MagicMock, patch

# Add parent directory to path for imports
sys.path.append(os.getcwd())

from app.core.database import AsyncSessionLocal
from app.models.finance import Payment, FeeStructure, PaymentAllocation
from app.models.directory import Student
from app.services.finance import finance_service
from sqlalchemy import select

async def test_atomicity():
    print("🧪 Starting Atomicity and Rollback Test...")
    async with AsyncSessionLocal() as db:
        try:
            # 1. Setup Test Data
            print("--- Setup ---")
            student = Student(name="Atomic Test Student", institution_id=1, school_class_id=1)
            db.add(student)
            await db.flush()
            
            # Create a PENDING payment
            payment = Payment(
                student_id=student.id, 
                amount=5000.0, 
                status="PENDING", 
                payment_mode="UPI",
                razorpay_order_id="order_atomic_test",
                institution_id=1,
                created_by_id=1
            )
            db.add(payment)
            await db.commit()
            print(f"Created PENDING Payment ID: {payment.id}")

            # 2. Run Verification with Simulated Allocation Failure
            print("\n--- Running Verification (Simulating Allocation Error) ---")
            
            # Mock Razorpay Utility to SUCCEED
            mock_razorpay = MagicMock()
            mock_razorpay.utility.verify_payment_signature.return_value = True
            finance_service.razorpay_client = mock_razorpay

            # Patch allocate_payment to RAISE an error
            with patch.object(finance_service, 'allocate_payment', side_effect=Exception("Simulated Allocation Failure")):
                success = await finance_service.verify_razorpay_payment(
                    db, 1, "order_atomic_test", "pay_test", "sig_test"
                )
            
            print(f"Verification result: {success} (Expected: False)")
            assert success is False

            # 3. Verify Rollback and FAILED status
            print("\n--- Verification of Database State ---")
            # Refresh session
            await db.close()
            async with AsyncSessionLocal() as db_new:
                stmt = select(Payment).where(Payment.id == payment.id)
                res = await db_new.execute(stmt)
                final_payment = res.scalars().first()
                
                print(f"Final Payment Status: {final_payment.status}")
                # It should be FAILED because our catch block marks it so after rollback
                assert final_payment.status == "FAILED"
                
                # Verify NO allocations were created
                alloc_stmt = select(PaymentAllocation).where(PaymentAllocation.payment_id == payment.id)
                alloc_res = await db_new.execute(alloc_stmt)
                allocs = alloc_res.scalars().all()
                print(f"Allocations found: {len(allocs)} (Expected: 0)")
                assert len(allocs) == 0

            print("\n✅ ATOMICITY TEST PASSED SUCCESSFULLY!")

        except Exception as e:
            print(f"\n❌ TEST FAILED: {e}")
            import traceback
            traceback.print_exc()
        finally:
            pass

if __name__ == "__main__":
    asyncio.run(test_atomicity())
