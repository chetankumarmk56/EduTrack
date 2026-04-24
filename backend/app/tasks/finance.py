import asyncio
from datetime import date, datetime, timedelta
from sqlalchemy import select, and_, or_, delete
from sqlalchemy.orm import selectinload

from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.models.finance import StudentFee
from app.models.directory import Student, Parent
from app.models.communication import Notification
from app.services.notification_service import notification_service
from app.services.call_service import call_service
from app.core.logger import logger
from app.models.communication import CronLock
from sqlalchemy.exc import IntegrityError

@celery_app.task(name="daily_fee_reminder")
def daily_fee_reminder_task():
    """
    Distributed lock protected cron task.
    """
    lock_name = "daily_fee_reminder"
    timeout_minutes = 10
    
    loop = asyncio.get_event_loop()
    
    async def task_with_lock():
        async with AsyncSessionLocal() as db:
            # 1. Cleanup expired lock (Timeout Safety)
            expired_threshold = datetime.now() - timedelta(minutes=timeout_minutes)
            cleanup_stmt = delete(CronLock).where(
                CronLock.name == lock_name,
                CronLock.locked_at < expired_threshold
            )
            await db.execute(cleanup_stmt)
            await db.commit()

            # 2. Try to acquire lock
            try:
                lock = CronLock(name=lock_name)
                db.add(lock)
                await db.commit()
                logger.info(f"CRON_START: {lock_name} lock acquired.")
            except IntegrityError:
                await db.rollback()
                logger.warning(f"CRON_SKIPPED: {lock_name} is already running or locked.")
                return "SKIPPED"

            # 3. Run Task
            try:
                result = await run_daily_fee_reminder()
                logger.info(f"CRON_COMPLETED: {lock_name}. Result: {result}")
                return result
            except Exception as e:
                logger.error(f"CRON_ERROR: {lock_name} failed: {str(e)}")
                raise e
            finally:
                # 4. Release Lock
                try:
                    await db.execute(delete(CronLock).where(CronLock.name == lock_name))
                    await db.commit()
                    logger.info(f"CRON_RELEASED: {lock_name} lock released.")
                except Exception as release_err:
                    logger.error(f"CRON_FATAL: Failed to release lock {lock_name}: {release_err}")

    if loop.is_running():
        return asyncio.ensure_future(task_with_lock())
    else:
        return loop.run_until_complete(task_with_lock())

async def run_daily_fee_reminder():
    """
    Daily task to notify parents about upcoming or overdue fees.
    """
    async with AsyncSessionLocal() as db:
        today = date.today()
        seven_days_ago = today - timedelta(days=7)
        seven_days_ahead = today + timedelta(days=7)
        
        # 1. Fetch fees within the 14-day window (-7 to +7)
        # We also filter for due_amount > 0
        stmt = (
            select(StudentFee)
            .options(
                selectinload(StudentFee.student).selectinload(Student.parent)
            )
            .where(
                StudentFee.due_amount > 0,
                StudentFee.due_date >= seven_days_ago,
                StudentFee.due_date <= seven_days_ahead
            )
        )
        
        result = await db.execute(stmt)
        fees = result.scalars().all()
        
        notifications_created = 0
        
        today_date = date.today()
        
        for fee in fees:
            # Global Safeguard: Skip if already fully paid (Monitoring log)
            if fee.due_amount <= 0:
                logger.warning(f"MONITOR_SAFEGUARD: Skipping StudentFee {fee.id} as due_amount is {fee.due_amount}.")
                continue

            # Timezone-aware date comparison for idempotency
            last_notified_date = fee.last_notified_at.date() if fee.last_notified_at else None
            
            days_diff = (fee.due_date - today_date).days
            overdue_days = abs(days_diff) if days_diff < 0 else 0
            
            # --- LOGIC 1: DAILY NOTIFICATIONS (within -7 to +7 window) ---
            # Step 1: Idempotency Check (Date-based)
            if abs(days_diff) <= 7 and last_notified_date != today_date:
                if not fee.student or not fee.student.parent or not fee.student.parent.user_id:
                    logger.warning(f"MONITOR_SKIP: Student {fee.student_id} missing parent contact info.")
                    continue
                    
                parent_user_id = fee.student.parent.user_id
                title = "Fee Payment Reminder"
                
                if days_diff > 0:
                    message = f"Fee of ₹{fee.due_amount} for {fee.student.name} is due in {days_diff} days."
                elif days_diff == 0:
                    message = f"Fee of ₹{fee.due_amount} for {fee.student.name} is due today."
                else:
                    message = f"Fee of ₹{fee.due_amount} for {fee.student.name} is overdue by {overdue_days} days."
                    
                # Step 2 & 3: Atomic Insert and Update
                try:
                    await notification_service.create_notification(
                        db,
                        institution_id=fee.institution_id,
                        user_id=parent_user_id,
                        title=title,
                        message=message,
                        n_type="FEE_REMINDER"
                    )
                    # Update timestamp IMMEDIATELY in session
                    fee.last_notified_at = datetime.now()
                    notifications_created += 1
                    logger.info(f"AUDIT_NOTIFICATION: Sent to Parent {parent_user_id} for Student {fee.student_id}")
                except Exception as e:
                    logger.error(f"MONITOR_ERROR: Failed to notify parent of student {fee.student_id}: {e}")
                    continue

            # --- LOGIC 2: CALL TRIGGERS (Overdue > 7 days) ---
            if overdue_days > 7:
                last_called_date = fee.last_called_at.date() if fee.last_called_at else None
                # Interval Check: STRICT 7 days safeguard
                if not last_called_date or (today_date - last_called_date).days >= 7:
                    if not fee.student or not fee.student.parent or not fee.student.parent.phone:
                        logger.warning(f"MONITOR_SKIP_CALL: Student {fee.student_id} missing phone number.")
                        continue
                        
                    parent_phone = fee.student.parent.phone
                    call_message = f"Dear parent, your child's fee of rupees {fee.due_amount} for {fee.student.name} is pending. You are delayed by {overdue_days} days."
                    
                    # Step 1: Update timestamp BEFORE calling (Optimistic Lock)
                    fee.last_called_at = datetime.now()
                    await db.flush()
                    
                    # Step 2: TRIGGER EXTERNAL CALL
                    try:
                        logger.info(f"AUDIT_CALL: Initiated for Student {fee.student_id}, Phone {parent_phone}")
                        await trigger_fee_call(fee, parent_phone, call_message)
                        notifications_created += 1 
                    except Exception as e:
                        logger.error(f"MONITOR_CALL_ERROR: Failed for student {fee.student_id}: {e}")
            
        await db.commit()
        return f"Processed {len(fees)} fees, created/triggered {notifications_created} actions."

async def trigger_fee_call(fee: StudentFee, phone_number: str, message: str):
    """
    Triggers an automated voice call using the CallService (Exotel).
    """
    await call_service.trigger_call(phone_number, message)
