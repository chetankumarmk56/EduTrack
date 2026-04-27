import asyncio
from app.core.security import create_access_token
import requests

def get_token():
    payload = {
        "sub": "1",
        "role": "admin",
        "institution_id": 1,
        "name": "Admin"
    }
    return create_access_token(data=payload)

if __name__ == "__main__":
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "name": "tear_api",
        "dob": "17/09/2024",
        "whatsapp": "123457890",
        "parent_name": "tesdyhf",
        "parent_email": "u6ysr@gmail.com",
        "parent_phone": "98765434567",
        "password": "testpassword",
        "school_class_id": 1
    }
    res = requests.post("http://localhost:8000/api/directory/", json=payload, headers=headers)
    print("Status:", res.status_code)
    print("Response:", res.text)
