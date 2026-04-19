import requests

base_url = "http://localhost:8000/api"
resp = requests.post(f"{base_url}/auth/login", data={"username": "admin@stmarys.edu", "password": "admin123"}, headers={"Content-Type": "application/x-www-form-urlencoded"})

if resp.status_code == 200:
    token = resp.json()["access_token"]
    routes_resp = requests.get(f"{base_url}/transport/routes", headers={"Authorization": f"Bearer {token}"})
    print("STATUS:", routes_resp.status_code)
    try:
        print("JSON:", routes_resp.json())
    except:
        print("TEXT:", routes_resp.text)
else:
    print("LOGIN FAILED:", resp.status_code, resp.text)
