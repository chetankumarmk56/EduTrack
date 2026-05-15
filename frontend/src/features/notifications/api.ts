import client from '@/shared/api/client';
import type { Notification } from '@/shared/types';

export type { Notification };

export const notificationApi = {
  getNotifications: async (unreadOnly: boolean = false) => {
    const response = await client.get<Notification[]>('notifications', {
      params: { unread_only: unreadOnly }
    });
    return response.data;
  },

  markAsRead: async (id: number) => {
    const response = await client.patch(`notifications/${id}/read`);
    return response.data;
  },

  markAllAsRead: async () => {
    const response = await client.post('notifications/read-all');
    return response.data;
  }
};
