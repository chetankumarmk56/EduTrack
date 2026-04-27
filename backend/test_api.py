import asyncio
from app.core.database import AsyncSessionLocal
from app.services.auth_service import auth_service

async def get_token():
    async with AsyncSessionLocal() as db:
        # Get an admin user
        auth_data = await auth_service.authenticate_portal(db, 1, "admin@nexus.edu", "password", "admin")
        if auth_data:
            return auth_data["access_token"]
        return None

if __name__ == "__main__":
    token = asyncio.run(get_token())
    if token:
        import requests
        headers = {"Authorization": f"Bearer {token}"}
        payload = {
            "name": "tear_api_test",
            "dob": "17/09/2024",
            "whatsapp": "123457890",
            "parent_name": "tesdyhf",
            "parent_email": "u6ysr@gmail.com",
            "parent_phone": "98765434567",
            "password": "testpassword",
            "is_active": True
        }
        res = requests.post("http://localhost:8000/api/directory/", json=payload, headers=headers)
        print("Status:", res.status_code)
        print("Response:", res.text)
    else:
        print("Failed to get token")
