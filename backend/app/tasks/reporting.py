import time
import logging
from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)

@celery_app.task(name="generate_academic_report", bind=True)
def generate_academic_report(self, institution_id: int, school_class_id: int):
    """
    Simulates a heavy academic report generation task.
    In a real scenario, this would:
    1. Query thousands of marks/attendance records
    2. Perform complex statistical analysis
    3. Generate a PDF/Excel file
    4. Upload to cloud storage
    5. Notify the user/admin
    """
    logger.info(f"Starting heavy report generation for class {school_class_id} in institution {institution_id}")
    
    # Update progress (simulated)
    self.update_state(state='PROGRESS', meta={'percent': 20})
    time.sleep(2) # Simulating heavy DB read
    
    self.update_state(state='PROGRESS', meta={'percent': 50})
    time.sleep(3) # Simulating complex math
    
    self.update_state(state='PROGRESS', meta={'percent': 80})
    time.sleep(2) # Simulating PDF generation
    
    logger.info(f"Report generation complete for class {school_class_id}")
    
    return {
        "status": "completed",
        "institution_id": institution_id,
        "school_class_id": school_class_id,
        "report_url": f"https://storage.edutrack.com/reports/class_{school_class_id}_summary.pdf",
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

@celery_app.task(name="send_bulk_announcement_email")
def send_bulk_announcement_email(announcement_id: int, audience: str):
    """
    Simulates sending emails to hundreds of parents/students.
    Backgrounding this prevents the 'Create Announcement' API from timing out.
    """
    logger.info(f"Sending background emails for announcement {announcement_id} to {audience}")
    time.sleep(5) # Simulating SMTP relay latency
    logger.info(f"Email broadcast finished for announcement {announcement_id}")
    return {"sent_count": 150, "status": "delivered"}
