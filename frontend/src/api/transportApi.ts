import client from './client';

export interface BusStop {
  name: string;
  latitude: number;
  longitude: number;
  stop_order: number;
}

export interface BusStopCreate {
  route_id: number;
  stops: BusStop[];
}

export const transportApi = {
  // Buses
  getBuses: async () => {
    const response = await client.get('transport/buses');
    return response.data;
  },

  // Routes
  getRoutes: async () => {
    const response = await client.get('transport/routes');
    return response.data;
  },

  createRoute: async (data: { name: string; bus_id?: number; polyline?: any[] }) => {
    const response = await client.post('transport/routes', data);
    return response.data;
  },

  saveIntegratedRoute: async (data: { name: string; bus_id?: number; polyline?: any[]; stops: any[] }) => {
    const response = await client.post('transport/routes/integrated', data);
    return response.data;
  },

  updateRoute: async (id: number, data: { name?: string; bus_id?: number; polyline?: any[] }) => {
    const response = await client.put(`transport/routes/${id}`, data);
    return response.data;
  },

  // Stops
  createStops: async (stops: any[]) => {
    // Note: The backend POST /api/transport/stops currently takes a single stop. 
    // We will loop through and create them or implement a bulk endpoint if needed.
    // Given the user request "Send all stops to backend API /api/transport/stops",
    // I will implementation sequential creation for now to match the existing single-stop endpoint
    // or assume the backend can handle an array if I were to update it.
    // Actually, I just implemented the backend myself! 
    // My backend POST /api/transport/stops takes a single StopCreate object.
    
    const results = [];
    for (const stop of stops) {
      const response = await client.post('transport/stops', stop);
      results.push(response.data);
    }
    return results;
  },

  getStops: async (routeId: number) => {
    const response = await client.get('transport/stops', { params: { route_id: routeId } });
    return response.data;
  },

  // Students
  assignStudent: async (data: { student_id: number; bus_id: number; stop_id: number }) => {
    const response = await client.post('transport/assign-student', data);
    return response.data;
  },

  getMyAssignment: async () => {
    const response = await client.get('transport/my-assignment');
    return response.data;
  },

  getClassTransportRoster: async (classId: number) => {
    const response = await client.get('transport/class-roster', { params: { class_id: classId } });
    return response.data;
  }
};
