from fastapi import APIRouter, Depends, status
from datetime import datetime
from app.core.dependencies import get_current_user, require_admin, UserContext, require_payment_admin
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.models.finance import Payment
from app.tasks.reporting import generate_academic_report
from pydantic import BaseModel

router = APIRouter(prefix="/api/reports", tags=["Reporting & Background Tasks"])

class ReportRequest(BaseModel):
    school_class_id: int

@router.post("/academic-summary", status_code=status.HTTP_202_ACCEPTED)
async def trigger_academic_report(
    request: ReportRequest,
    admin: UserContext = Depends(require_admin)
):
    """
    Trigger a heavy academic report generation in the background.
    Returns immediately with a task_id.
    """
    task = generate_academic_report.delay(admin.institution_id, request.school_class_id)
    
    return {
        "status": "processing",
        "message": "Report generation has been offloaded to background workers.",
        "task_id": task.id,
        "poll_endpoint": f"/api/reports/status/{task.id}"
    }

@router.get("/status/{task_id}")
async def get_task_status(task_id: str, admin: UserContext = Depends(require_admin)):
    """
    Check the status of a background task.
    """
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    
    response = {
        "task_id": task_id,
        "status": result.status,
    }
    
    if result.status == 'SUCCESS':
        response["result"] = result.result
    elif result.status == 'FAILURE':
        response["error"] = str(result.info)
    elif result.status == 'PROGRESS':
        response["meta"] = result.info
        
    return response

@router.get("/financial-summary")
async def get_financial_summary(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_payment_admin)
):
    """
    Get a high-level summary of collected fees.
    Restricted to ADMIN and FINANCE roles.
    """
    # Simple aggregation for the demo
    result = await db.execute(select(func.sum(Payment.amount)).where(Payment.institution_id == user.institution_id))
    total_collected = result.scalar() or 0.0
    
    count_result = await db.execute(select(func.count(Payment.id)).where(Payment.institution_id == user.institution_id))
    payment_count = count_result.scalar() or 0
    
    return {
        "total_collected": total_collected,
        "payment_count": payment_count,
        "currency": "INR",
        "generated_at": datetime.now().isoformat()
    }
