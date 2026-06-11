"""
Academic-year lifecycle models: the year entity itself, the per-year
student enrollment snapshot, and the promotion-run audit/idempotency record.

These make the academic year a first-class concept. Before this, the only
year-aware table was FinanceLedger (a denormalised string column). Student
class membership lived solely on the mutable Student.school_class_id pointer,
so historical rosters were unrecoverable and a new year could not start with
clean academic data.

Design notes:
  - `AcademicYear.is_active` (NOT `status`) decides which year new academic
    writes attach to. `status` is a human-facing lifecycle label, so a year
    can be PROMOTION_COMPLETED (corrections still allowed) without being the
    active write target.
  - `Enrollment` is the source of truth for "who was in which class which
    year". Student.school_class_id stays as the denormalised *current* pointer
    so the hot login/roster query is untouched.
  - The `*_snapshot` columns capture grade/section/class names at enrollment
    time — mirroring FinanceLedger.student_name/class_name — so renaming a
    grade later never rewrites history.
"""
from sqlalchemy import (
    Column, Integer, String, ForeignKey, Boolean, Date, JSON, UniqueConstraint, Index,
)
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.core import TimestampMixin


# AcademicYear.status values. Strings (not a DB enum) to match the project's
# preference for simple, migration-friendly status columns (see User.role).
ACADEMIC_YEAR_ACTIVE = "ACTIVE"
ACADEMIC_YEAR_PROMOTION_COMPLETED = "PROMOTION_COMPLETED"
ACADEMIC_YEAR_CLOSED = "CLOSED"

# Enrollment.status values — the outcome of a student's year.
ENROLLMENT_ACTIVE = "ACTIVE"
ENROLLMENT_PROMOTED = "PROMOTED"
ENROLLMENT_GRADUATED = "GRADUATED"
ENROLLMENT_RETAINED = "RETAINED"
ENROLLMENT_INACTIVE = "INACTIVE"


class AcademicYear(Base, TimestampMixin):
    """A scholastic year for one institution (e.g. '2026-2027')."""
    __tablename__ = "academic_years"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)

    # Human label, India April–March convention. Generated via
    # finance.ledger_helpers.resolve_academic_year — never re-derive here.
    label = Column(String, nullable=False, index=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    # Exactly one active year per institution (enforced in the service layer).
    # This — not `status` — is the write target for new academic records.
    is_active = Column(Boolean, default=False, nullable=False, index=True)

    # Lifecycle label: ACTIVE -> PROMOTION_COMPLETED -> CLOSED.
    status = Column(String, default=ACADEMIC_YEAR_ACTIVE, nullable=False)

    institution = relationship("Institution")

    __table_args__ = (
        UniqueConstraint("institution_id", "label", name="uq_academic_year_inst_label"),
    )


class Enrollment(Base, TimestampMixin):
    """One row per student per academic year — the historical roster of record."""
    __tablename__ = "enrollments"

    id = Column(Integer, primary_key=True, index=True)

    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    school_class_id = Column(Integer, ForeignKey("school_classes.id"), nullable=True, index=True)
    grade_id = Column(Integer, ForeignKey("grades.id"), nullable=True, index=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=False, index=True)

    status = Column(String, default=ENROLLMENT_ACTIVE, nullable=False, index=True)
    roll_number = Column(Integer, nullable=True)

    # Immutable name snapshots — historical reports must not change when a
    # grade/section/class is renamed later.
    grade_name_snapshot = Column(String, nullable=True)
    section_name_snapshot = Column(String, nullable=True)
    class_name_snapshot = Column(String, nullable=True)

    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)

    student = relationship("Student")
    academic_year = relationship("AcademicYear")
    school_class = relationship("SchoolClass")

    __table_args__ = (
        UniqueConstraint("student_id", "academic_year_id", name="uq_enrollment_student_year"),
        Index("ix_enrollment_year_class", "academic_year_id", "school_class_id"),
    )


class PromotionRun(Base, TimestampMixin):
    """Audit + idempotency record for a year-end promotion.

    Unique on (institution_id, from_year_id) so re-running a promotion for an
    already-promoted year is a no-op that returns the stored summary instead
    of double-advancing students.
    """
    __tablename__ = "promotion_runs"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)

    from_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=False, index=True)
    to_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=False, index=True)

    performed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    summary = Column(JSON, nullable=True)

    institution = relationship("Institution")

    __table_args__ = (
        UniqueConstraint("institution_id", "from_year_id", name="uq_promotion_run_inst_from_year"),
    )
