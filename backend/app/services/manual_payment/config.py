"""
Per-institution payment-settings resolver.

Each school in a multi-tenant deployment maintains its own UPI / bank /
QR details from the admin portal. They are stored in
`institution_payment_settings` (one row per institution_id) and read by
both the parent and admin manual-payment surfaces.

This module is the single place that knows how to build the read-only
parent view and the editable admin view — keep it free of route logic.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import Institution, User
from app.models.manual_payment import InstitutionPaymentSettings
from app.schemas.manual_payment import (
    InstitutionPaymentSettingsResponse,
    InstitutionPaymentSettingsUpdate,
    SchoolPaymentInfoResponse,
)


async def _resolve_institution_name(db: AsyncSession, institution_id: int) -> str:
    res = await db.execute(
        select(Institution.name).where(Institution.id == institution_id)
    )
    return res.scalar() or "Your School"


async def _get_settings_row(
    db: AsyncSession, institution_id: int,
) -> Optional[InstitutionPaymentSettings]:
    res = await db.execute(
        select(InstitutionPaymentSettings).where(
            InstitutionPaymentSettings.institution_id == institution_id
        )
    )
    return res.scalars().first()


def _is_configured(row: Optional[InstitutionPaymentSettings]) -> bool:
    if not row:
        return False
    return bool(row.upi_id or row.bank_account_number or row.qr_image_url)


async def get_school_payment_info(
    db: AsyncSession, *, institution_id: int,
) -> SchoolPaymentInfoResponse:
    """Parent-facing read view. Always returns a payload — empty when unset."""
    school_name = await _resolve_institution_name(db, institution_id)
    row = await _get_settings_row(db, institution_id)
    return SchoolPaymentInfoResponse(
        school_name=school_name,
        upi_id=row.upi_id if row else None,
        upi_display_name=row.upi_display_name if row else None,
        bank_name=row.bank_name if row else None,
        bank_account_number=row.bank_account_number if row else None,
        bank_ifsc=row.bank_ifsc if row else None,
        bank_account_holder=row.bank_account_holder if row else None,
        qr_image_url=row.qr_image_url if row else None,
        payment_instructions=row.payment_instructions if row else None,
        is_configured=_is_configured(row),
    )


async def get_admin_settings(
    db: AsyncSession, *, institution_id: int,
) -> InstitutionPaymentSettingsResponse:
    """Admin-facing read view — includes audit fields."""
    school_name = await _resolve_institution_name(db, institution_id)
    row = await _get_settings_row(db, institution_id)

    updated_by_name: Optional[str] = None
    if row and row.updated_by_user_id:
        ur = await db.execute(
            select(User.name).where(User.id == row.updated_by_user_id)
        )
        updated_by_name = ur.scalar()

    return InstitutionPaymentSettingsResponse(
        school_name=school_name,
        upi_id=row.upi_id if row else None,
        upi_display_name=row.upi_display_name if row else None,
        bank_name=row.bank_name if row else None,
        bank_account_number=row.bank_account_number if row else None,
        bank_ifsc=row.bank_ifsc if row else None,
        bank_account_holder=row.bank_account_holder if row else None,
        qr_image_url=row.qr_image_url if row else None,
        payment_instructions=row.payment_instructions if row else None,
        is_configured=_is_configured(row),
        updated_at=row.updated_at if row else None,
        updated_by_name=updated_by_name,
    )


async def _get_or_create(
    db: AsyncSession, *, institution_id: int,
) -> InstitutionPaymentSettings:
    row = await _get_settings_row(db, institution_id)
    if row:
        return row
    row = InstitutionPaymentSettings(institution_id=institution_id)
    db.add(row)
    await db.flush()
    return row


async def upsert_admin_settings(
    db: AsyncSession,
    *,
    institution_id: int,
    payload: InstitutionPaymentSettingsUpdate,
    actor_user_id: int,
) -> InstitutionPaymentSettings:
    row = await _get_or_create(db, institution_id=institution_id)
    for field in (
        "upi_id", "upi_display_name",
        "bank_name", "bank_account_number", "bank_ifsc", "bank_account_holder",
        "payment_instructions",
    ):
        setattr(row, field, getattr(payload, field))
    row.updated_by_user_id = actor_user_id
    await db.flush()
    await db.commit()
    return row


async def set_qr_image_url(
    db: AsyncSession, *, institution_id: int, qr_url: Optional[str],
    actor_user_id: int,
) -> InstitutionPaymentSettings:
    row = await _get_or_create(db, institution_id=institution_id)
    row.qr_image_url = qr_url
    row.updated_by_user_id = actor_user_id
    await db.flush()
    await db.commit()
    return row
