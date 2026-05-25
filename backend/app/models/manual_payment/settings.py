"""
Per-institution payment settings for the manual payment workflow.

One row per institution. Replaces the env-variable approach so a single
deployment can serve many schools, each with its own UPI/QR/bank account.
Admin/finance users of an institution own their row exclusively.
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.core import TimestampMixin


class InstitutionPaymentSettings(Base, TimestampMixin):
    __tablename__ = "institution_payment_settings"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(
        Integer,
        ForeignKey("institutions.id"),
        nullable=False,
        unique=True,
        index=True,
    )

    # UPI
    upi_id = Column(String(160), nullable=True)
    upi_display_name = Column(String(200), nullable=True)

    # Bank
    bank_name = Column(String(200), nullable=True)
    bank_account_number = Column(String(80), nullable=True)
    bank_ifsc = Column(String(40), nullable=True)
    bank_account_holder = Column(String(200), nullable=True)

    # Visual + free-form
    qr_image_url = Column(String(1024), nullable=True)
    payment_instructions = Column(Text, nullable=True)

    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    institution = relationship("Institution")
    updated_by = relationship("User")
