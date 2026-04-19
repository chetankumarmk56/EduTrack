"""
IoT GPS Simulator
Simulates a school bus moving along a trajectory and pushing telemetry
to the backend via the REST API.
"""

import time
import requests
import argparse
import sys

# Change this if your server differs
API_URL = "http://localhost:8000/api/transport/bus/location"

def generate_dummy_path():
    """Generates a sample diagonal path across Bangalore for testing."""
    start_lat, start_lng = 12.9716, 77.5946
    end_lat, end_lng = 12.9345, 77.6101 # A generic ~5km journey
    steps = 50
    
    path = []
    for i in range(steps + 1):
        fraction = i / steps
        lat = start_lat + (end_lat - start_lat) * fraction
        lng = start_lng + (end_lng - start_lng) * fraction
        path.append({"lat": lat, "lng": lng})
    return path

def run_simulation(device_id: str, interval: int):
    path = generate_dummy_path()
    print(f"🚀 Initializing IoT Simulation for Device: {device_id}")
    print(f"🛰  Target API: {API_URL}")
    print(f"🛣  Path Length: {len(path)} waypoints")
    print(f"⏱  Refresh Rate: {interval} seconds\n")
    
    for i, point in enumerate(path):
        payload = {
            "device_id": device_id,
            "latitude": point["lat"],
            "longitude": point["lng"]
        }
        
        try:
            start_time = time.time()
            # Send the coordinate payload
            response = requests.post(API_URL, json=payload, timeout=5)
            elapsed = (time.time() - start_time) * 1000
            
            if response.status_code in (200, 201):
                # We show green circle for successful POST and track latency
                print(f"[{i+1}/{len(path)}] 🟢 SUCCESS | Lat: {point['lat']:.5f}, Lng: {point['lng']:.5f} | Ping: {elapsed:.0f}ms")
            else:
                print(f"[{i+1}/{len(path)}] 🔴 FAILED (HTTP {response.status_code}) | {response.text}")
        except requests.exceptions.RequestException:
            print(f"[{i+1}/{len(path)}] 🔴 CONNECTION ERROR | Backend offline or unreachable.")
            
        # Don't sleep after the last coordinate
        if i < len(path) - 1:
            time.sleep(interval)
            
    print("\n✅ Simulation Complete. Vehicle has reached its destination.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulate a moving school bus IoT GPS device.")
    parser.add_argument("device_id", type=str, help="The unique device_id of the bus registered in the SaaS.")
    parser.add_argument("--interval", type=int, default=5, help="Seconds between GPS ping updates (default: 5).")
    
    # Prompt for help if args are missing
    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(1)
        
    args = parser.parse_args()
    
    try:
        run_simulation(args.device_id, args.interval)
    except KeyboardInterrupt:
        print("\n\n🛑 Simulation aborted by user.")
        sys.exit(0)
