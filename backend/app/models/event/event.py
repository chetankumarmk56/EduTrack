from sqlalchemy import Column, Integer, String, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.core import TimestampMixin

class Event(Base, TimestampMixin):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String, nullable=True)
    type = Column(String) # 'exam', 'meeting', 'holiday', 'sports'
    category = Column(String, default="General")
    date = Column(String)
    end_date = Column(String, nullable=True)
    time = Column(String)
    location = Column(String)
    is_holiday = Column(Boolean, nullable=False, default=False, server_default="false")
    
    # Target Roles for visibility: e.g. {"teacher": true, "parent": true}
    visibility = Column(JSON, default=dict) 

    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True, default=1)
    institution = relationship("Institution", back_populates="events")
