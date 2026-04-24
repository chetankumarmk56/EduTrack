from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any

from app.services.academic_service import academic_service
from app.services.statistics import StatisticsService
from app.services.teacher_service import teacher_service
from app.services.student_service import student_service
from app.core.dependencies import UserContext  # Context object

class SystemService:
    @staticmethod
    async def get_initialization_context(db: AsyncSession, user: UserContext) -> Dict[str, Any]:
        """
        Aggregates all necessary metadata and user-specific stats into a single 
        Composite Payload for high-performance frontend initialization.
        """
        import asyncio

        # 1. Fetch Shared Academic Metadata (Sequential to avoid session concurrency)
        grades = await academic_service.get_grades(db, user.institution_id)
        sections = await academic_service.get_sections(db, user.institution_id)
        subjects = await academic_service.get_subjects(db, user.institution_id)
        school_classes = await academic_service.get_school_classes(db, user.institution_id)

        context = {
            "academic": {
                "grades": grades,
                "sections": sections,
                "subjects": subjects,
                "school_classes": school_classes
            },
            "user": {
                "id": user.id,
                "role": user.role,
                "name": user.name
            },
            "institution_id": user.institution_id
        }

        # 2. Append Role-Specific Data (Sequential to avoid session concurrency)
        if user.role == "teacher":
            stats = await StatisticsService.get_teacher_stats(db, user.institution_id, user.id)
            students = await student_service.get_teacher_students(db, user.institution_id, user.id)
            teacher_info = await teacher_service.get_teacher_by_user_id(db, user.institution_id, user.id)

            context["stats"] = stats
            context["students"] = students
            if teacher_info:
                context["teacher_details"] = teacher_info

        elif user.role in ["admin", "super_admin"]:
            # Admins only need academic metadata for the initial layout.
            # Directories (students/teachers) should be lazy-loaded on their respective pages.
            pass

        return context

system_service = SystemService()
