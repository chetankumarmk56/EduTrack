import 'react-native-gesture-handler';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { Component, useEffect, type ReactNode } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Text, TouchableOpacity, View, StyleSheet, ScrollView } from 'react-native';
import { AuthProvider, useAuth } from '@/features/auth/hooks/useAuth';
import { Colors } from '@/shared/constants/Colors';

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
        <AuthProvider>
          <View style={{ flex: 1, backgroundColor: Colors.background }}>
            <AuthGuard />
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
