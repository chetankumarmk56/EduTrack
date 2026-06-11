"""
Academic-year resolution and rollover.

`get_active_year` is the single source of truth for "which year do new academic
writes belong to" — attendance, marks, exams and fees all stamp the id it
returns. `create_and_activate_next_year` performs the year rollover during
promotion.

The April–March label convention is owned by
finance.ledger_helpers.resolve_academic_year — we reuse it rather than
re-deriving the boundary here.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger import logger
from app.models.academic import (
    AcademicYear,
    ACADEMIC_YEAR_ACTIVE,
    ACADEMIC_YEAR_PROMOTION_COMPLETED,
)
from app.services.finance.ledger_helpers import resolve_academic_year


def _date_bounds_for_label(label: str) -> tuple[Optional[date], Optional[date]]:
    """'2026-2027' -> (1 Apr 2026, 31 Mar 2027). Returns (None, None) on a
    malformed label so a bad string never blocks year creation."""
    try:
        start_year = int(label.split("-")[0])
    except (ValueError, IndexError, AttributeError):
        return None, None
    return date(start_year, 4, 1), date(start_year + 1, 3, 31)


def next_year_label(label: str) -> str:
    """'2026-2027' -> '2027-2028'. Falls back to today's resolution on a
    malformed input."""
    try:
        start_year = int(label.split("-")[0])
        return f"{start_year + 1}-{start_year + 2}"
    except (ValueError, IndexError, AttributeError):
        today_label = resolve_academic_year()
        return next_year_label(today_label) if today_label != label else today_label


class AcademicYearService:
    @staticmethod
    async def get_active_year(
        db: AsyncSession, institution_id: int, *, create_if_missing: bool = True
    ) -> Optional[AcademicYear]:
        """Return the institution's active year.

        If none exists and ``create_if_missing`` is set, lazily create the
        current calendar's year (so institutions created after the backfill
        migration still work). The new row is flushed — not committed — so it
        participates in the caller's transaction.
        """
        result = await db.execute(
            select(AcademicYear).where(
                AcademicYear.institution_id == institution_id,
                AcademicYear.is_active.is_(True),
            ).limit(1)
        )
        year = result.scalars().first()
        if year or not create_if_missing:
            return year

        label = resolve_academic_year()
        start, end = _date_bounds_for_label(label)
        year = AcademicYear(
            institution_id=institution_id,
            label=label,
            start_date=start,
            end_date=end,
            is_active=True,
            status=ACADEMIC_YEAR_ACTIVE,
        )
        db.add(year)
        try:
            await db.flush()
        except IntegrityError:
            # A concurrent writer created it first (unique inst+label) — re-read.
            await db.rollback()
            result = await db.execute(
                select(AcademicYear).where(
                    AcademicYear.institution_id == institution_id,
                    AcademicYear.is_active.is_(True),
                ).limit(1)
            )
            year = result.scalars().first()
        return year

    @staticmethod
    async def resolve_active_year_id(db: AsyncSession, institution_id: int) -> Optional[int]:
        """Convenience for write paths that only need the id to stamp rows."""
        year = await AcademicYearService.get_active_year(db, institution_id)
        return year.id if year else None

    @staticmethod
    async def list_years(db: AsyncSession, institution_id: int) -> list[AcademicYear]:
        result = await db.execute(
            select(AcademicYear)
            .where(AcademicYear.institution_id == institution_id)
            .order_by(AcademicYear.label.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def create_and_activate_next_year(
        db: AsyncSession, institution_id: int, label: str
    ) -> AcademicYear:
        """Roll over to ``label``.

        Flips the current active year to is_active=False /
        status=PROMOTION_COMPLETED (NOT closed — corrections stay possible),
        then creates/activates the target year. Idempotent on the target label:
        if a year with ``label`` already exists it is (re)activated rather than
        duplicated. Flushes within the caller's transaction; does not commit.
        """
        # Demote the current active year to "promotion completed".
        current = await AcademicYearService.get_active_year(
            db, institution_id, create_if_missing=False
        )
        if current and current.label != label:
            current.is_active = False
            current.status = ACADEMIC_YEAR_PROMOTION_COMPLETED

        # Reuse an existing row for this label if present, else create it.
        existing = await db.execute(
            select(AcademicYear).where(
                AcademicYear.institution_id == institution_id,
                AcademicYear.label == label,
            ).limit(1)
        )
        target = existing.scalars().first()
        if target:
            target.is_active = True
            target.status = ACADEMIC_YEAR_ACTIVE
        else:
            start, end = _date_bounds_for_label(label)
            target = AcademicYear(
                institution_id=institution_id,
                label=label,
                start_date=start,
                end_date=end,
                is_active=True,
                status=ACADEMIC_YEAR_ACTIVE,
            )
            db.add(target)
        await db.flush()
        logger.info(
            f"ACADEMIC_YEAR: institution {institution_id} rolled over to {label} "
            f"(year id {target.id})"
        )
        return target


academic_year_service = AcademicYearService()
