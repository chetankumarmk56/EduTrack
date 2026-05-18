/**
 * Expo Push Notifications — registration + delivery helpers.
 *
 * Responsibilities
 *   1. Ask the OS for notification permission (user-visible prompt).
 *   2. Acquire the device's Expo push token.
 *   3. Send the token to the backend so it can dispatch to the right user.
 *   4. Re-register on token rotation (Expo emits a `pushTokenListener` event).
 *   5. Tear down registration on logout (best-effort).
 *
 * The actual notification *display* and tap-handling live in the root
 * `_layout.tsx`, where we set up listeners with router access.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import apiClient from '@/shared/services/apiClient';
import { Storage } from '@/shared/utils/storage';

// Persist the last-registered token so we can pass it to /devices/tokens DELETE
// on logout. Stored under the same secure-store/AsyncStorage layer as the
// other auth artefacts so it gets cleared in the same logout sweep.
const LAST_TOKEN_KEY = 'edu_expo_push_token';

let _foregroundHandlerInstalled = false;

/**
 * Install the foreground notification handler. Safe to call multiple times —
 * Expo allows overwriting and we guard with a module flag anyway.
 *
 * Default behaviour: show banner + play sound when the app is in the
 * foreground. Without this, push payloads arrive silently while the app
 * is open, which is confusing for parents who don't realise the
 * announcement landed.
 */
export function installForegroundHandler(): void {
  if (_foregroundHandlerInstalled) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      // Older expo-notifications versions don't recognise the new keys; fall
      // back to the legacy `shouldShowAlert` to stay compatible.
      shouldShowAlert: true,
    } as any),
  });
  _foregroundHandlerInstalled = true;
}

/**
 * Request permission to display notifications. Returns true if the user
 * granted permission (or it was already granted).
 *
 * On iOS this triggers the system prompt the first time. On Android 13+
 * the same prompt appears for POST_NOTIFICATIONS.
 */
async function ensurePermission(): Promise<boolean> {
  if (!Device.isDevice) {
    // Simulators / web can't receive push. Don't spam logs as an error.
    console.log('[push] running on simulator/web — skipping permission request');
    return false;
  }
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;

  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/**
 * Acquire the device's Expo push token. Returns null if permission was
 * denied or we're on an unsupported platform (simulator / web).
 */
async function getExpoPushToken(): Promise<string | null> {
  if (!(await ensurePermission())) return null;

  // Android requires a notification channel to be created before tokens
  // can be issued for high-priority delivery.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'EduTrack Announcements',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0f0f1a',
      sound: 'default',
    });
  }

  try {
    // Prefer EAS projectId for production builds. Without it, expo-go's
    // dev/preview client falls back to its own project token, which still
    // works for testing.
    const projectId =
      (Constants?.expoConfig as any)?.extra?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId;

    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return tokenResp.data;
  } catch (err) {
    console.warn('[push] getExpoPushTokenAsync failed:', err);
    return null;
  }
}

/**
 * Public entry point: call once after the user has logged in. Idempotent;
 * re-running is safe (and required after token rotation).
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    installForegroundHandler();
    const token = await getExpoPushToken();
    if (!token) return null;

    // Avoid hammering the backend with the same token on every cold start.
    const stored = await Storage.getItem(LAST_TOKEN_KEY);
    if (stored === token) {
      // Still ping the backend asynchronously so `last_used_at` stays fresh,
      // but don't block — and don't fail the caller if it errors.
      apiClient
        .post('/devices/tokens', {
          expo_push_token: token,
          platform: Platform.OS as 'ios' | 'android' | 'web',
          device_name: Device.deviceName ?? null,
        })
        .catch((e) => console.warn('[push] background refresh failed:', e?.message));
      return token;
    }

    await apiClient.post('/devices/tokens', {
      expo_push_token: token,
      platform: Platform.OS as 'ios' | 'android' | 'web',
      device_name: Device.deviceName ?? null,
    });

    await Storage.setItem(LAST_TOKEN_KEY, token);
    console.log('[push] device token registered with backend');
    return token;
  } catch (err) {
    console.warn('[push] registration failed:', err);
    return null;
  }
}

/**
 * Listen for token rotation events from Expo and re-register automatically.
 * Returns the listener subscription so the caller can dispose it on logout.
 */
export function subscribeToTokenRotation(): { remove: () => void } {
  const sub = Notifications.addPushTokenListener(async (newToken) => {
    console.log('[push] token rotated by Expo — re-registering');
    try {
      await apiClient.post('/devices/tokens', {
        expo_push_token: newToken.data,
        platform: Platform.OS as 'ios' | 'android' | 'web',
        device_name: Device.deviceName ?? null,
      });
      await Storage.setItem(LAST_TOKEN_KEY, newToken.data);
    } catch (err) {
      console.warn('[push] token-rotation re-register failed:', err);
    }
  });
  return sub;
}

/**
 * Best-effort unregister. Called on logout. We don't surface errors to the
 * UI — the auth flow has already moved on, and a failed delete just
 * means Expo will eventually mark the token DeviceNotRegistered on its own.
 */
export async function unregisterPushNotifications(): Promise<void> {
  try {
    const token = await Storage.getItem(LAST_TOKEN_KEY);
    if (!token) return;
    await apiClient.delete('/devices/tokens', {
      params: { expo_push_token: token },
    });
  } catch (err) {
    console.warn('[push] unregister failed (non-fatal):', err);
  } finally {
    await Storage.deleteItem(LAST_TOKEN_KEY);
  }
}

export type PushNotificationData = {
  type?: string;
  announcement_id?: string;
  class_id?: number | null;
  student_id?: number | null;
  screen?: string;
  [key: string]: unknown;
};
