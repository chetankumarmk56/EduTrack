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
    res = requests.get("http://localhost:8000/api/system/initialize", headers=headers)
    print("Initialize Status:", res.status_code)
    print("Initialize Response:", res.text)
    
    res2 = requests.get("http://localhost:8000/api/academic/classes", headers=headers)
    print("Classes Status:", res2.status_code)
    print("Classes Response:", res2.text)
