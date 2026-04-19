from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.core import TimestampMixin

class Announcement(Base, TimestampMixin):
    """
    General school announcements.
    Can be targeted to specific roles/audiences.
    """
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    message = Column(Text)
    audience = Column(String, default="all") # "all", "teacher", "parent", "admin", or class-level e.g. "class_10"
    
    expires_at = Column(DateTime, nullable=True)
    
    # Tracking
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by = relationship("User")

    institution_id = Column(Integer, ForeignKey("institutions.id"), index=True)
    institution = relationship("Institution", back_populates="announcements")
