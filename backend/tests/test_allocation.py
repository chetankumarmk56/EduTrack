import asyncio
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.getcwd())

from app.core.database import AsyncSessionLocal
from app.models.finance import Payment, FeeStructure, PaymentAllocation
from app.models.directory import Student
from app.services.finance import finance_service
from sqlalchemy import select, delete

async def test_allocation():
    print("🧪 Starting Fee Allocation Test...")
    async with AsyncSessionLocal() as db:
        try:
            # 1. Setup Test Data
            print("--- Setup ---")
            # Create a test student
            student = Student(name="Test Allocation Student", institution_id=1, school_class_id=1)
            db.add(student)
            await db.flush()
            print(f"Created Student ID: {student.id}")

            # Create Fee Structures
            fees = [
                FeeStructure(student_id=student.id, fee_type="TUITION", total_amount=10000.0, priority=1, institution_id=1),
                FeeStructure(student_id=student.id, fee_type="SPORTS", total_amount=5000.0, priority=2, institution_id=1),
                FeeStructure(student_id=student.id, fee_type="TRANSPORT", total_amount=5000.0, priority=3, institution_id=1)
            ]
            for f in fees: db.add(f)
            await db.flush()
            print("Created 3 FeeStructures (TUITION:10k, SPORTS:5k, TRANSPORT:5k)")

            # Create a successful payment of 12500
            payment = Payment(
                student_id=student.id, 
                amount=12500.0, 
                status="SUCCESS", 
                payment_mode="CASH",
                institution_id=1,
                created_by_id=1
            )
            db.add(payment)
            await db.flush()
            print(f"Created SUCCESS Payment of {payment.amount}")

            # 2. Run Allocation
            print("\n--- Running Allocation ---")
            await finance_service.allocate_payment(db, payment.id)
            await db.commit()
            print("Allocation complete and committed.")

            # 3. Verify Results
            print("\n--- Verification ---")
            # Clear cache and fetch fresh
            await db.close()
            
            async with AsyncSessionLocal() as db_new:
                # Check Fees
                fs_result = await db_new.execute(select(FeeStructure).where(FeeStructure.student_id == student.id).order_by(FeeStructure.priority))
                fs_list = fs_result.scalars().all()
                
                print("Fee Status:")
                for f in fs_list:
                    print(f"  {f.fee_type}: Paid {f.paid_amount}/{f.total_amount}")
                    if f.fee_type == "TUITION":
                        assert f.paid_amount == 10000.0
                    elif f.fee_type == "SPORTS":
                        assert f.paid_amount == 2500.0 # 12500 - 10000
                    elif f.fee_type == "TRANSPORT":
                        assert f.paid_amount == 0.0

                # Check Allocations
                alloc_result = await db_new.execute(select(PaymentAllocation).where(PaymentAllocation.payment_id == payment.id))
                allocs = alloc_result.scalars().all()
                print(f"\nAllocations Created: {len(allocs)}")
                assert len(allocs) == 2
                
                total_allocated = sum(a.allocated_amount for a in allocs)
                print(f"Total Allocated: {total_allocated}")
                assert total_allocated == 12500.0

            print("\n✅ TEST PASSED SUCCESSFULLY!")

        except Exception as e:
            print(f"\n❌ TEST FAILED: {e}")
            import traceback
            traceback.print_exc()
            await db.rollback()
        finally:
            print("\n--- Cleanup ---")
            # We don't cleanup in this test script to keep it simple, or we can delete test data
            pass

if __name__ == "__main__":
    asyncio.run(test_allocation())
