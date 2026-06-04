import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';

// Mock the native Storage layer so apiClient never pulls in expo-secure-store
// / react-native — these tests exercise pure request/response logic.
jest.mock('@/shared/utils/storage', () => ({
  Storage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    deleteItem: jest.fn().mockResolvedValue(undefined),
  },
}));

import apiClient, { onAuthExpired } from './apiClient';
import { Storage } from '@/shared/utils/storage';
import { STORAGE_KEYS } from '@/shared/constants';

const mockedStorage = Storage as jest.Mocked<typeof Storage>;

/** getItem that returns different values per storage key. */
function storageWith(map: Record<string, string | null>) {
  mockedStorage.getItem.mockImplementation((k: string) =>
    Promise.resolve(k in map ? map[k] : null),
  );
}

describe('mobile apiClient', () => {
  let mock: MockAdapter; // intercepts apiClient (the app's instance)
  let axiosMock: MockAdapter; // intercepts the bare axios used by refresh

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    axiosMock = new MockAdapter(axios);
    jest.clearAllMocks();
    mockedStorage.getItem.mockResolvedValue(null);
  });

  afterEach(() => {
    mock.restore();
    axiosMock.restore();
  });

  it('retries a transient network failure (cold start) then succeeds', async () => {
    mock.onGet('/ping').networkErrorOnce();
    mock.onGet('/ping').reply(200, { ok: true });
    const res = await apiClient.get('/ping');
    expect(res.data).toEqual({ ok: true });
  }, 15000);

  it('does NOT retry a real HTTP error — 4xx is intentional, not transient', async () => {
    let calls = 0;
    mock.onGet('/bad').reply(() => {
      calls += 1;
      return [400, { detail: 'nope' }];
    });
    await expect(apiClient.get('/bad')).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('rotates the access token on a 401 and replays the request (no logout)', async () => {
    storageWith({
      [STORAGE_KEYS.ACCESS_TOKEN]: 'old-token',
      [STORAGE_KEYS.REFRESH_TOKEN]: 'refresh-tok',
      [STORAGE_KEYS.ROLE]: 'teacher',
    });
    const onExpired = jest.fn();
    const off = onAuthExpired(onExpired);

    axiosMock.onPost(/auth\/refresh$/).reply(200, { access_token: 'new-token' });
    mock.onGet('/secure').replyOnce(401, { detail: 'expired' }); // first: expired
    mock.onGet('/secure').reply(200, { ok: true }); // replay after refresh

    const res = await apiClient.get('/secure');
    expect(res.data).toEqual({ ok: true });
    expect(mockedStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.ACCESS_TOKEN,
      'new-token',
    );
    expect(onExpired).not.toHaveBeenCalled();
    off();
  });

  it('falls back to logout when the refresh attempt fails', async () => {
    storageWith({
      [STORAGE_KEYS.ACCESS_TOKEN]: 'old-token',
      [STORAGE_KEYS.REFRESH_TOKEN]: 'refresh-tok',
      [STORAGE_KEYS.ROLE]: 'teacher',
    });
    const onExpired = jest.fn();
    const off = onAuthExpired(onExpired);

    axiosMock.onPost(/auth\/refresh$/).reply(401); // refresh rejected
    mock.onGet('/secure').reply(401, { detail: 'expired' });

    await expect(apiClient.get('/secure')).rejects.toThrow();
    expect(mockedStorage.deleteItem).toHaveBeenCalled();
    expect(onExpired).toHaveBeenCalledTimes(1);
    off();
  });

  it('logs out on a 401 when there is no refresh token to rotate with', async () => {
    storageWith({ [STORAGE_KEYS.ACCESS_TOKEN]: 'a-token' }); // no REFRESH_TOKEN
    const onExpired = jest.fn();
    const off = onAuthExpired(onExpired);

    mock.onGet('/secure').reply(401, { detail: 'expired' });
    await expect(apiClient.get('/secure')).rejects.toThrow();

    expect(mockedStorage.deleteItem).toHaveBeenCalled();
    expect(onExpired).toHaveBeenCalledTimes(1);
    off();
  });

  it('ignores a 401 that arrives with no token (logout race) — no broadcast', async () => {
    mockedStorage.getItem.mockResolvedValue(null); // no Authorization header
    const onExpired = jest.fn();
    const off = onAuthExpired(onExpired);

    mock.onGet('/secure2').reply(401, { detail: 'expired' });
    await expect(apiClient.get('/secure2')).rejects.toThrow();

    expect(onExpired).not.toHaveBeenCalled();
    off();
  });
});
