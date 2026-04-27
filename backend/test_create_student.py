import asyncio
from app.core.database import AsyncSessionLocal
from app.services.student_service import student_service
from app.schemas.directory import StudentCreate

async def main():
    async with AsyncSessionLocal() as db:
        student_data = StudentCreate(
            name="tear",
            dob="17/09/2024",
            whatsapp="123457890",
            parent_name="tesdyhf",
            parent_email="u6ysr@gmail.com",
            parent_phone="98765434567",
            password="testpassword",
            is_active=True
        )
        try:
            result = await student_service.create_student(db, 1, student_data)
            print("Result:", result)
        except Exception as e:
            print("Exception:", e)

if __name__ == "__main__":
    asyncio.run(main())
