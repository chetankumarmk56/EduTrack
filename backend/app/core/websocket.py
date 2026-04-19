from fastapi import WebSocket
from typing import List, Dict

class ConnectionManager:
    def __init__(self):
        # Maps bus_id to a list of connected WebSockets
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, bus_id: int):
        await websocket.accept()
        if bus_id not in self.active_connections:
            self.active_connections[bus_id] = []
        self.active_connections[bus_id].append(websocket)

    def disconnect(self, websocket: WebSocket, bus_id: int):
        if bus_id in self.active_connections:
            if websocket in self.active_connections[bus_id]:
                self.active_connections[bus_id].remove(websocket)
            if not self.active_connections[bus_id]:
                del self.active_connections[bus_id]

    async def broadcast(self, bus_id: int, message: dict):
        if bus_id in self.active_connections:
            for connection in self.active_connections[bus_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    # Stale connection, will be handled by disconnect if needed
                    pass

# Global manager instance
manager = ConnectionManager()
