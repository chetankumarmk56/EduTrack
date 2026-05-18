"""
Device-token management endpoints for push notifications.

Any authenticated user can register their own device. We intentionally do not
expose a list-all or admin-revoke endpoint here — those are out of scope for
the first cut and would warrant their own RBAC review.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, UserContext
from app.schemas.communication import (
    DeviceTokenRegister,
    DeviceTokenResponse,
)
from app.services.push import push_service

router = APIRouter(prefix="/api/devices", tags=["devices"])


@router.post("/tokens", response_model=DeviceTokenResponse, status_code=status.HTTP_201_CREATED)
async def register_device_token(
    payload: DeviceTokenRegister,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_active_user),
):
    """
    Register (or re-register) the caller's Expo push token.

    Idempotent: hitting this with the same token reactivates the row and
    moves it to the current user if it had been issued elsewhere.
    """
    try:
        token = await push_service.register_token(
            db,
            user_id=user.id,
            institution_id=user.institution_id,
            expo_push_token=payload.expo_push_token,
            platform=payload.platform.value,
            device_name=payload.device_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return token


@router.delete("/tokens", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_device_token(
    expo_push_token: str,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_active_user),
):
    """
    Soft-delete the given token. Called on logout. Silently no-ops if the
    token does not exist or does not belong to the caller — avoids leaking
    whether a token exists.
    """
    await push_service.unregister_token(
        db,
        user_id=user.id,
        expo_push_token=expo_push_token,
    )
    return None


@router.get("/tokens/me", response_model=List[DeviceTokenResponse])
async def list_my_tokens(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_active_user),
):
    """List the caller's active tokens — handy for debugging on-device."""
    return await push_service.list_user_tokens(db, user_id=user.id, active_only=True)
