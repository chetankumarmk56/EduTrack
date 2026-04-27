import requests

# Login to get token
login_res = requests.post("http://localhost:8000/api/auth/login", data={"username": "admin@stmarys.edu", "password": "password"})
token = login_res.json().get("access_token")

if token:
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "name": "tear",
        "email": "",
        "dob": "17/09/2024",
        "whatsapp": "123457890",
        "parent_name": "tesdyhf",
        "parent_email": "u6ysr@gmail.com",
        "parent_phone": "98765434567",
        "password": "testpassword"
    }
    res = requests.post("http://localhost:8000/api/directory/", json=payload, headers=headers)
    print("Status:", res.status_code)
    print("Response:", res.text)
else:
    print("Login failed")
