from fastapi import APIRouter, Depends, status
from datetime import datetime
from app.core.dependencies import require_admin, UserContext, require_payment_admin
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.models.finance import Payment
from pydantic import BaseModel

router = APIRouter(prefix="/api/reports", tags=["Reporting"])

class ReportRequest(BaseModel):
    school_class_id: int

@router.post("/academic-summary", status_code=status.HTTP_200_OK)
async def trigger_academic_report(
    request: ReportRequest,
    admin: UserContext = Depends(require_admin)
):
    return {
        "status": "completed",
        "institution_id": admin.institution_id,
        "school_class_id": request.school_class_id,
        "report_url": f"https://storage.edutrack.com/reports/class_{request.school_class_id}_summary.pdf",
        "generated_at": datetime.now().isoformat(),
    }

@router.get("/financial-summary")
async def get_financial_summary(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_payment_admin)
):
    """High-level summary of collected fees. Restricted to admin/finance."""
    result = await db.execute(
        select(func.sum(Payment.amount)).where(Payment.institution_id == user.institution_id)
    )
    total_collected = result.scalar() or 0.0

    count_result = await db.execute(
        select(func.count(Payment.id)).where(Payment.institution_id == user.institution_id)
    )
    payment_count = count_result.scalar() or 0

    return {
        "total_collected": total_collected,
        "payment_count": payment_count,
        "currency": "INR",
        "generated_at": datetime.now().isoformat(),
    }
