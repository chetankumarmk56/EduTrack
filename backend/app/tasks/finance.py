import asyncio
from datetime import date, datetime, timedelta
from typing import Optional
from sqlalchemy import select, and_, or_, delete
from sqlalchemy.orm import selectinload

from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.models.finance import StudentFee
from app.models.directory import Student, Parent
from app.models.communication import Notification
from app.services.notification import notification_service
from app.services.call import call_service
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

    Behavior:
    - In-app notifications: For fees in the ±7-day window around the due date — once daily.
    - Voice calls: Triggered the day after the due_date passes and repeated every 7 days
      thereafter, until the fee is fully paid (due_amount <= 0). The call is skipped
      silently if the parent has no phone number on file.
    """
    async with AsyncSessionLocal() as db:
        today_date = date.today()
        seven_days_ahead = today_date + timedelta(days=7)

        # Pull every fee with outstanding dues that is either:
        #   (a) within the upcoming-notification window (due_date <= +7d), OR
        #   (b) already past the deadline (due_date < today)
        # A single ceiling of `due_date <= +7d` covers both — paid fees are excluded
        # by the `due_amount > 0` filter.
        stmt = (
            select(StudentFee)
            .options(
                selectinload(StudentFee.student).selectinload(Student.parent)
            )
            .where(
                StudentFee.due_amount > 0,
                StudentFee.due_date <= seven_days_ahead,
            )
        )

        result = await db.execute(stmt)
        fees = result.scalars().all()

        notifications_created = 0
        calls_triggered = 0

        for fee in fees:
            # Race-condition safeguard: a payment may have just landed.
            if fee.due_amount <= 0:
                logger.warning(
                    f"MONITOR_SAFEGUARD: Skipping StudentFee {fee.id} as due_amount is {fee.due_amount}."
                )
                continue

            days_diff = (fee.due_date - today_date).days
            overdue_days = abs(days_diff) if days_diff < 0 else 0

            # --- LOGIC 1: DAILY NOTIFICATIONS (within ±7 day window) ---
            last_notified_date = (
                fee.last_notified_at.date() if fee.last_notified_at else None
            )
            if abs(days_diff) <= 7 and last_notified_date != today_date:
                if (
                    fee.student
                    and fee.student.parent
                    and fee.student.parent.user_id
                ):
                    parent_user_id = fee.student.parent.user_id
                    title = "Fee Payment Reminder"

                    if days_diff > 0:
                        message = (
                            f"Fee of ₹{fee.due_amount} for {fee.student.name} "
                            f"is due in {days_diff} days."
                        )
                    elif days_diff == 0:
                        message = (
                            f"Fee of ₹{fee.due_amount} for {fee.student.name} "
                            f"is due today."
                        )
                    else:
                        message = (
                            f"Fee of ₹{fee.due_amount} for {fee.student.name} "
                            f"is overdue by {overdue_days} days."
                        )

                    try:
                        await notification_service.create_notification(
                            db,
                            institution_id=fee.institution_id,
                            user_id=parent_user_id,
                            title=title,
                            message=message,
                            n_type="FEE_REMINDER",
                        )
                        fee.last_notified_at = datetime.now()
                        notifications_created += 1
                        logger.info(
                            f"AUDIT_NOTIFICATION: Sent to Parent {parent_user_id} "
                            f"for Student {fee.student_id}"
                        )
                    except Exception as e:
                        logger.error(
                            f"MONITOR_ERROR: Failed to notify parent of student "
                            f"{fee.student_id}: {e}"
                        )
                else:
                    logger.warning(
                        f"MONITOR_SKIP: Student {fee.student_id} missing parent contact info."
                    )

            # --- LOGIC 2: WEEKLY VOICE CALLS (any time after due_date passes) ---
            # Trigger once the deadline has passed, then repeat every 7 days
            # until the fee is fully paid. Silently skip when there is no phone.
            if overdue_days > 0:
                parent_phone = _resolve_parent_phone(fee.student)
                if not parent_phone:
                    logger.info(
                        f"CALL_SKIP_NO_PHONE: Student {fee.student_id} has no parent "
                        f"phone on file — skipping call."
                    )
                    continue

                # Weekly cadence — only call if last call was null or ≥ 7 days ago.
                last_called_date = (
                    fee.last_called_at.date() if fee.last_called_at else None
                )
                if last_called_date and (today_date - last_called_date).days < 7:
                    continue

                # Build the TTS message: remaining amount + last pay date + polite ask.
                amount_label = _format_amount_for_tts(fee.due_amount)
                due_date_label = fee.due_date.strftime("%d %B %Y")
                student_name = fee.student.name if fee.student else "your ward"
                call_message = (
                    f"Dear Parent, this is an automated reminder from your school. "
                    f"A fee of rupees {amount_label} for {student_name} is still pending. "
                    f"The last date for payment was {due_date_label}. "
                    f"We kindly request you to pay the amount as soon as possible. "
                    f"Thank you."
                )

                # Optimistic-lock: claim the call slot BEFORE the network request,
                # so a second worker (or retry) won't double-call.
                fee.last_called_at = datetime.now()
                await db.flush()

                try:
                    logger.info(
                        f"AUDIT_CALL: Initiated for Student {fee.student_id}, "
                        f"Phone {parent_phone}, Overdue {overdue_days}d, "
                        f"Due ₹{fee.due_amount}"
                    )
                    await trigger_fee_call(fee, parent_phone, call_message)
                    calls_triggered += 1
                except Exception as e:
                    logger.error(
                        f"MONITOR_CALL_ERROR: Failed for student {fee.student_id}: {e}"
                    )

        await db.commit()
        return (
            f"Processed {len(fees)} fees — "
            f"{notifications_created} notifications, {calls_triggered} calls."
        )


def _resolve_parent_phone(student) -> Optional[str]:
    """
    Look up the parent phone for a student. Tries the linked Parent record first,
    falls back to the inline parent_phone column on the Student row (used when
    the parent shares the student's login and has no Parent table entry).
    """
    if not student:
        return None
    if student.parent and student.parent.phone:
        phone = (student.parent.phone or "").strip()
        if phone:
            return phone
    inline = getattr(student, "parent_phone", None)
    if inline:
        inline = inline.strip()
        if inline:
            return inline
    return None


def _format_amount_for_tts(amount: float) -> str:
    """
    Format a fee amount for clean text-to-speech pronunciation.
    Drops trailing .0 so '1500.0' is read as 'fifteen hundred', not 'fifteen hundred point zero'.
    """
    if amount is None:
        return "0"
    if float(amount).is_integer():
        return str(int(amount))
    return f"{amount:.2f}"


async def trigger_fee_call(fee: StudentFee, phone_number: str, message: str):
    """
    Triggers an automated voice call using the CallService (Exotel).
    """
    await call_service.trigger_call(phone_number, message)
