"""
Central tenant-scoping helpers.

EduTrack is multi-tenant: every row that belongs to a school carries an
``institution_id``. Isolation is enforced per-query — there is no database-
level row security — so EVERY read/write of a tenant-owned row must filter on
``institution_id``. History shows that hand-writing that filter in each query
eventually leaks one: a by-id fetch that forgets ``institution_id`` lets an
admin of School A modify or delete School B's row (cross-tenant IDOR).

This module makes the scoped path the path of least resistance. Prefer these
helpers over a bare ``select(Model).where(Model.id == x)`` whenever the model
is tenant-owned:

    from app.core.tenant import get_scoped_or_404, scoped_select, tenant_owns

    # Fetch one row, 404 if it isn't in the caller's institution:
    section = await get_scoped_or_404(db, Section, section_id, institution_id)

    # Build a list query already filtered to the tenant:
    stmt = scoped_select(Subject, institution_id).order_by(Subject.name)

    # Existence / ownership check without loading the row:
    ok = await tenant_owns(db, Announcement, institution_id,
                           Announcement.id == announcement_id)

Safety rail: every helper calls ``_tenant_column`` which raises ``TypeError``
if the model has no ``institution_id`` column. That turns "I used a tenant
helper on a global table" (or vice-versa) into a loud import-time-ish error
instead of a silent missing filter.
"""
from __future__ import annotations

from typing import Any, Optional, Sequence, Type, TypeVar

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select
from sqlalchemy.sql.elements import ColumnElement

M = TypeVar("M")


def _tenant_column(model: Type[Any]) -> ColumnElement:
    """
    Return the model's ``institution_id`` column, or raise if the model is
    not tenant-owned. This is the guard that stops these helpers from being
    used on global tables (institutions, cron_locks) where they'd silently
    do the wrong thing.
    """
    col = getattr(model, "institution_id", None)
    if col is None:
        raise TypeError(
            f"{model.__name__} has no `institution_id` column and is not a "
            "tenant-scoped model. Do not use tenant helpers on it."
        )
    return col


def tenant_filter(model: Type[Any], institution_id: int) -> ColumnElement:
    """The ``Model.institution_id == institution_id`` predicate."""
    return _tenant_column(model) == institution_id


def scoped_select(model: Type[M], institution_id: int, *criteria: Any) -> Select:
    """
    ``select(model)`` pre-filtered to the institution, plus any extra
    ``criteria``. Use this as the base for list/detail queries so the tenant
    filter can never be forgotten.
    """
    return select(model).where(tenant_filter(model, institution_id), *criteria)


async def get_scoped(
    db: AsyncSession,
    model: Type[M],
    record_id: Any,
    institution_id: int,
    *,
    options: Sequence[Any] = (),
) -> Optional[M]:
    """
    Fetch a single row by primary key, scoped to the institution. Returns
    ``None`` if the row does not exist OR belongs to a different institution
    (the two are deliberately indistinguishable to the caller).

    ``options`` accepts loader options (e.g. ``selectinload(...)``).
    """
    stmt = scoped_select(model, institution_id, model.id == record_id)
    for opt in options:
        stmt = stmt.options(opt)
    result = await db.execute(stmt)
    return result.scalars().first()


async def get_scoped_or_404(
    db: AsyncSession,
    model: Type[M],
    record_id: Any,
    institution_id: int,
    *,
    options: Sequence[Any] = (),
    detail: Optional[str] = None,
) -> M:
    """Like :func:`get_scoped`, but raises 404 instead of returning ``None``."""
    obj = await get_scoped(db, model, record_id, institution_id, options=options)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail or f"{model.__name__} not found or access denied",
        )
    return obj


async def tenant_owns(
    db: AsyncSession,
    model: Type[Any],
    institution_id: int,
    *criteria: Any,
) -> bool:
    """
    Existence/ownership probe: does a row matching ``criteria`` exist within
    this institution? Selects only the id with ``LIMIT 1`` — use this when you
    need to authorize an action without loading the whole row.
    """
    stmt = (
        select(model.id)
        .where(tenant_filter(model, institution_id), *criteria)
        .limit(1)
    )
    return (await db.execute(stmt)).scalar() is not None
