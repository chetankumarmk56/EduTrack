import 'react-native-gesture-handler';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { Component, useEffect, type ReactNode } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Text, TouchableOpacity, View, StyleSheet, ScrollView, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '@/features/auth/hooks/useAuth';
import { Colors } from '@/shared/constants/Colors';
import { ToastProvider } from '@/shared/components/ui/Toast';
import {
  installForegroundHandler,
  subscribeToTokenRotation,
  type PushNotificationData,
} from '@/shared/services/pushNotifications';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[Mobile ErrorBoundary]', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={errStyles.root}>
          <ScrollView contentContainerStyle={errStyles.scroll}>
            <Text style={errStyles.icon}>⚠️</Text>
            <Text style={errStyles.title}>Something went wrong</Text>
            <Text style={errStyles.subtitle}>
              The app hit an unexpected error. Details below — share this with
              support if you need help.
            </Text>
            <View style={errStyles.errorBox}>
              <Text style={errStyles.errorText} selectable>
                {String(this.state.error?.message ?? this.state.error)}
              </Text>
              {this.state.error?.stack ? (
                <Text style={errStyles.stack} selectable>
                  {this.state.error.stack}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity style={errStyles.btn} onPress={this.reset}>
              <Text style={errStyles.btnText}>Try Again</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

/**
 * Resolves a push payload to the right in-app destination. Centralised so
 * that new notification types (fees, attendance) just need to set `screen`
 * on the data payload server-side and the tap handler already routes
 * them correctly.
 */
function resolveDeepLink(data: PushNotificationData, role?: string): string | null {
  // Explicit screen wins
  if (typeof data?.screen === 'string' && data.screen.length > 0) {
    return data.screen;
  }
  // Sensible defaults per notification type. Parent and teacher portals
  // each have their own announcements route; pick by the logged-in role.
  if (data?.type === 'announcement') {
    return role === 'teacher' ? '/(teacher)/announcements' : '/(parent)/announcements';
  }
  return null;
}

/**
 * Handles both:
 *   - cold start via a tapped notification (getLastNotificationResponseAsync)
 *   - taps while the app is already running (addNotificationResponseReceivedListener)
 *   - push-token rotation (subscribeToTokenRotation)
 *
 * Lives inside AuthProvider so we can read the user's role for routing.
 */
function NotificationDeepLinkHandler() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  // Make sure foreground display works regardless of auth state — the worst
  // case is a stale token that Expo will already have invalidated, in which
  // case nothing arrives.
  useEffect(() => {
    // expo-notifications has no native module on web; skip all push wiring.
    if (Platform.OS === 'web') return;
    installForegroundHandler();
  }, []);

  // Tap handler — runs once the user is logged in (we won't deep-link into
  // protected routes otherwise; the AuthGuard would bounce them back).
  useEffect(() => {
    // Push notifications aren't available in the browser. These
    // expo-notifications native APIs (getLastNotificationResponseAsync,
    // addNotificationResponseReceivedListener, addPushTokenListener) throw an
    // UnavailabilityError / warn on web, so bail out entirely there.
    if (Platform.OS === 'web') return;
    if (!isAuthenticated) return;

    // Cold-start: app was launched by tapping a notification. Run after a
    // tick so the router has mounted.
    let cancelled = false;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (cancelled || !response) return;
      const data = response.notification?.request?.content?.data as PushNotificationData | undefined;
      const target = data ? resolveDeepLink(data, user?.role) : null;
      if (target) {
        // Defer one tick so the initial route has settled.
        setTimeout(() => router.push(target as any), 0);
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification?.request?.content?.data as PushNotificationData | undefined;
      const target = data ? resolveDeepLink(data, user?.role) : null;
      if (target) router.push(target as any);
    });

    const rotation = subscribeToTokenRotation();

    return () => {
      cancelled = true;
      subscription.remove();
      rotation.remove();
    };
  }, [isAuthenticated, user?.role, router]);

  return null;
}

/**
 * Guards all screens inside (parent) and (teacher) — redirects unauthenticated users to /login.
 * Prevents logged-in users from seeing the /login screen.
 */
function AuthGuard() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inParentGroup = segments[0] === '(parent)';
    const inTeacherGroup = segments[0] === '(teacher)';
    const inProtectedRoute = inParentGroup || inTeacherGroup;

    if (!isAuthenticated && inProtectedRoute) {
      router.replace('/login');
    } else if (isAuthenticated && segments[0] === 'login') {
      router.replace(user?.role === 'teacher' ? '/(teacher)/dashboard' : '/(parent)/dashboard');
    }
  }, [isAuthenticated, isLoading, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
        <ToastProvider>
          <AuthProvider>
            <View style={{ flex: 1, backgroundColor: Colors.background }}>
              <AuthGuard />
              <NotificationDeepLinkHandler />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: Colors.background },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
                <Stack.Screen name="(parent)" options={{ headerShown: false }} />
                <Stack.Screen name="(teacher)" options={{ headerShown: false }} />
              </Stack>
              <StatusBar style="light" backgroundColor={Colors.background} />
            </View>
          </AuthProvider>
        </ToastProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const errStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 24, paddingTop: 80, gap: 12 },
  icon: { fontSize: 40, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  subtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginBottom: 12 },
  errorBox: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  errorText: { color: Colors.danger, fontSize: 13, fontWeight: '700' },
  stack: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Courier' },
  btn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  btnText: { color: Colors.white, fontWeight: '900', fontSize: 14 },
});
