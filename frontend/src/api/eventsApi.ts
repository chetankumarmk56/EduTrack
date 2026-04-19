import client from './client';
import type { Event } from '../types';

export const eventsApi = {
  getEvents: async () => {
    const response = await client.get<Event[]>('events/');
    return response.data;
  },

  createEvent: async (data: Partial<Event>) => {
    const response = await client.post<Event>('events/', data);
    return response.data;
  },

  updateEvent: async (id: number, data: Partial<Event>) => {
    const response = await client.put<Event>(`events/${id}`, data);
    return response.data;
  },

  deleteEvent: async (id: number) => {
    const response = await client.delete(`events/${id}`);
    return response.data;
  }
};
