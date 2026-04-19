from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.models.communication import Announcement
from app.schemas.communication import AnnouncementCreate, AnnouncementUpdate, AnnouncementResponse
from app.models.core import User

router = APIRouter(prefix="/api/announcements", tags=["Announcements"])

@router.get("/", response_model=List[AnnouncementResponse])
def get_announcements(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fetch all relevant announcements for the current user.
    Admins see everything. Teachers/Parents see targeted or 'all' announcements.
    """
    query = db.query(Announcement).filter(
        (Announcement.expires_at == None) | (Announcement.expires_at > datetime.now())
    )
    
    if current_user.role not in ["admin", "super_admin"]:
        # Filter for non-admins
        # Students/Parents often see 'all' or 'parent' or 'student'
        # Teachers see 'all' or 'teacher'
        targets = ["all", current_user.role.lower()]
        
        # Additional logic for class-specific announcements could be added here
        # e.g. if current_user.role == "parent": ...
        
        query = query.filter(Announcement.audience.in_(targets))
    
    return query.order_by(Announcement.created_at.desc()).all()

@router.post("/", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
def create_announcement(
    announcement: AnnouncementCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Create a new announcement. Restricted to admins.
    """
    db_announcement = Announcement(
        **announcement.model_dump(),
        created_by_id=admin.id
    )
    db.add(db_announcement)
    db.commit()
    db.refresh(db_announcement)
    return db_announcement

@router.put("/{announcement_id}", response_model=AnnouncementResponse)
def update_announcement(
    announcement_id: int,
    announcement_update: AnnouncementUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Update an existing announcement. Restricted to admins.
    """
    db_announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not db_announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    
    update_data = announcement_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_announcement, key, value)
    
    db.commit()
    db.refresh(db_announcement)
    return db_announcement

@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Delete an announcement. Restricted to admins.
    """
    db_announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not db_announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    
    db.delete(db_announcement)
    db.commit()
    return None
