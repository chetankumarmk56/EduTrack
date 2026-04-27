import asyncio
from app.core.database import AsyncSessionLocal
from app.schemas.directory import StudentCreate
from app.api.routes.students import create_student
from app.core.dependencies import UserContext

async def main():
    async with AsyncSessionLocal() as db:
        student_data = StudentCreate(
            name="tear_api",
            email=None,
            dob="17/09/2024",
            whatsapp="123457890",
            parent_name="tesdyhf",
            parent_email="u6ysr@gmail.com",
            parent_phone="98765434567",
            password="testpassword"
        )
        user = UserContext(id=1, role="admin", institution_id=1, name="Admin")
        try:
            res = await create_student(student=student_data, db=db, user=user)
            print("Response:", res)
            print("Type:", type(res))
        except Exception as e:
            print("Exception:", e)

if __name__ == "__main__":
    asyncio.run(main())
