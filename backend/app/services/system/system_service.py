from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict, Any
import asyncio

from app.services.academic import academic_service
from app.services.statistics import StatisticsService
from app.services.teacher import teacher_service
from app.services.student import student_service
from app.services.storage_service import storage_service
from app.core.dependencies import UserContext
from app.core.database import AsyncSessionLocal
from app.core.logger import logger
from app.models.core import Institution

class SystemService:
    @staticmethod
    async def get_initialization_context(db: AsyncSession, user: UserContext) -> Dict[str, Any]:
        """
        High-performance consolidated initialization context.
        Uses parallel execution for non-dependent academic metadata and role-specific data.
        """
        # Define parallel fetch tasks for shared metadata
        # Spawning separate sessions to allow concurrent database queries (AsyncSession is not thread-safe)
        async def fetch_grades():
            async with AsyncSessionLocal() as session:
                return await academic_service.get_grades(session, user.institution_id)
        
        async def fetch_sections():
            async with AsyncSessionLocal() as session:
                return await academic_service.get_sections(session, user.institution_id)
                
        async def fetch_subjects():
            async with AsyncSessionLocal() as session:
                return await academic_service.get_subjects(session, user.institution_id)
                
        async def fetch_classes():
            async with AsyncSessionLocal() as session:
                return await academic_service.get_school_classes(session, user.institution_id)

        async def fetch_institution_meta():
            # One query for both fields so callers get the school's display
            # name AND logo identifier in a single round-trip. The logo
            # column was added in migration n2c3d4e5f6a7; nullable, so most
            # of today's institutions will return (name, None).
            #
            # Defensive: if the deployment hasn't run that migration yet,
            # the `logo_url` column doesn't exist on Postgres and the SELECT
            # raises ProgrammingError. We fall back to a name-only query so
            # `/system/initialize` keeps working and the dashboard renders
            # — the missing logo just degrades to the generic Building2
            # fallback until the migration is applied.
            async with AsyncSessionLocal() as session:
                try:
                    result = await session.execute(
                        select(Institution.name, Institution.logo_url).where(
                            Institution.id == user.institution_id
                        )
                    )
                    row = result.first()
                    return row if row else (None, None)
                except Exception as e:
                    logger.warning(
                        "fetch_institution_meta: logo_url unavailable (%s) — falling back to name-only. "
                        "Run `alembic upgrade head` to enable school logos.",
                        e.__class__.__name__,
                    )
                async with AsyncSessionLocal() as session2:
                    result = await session2.execute(
                        select(Institution.name).where(Institution.id == user.institution_id)
                    )
                    name = result.scalar()
                    return (name, None)

        # Execute academic metadata queries in parallel
        grades, sections, subjects, school_classes, inst_meta = await asyncio.gather(
            fetch_grades(),
            fetch_sections(),
            fetch_subjects(),
            fetch_classes(),
            fetch_institution_meta(),
        )

        institution_name, institution_logo_identifier = inst_meta
        institution_logo_url = None
        if institution_logo_identifier:
            try:
                institution_logo_url = await storage_service.resolve_url(institution_logo_identifier)
            except Exception:
                # Never let a logo resolver failure break the dashboard
                # bootstrap — the UI's fallback glyph handles a missing URL.
                institution_logo_url = None

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
            "institution_id": user.institution_id,
            "institution_name": institution_name,
            "institution_logo_url": institution_logo_url,
        }

        # Handle Role-Specific Data in parallel
        if user.role == "teacher":
            async def fetch_teacher_stats():
                async with AsyncSessionLocal() as session:
                    return await StatisticsService.get_teacher_stats(session, user.institution_id, user.id)
            
            async def fetch_teacher_students():
                async with AsyncSessionLocal() as session:
                    return await student_service.get_teacher_students(session, user.institution_id, user.id)
            
            async def fetch_teacher_details():
                async with AsyncSessionLocal() as session:
                    return await teacher_service.get_teacher_by_user_id(session, user.institution_id, user.id)

            stats, students, teacher_info = await asyncio.gather(
                fetch_teacher_stats(),
                fetch_teacher_students(),
                fetch_teacher_details()
            )

            context["stats"] = stats
            context["students"] = students
            if teacher_info:
                context["teacher_details"] = teacher_info

        return context

system_service = SystemService()
