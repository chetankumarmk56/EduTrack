import apiClient from './apiClient';
import { SchoolEvent } from '../types';

// Backend EventResponse uses `date` / `type`. Older mobile code reads
// `event_date` / `event_type`. Normalize to expose both so any consumer
// (current or legacy) gets the right values.
function normalizeEvent(raw: any): SchoolEvent {
  const date = raw?.event_date ?? raw?.date ?? '';
  const type = (raw?.event_type ?? raw?.type ?? '').toString();
  return {
    ...raw,
    date,
    type,
    event_date: date,
    event_type: type as SchoolEvent['event_type'],
  };
}

export const eventsService = {
  /**
   * Get all school events for the institution (past + upcoming).
   */
  getEvents: async (): Promise<SchoolEvent[]> => {
    const res = await apiClient.get('/events/');
    const list = Array.isArray(res.data) ? res.data : [];
    return list.map(normalizeEvent);
  },

  getEventsByType: async (eventType: string): Promise<SchoolEvent[]> => {
    const res = await apiClient.get(`/events/?event_type=${eventType}`);
    const list = Array.isArray(res.data) ? res.data : [];
    return list.map(normalizeEvent);
  },

  getUpcomingEvents: async (limit: number = 10): Promise<SchoolEvent[]> => {
    const res = await apiClient.get(`/events/?limit=${limit}`);
    const list = Array.isArray(res.data) ? res.data : [];
    return list.map(normalizeEvent);
  },
};
