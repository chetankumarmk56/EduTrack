import client from './client';

export const systemApi = {
  getInitialize: async () => {
    const response = await client.get('/system/initialize');
    return response.data;
  }
};
