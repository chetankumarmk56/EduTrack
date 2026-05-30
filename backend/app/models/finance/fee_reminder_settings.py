"""
Per-institution fee-reminder automation settings.

The fee-reminder engine itself (selection logic + push + voice) lives in
`app.services.finance.fee_reminder_service`. This model decides only
*when* and *whether* automation may fire — manual admin dispatch is
always available and bypasses these settings entirely.

Default for every institution is DISABLED, i.e. reminders only go out
when an admin clicks "Send Fee Reminders" in the Finance UI.
"""
from __future__ import annotations

import enum

from sqlalchemy import (
    Column, Integer, String, Boolean, ForeignKey, DateTime, Text,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.core import TimestampMixin


class FeeReminderAutomationMode(str, enum.Enum):
    """How (if at all) reminders fire without admin intervention."""
    DISABLED = "DISABLED"  # default — no automatic dispatch, admin clicks to send
    WEEKLY = "WEEKLY"      # fire on `day_of_week` at `send_hour`, every week
    MONTHLY = "MONTHLY"    # fire on `day_of_month` at `send_hour`, every month
    CUSTOM = "CUSTOM"      # fire when `next_run_at` says so (admin-managed)


class FeeReminderSettings(Base, TimestampMixin):
    __tablename__ = "fee_reminder_settings"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(
        Integer,
        ForeignKey("institutions.id"),
        nullable=False,
        unique=True,
        index=True,
    )

    automation_mode = Column(
        String(20),
        nullable=False,
        default=FeeReminderAutomationMode.DISABLED.value,
    )

    # WEEKLY: 0..6 (Mon..Sun). MONTHLY: ignored. CUSTOM: ignored.
    day_of_week = Column(Integer, nullable=True)
    # MONTHLY: 1..28 (capped so Feb works). Other modes: ignored.
    day_of_month = Column(Integer, nullable=True)
    # Hour-of-day in `timezone`. 0..23. Used by WEEKLY / MONTHLY.
    send_hour = Column(Integer, nullable=False, default=9)
    timezone = Column(String(64), nullable=False, default="Asia/Kolkata")

    # Eligibility thresholds — overridable per institution. Fall back to
    # the global env defaults (FEE_REMINDER_OVERDUE_DAYS / COOLDOWN_DAYS)
    # when these are NULL on a fresh row.
    overdue_days = Column(Integer, nullable=True)
    cooldown_days = Column(Integer, nullable=True)
    voice_calls_enabled = Column(Boolean, nullable=False, default=True)

    # Observability — populated after each dispatch (manual OR automatic).
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_run_summary = Column(Text, nullable=True)  # JSON-encoded
    last_run_triggered_by = Column(String(40), nullable=True)  # "manual" / "automatic"

    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    institution = relationship("Institution")
    updated_by = relationship("User")
