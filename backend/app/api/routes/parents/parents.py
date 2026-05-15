from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from datetime import date

from app.core.database import get_db
from app.core.dependencies import get_current_user, UserContext
from app.models.directory import Parent, Student
from app.models.finance import StudentFee
from app.schemas.finance import ParentFeeResponse

router = APIRouter(prefix="/api/parent", tags=["Parent Portal"])

@router.get("/fees", response_model=List[ParentFeeResponse])
async def get_parent_fees(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """
    Fetch fees for the logged-in user.
    If parent: fetch for all children.
    If student: fetch for self.
    """
    if user.role not in ["parent", "student"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized to access fee data"
        )

    response = []
    today = date.today()

    if user.role == "parent":
        # 1. Get Parent record
        parent_stmt = select(Parent).where(Parent.user_id == user.id, Parent.institution_id == user.institution_id)
        parent_res = await db.execute(parent_stmt)
        parent = parent_res.scalars().first()
        
        if not parent:
            # Fallback: if parent record missing, try looking up as student
            student_stmt = select(Student).where(Student.user_id == user.id, Student.institution_id == user.institution_id)
            student_res = await db.execute(student_stmt)
            student = student_res.scalars().first()
            if not student:
                return []
            
            # Fetch fees for this student
            stmt = select(Student.name.label("student_name"), StudentFee).join(StudentFee).where(Student.id == student.id)
            result = await db.execute(stmt)
            fees = result.all()
        else:
            # 2. Fetch students and their fees
            stmt = (
                select(Student.name.label("student_name"), StudentFee)
                .join(StudentFee, Student.id == StudentFee.student_id)
                .where(Student.parent_id == parent.id)
            )
            result = await db.execute(stmt)
            fees = result.all()
    else:
        # User is a student
        student_stmt = select(Student).where(Student.user_id == user.id, Student.institution_id == user.institution_id)
        student_res = await db.execute(student_stmt)
        student = student_res.scalars().first()
        
        if not student:
            return []

        stmt = (
            select(Student.name.label("student_name"), StudentFee)
            .join(StudentFee, Student.id == StudentFee.student_id)
            .where(Student.id == student.id)
        )
        result = await db.execute(stmt)
        fees = result.all()

    for row in fees:
        fee = row[1] # StudentFee object
        overdue_days = (today - fee.due_date).days if fee.due_date else 0
        
        response.append(ParentFeeResponse(
            student_name=row.student_name,
            total_amount=fee.total_amount,
            amount_paid=fee.amount_paid,
            due_amount=fee.due_amount,
            due_date=fee.due_date,
            status=fee.status,
            overdue_days=max(0, overdue_days)
        ))
        
    return response
