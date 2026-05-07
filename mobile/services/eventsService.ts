import apiClient from './apiClient';
import { SchoolEvent } from '../types';

export const eventsService = {
  /**
   * Get all school events for the student's class
   */
  getEvents: async (): Promise<SchoolEvent[]> => {
    const res = await apiClient.get('/events');
    return res.data;
  },

  /**
   * Get events by type
   */
  getEventsByType: async (eventType: string): Promise<SchoolEvent[]> => {
    const res = await apiClient.get(`/events?event_type=${eventType}`);
    return res.data;
  },

  /**
   * Get upcoming events
   */
  getUpcomingEvents: async (limit: number = 10): Promise<SchoolEvent[]> => {
    const res = await apiClient.get(`/events?limit=${limit}`);
    return res.data;
  },
};
