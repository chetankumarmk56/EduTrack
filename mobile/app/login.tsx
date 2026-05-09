import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Colors } from '../constants/Colors';
import { API_BASE_URL } from '../constants';
import { useLogin, type LoginMode } from '../hooks';
import { StudentLoginForm } from '../components/portal/StudentLoginForm';
import { TeacherLoginForm } from '../components/portal/TeacherLoginForm';
import { useLocalSearchParams } from 'expo-router';

const MODE_CONFIG: Record<LoginMode, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }> = {
  student: { label: 'Parent',  icon: 'people',  color: Colors.primary },
  teacher: { label: 'Teacher', icon: 'school',  color: Colors.success },
};

export default function LoginScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const {
    mode, setMode,
    loading,
    apiError, setApiError,
    studentFields,
    teacherFields,
    handleStudentLogin,
    handleTeacherLogin,
  } = useLogin();

  React.useEffect(() => {
    if (params.mode === 'parent' || params.mode === 'student') setMode('student');
    else if (params.mode === 'teacher') setMode('teacher');
  }, [params.mode]);

  const activeColor = MODE_CONFIG[mode].color;
  const isNetworkError = apiError
    ? /network|timeout|ECONNREFUSED|socket|unreachable/i.test(apiError)
    : false;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Decorative background blobs */}
      <View style={[styles.bgBlob1, { backgroundColor: `${activeColor}0d` }]} />
      <View style={[styles.bgBlob2, { backgroundColor: `${activeColor}08` }]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <Animated.View entering={FadeInUp.delay(100).duration(600)} style={styles.header}>
            <View style={[styles.logoBox, { borderColor: `${activeColor}35`, shadowColor: activeColor }]}>
              <Text style={styles.logoEmoji}>🎓</Text>
            </View>
            <Text style={styles.appName}>EduTrack</Text>
            <Text style={styles.tagline}>Your Academic Companion</Text>
          </Animated.View>

          {/* Mode Toggle */}
          <Animated.View entering={FadeInDown.delay(180).duration(500)} style={styles.toggleContainer}>
            {(['student', 'teacher'] as LoginMode[]).map((m) => {
              const cfg = MODE_CONFIG[m];
              const active = mode === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.toggleBtn, active && { backgroundColor: cfg.color }]}
                  onPress={() => { setMode(m); setApiError(null); }}
                  activeOpacity={0.85}
                >
                  <Ionicons name={cfg.icon} size={15} color={active ? '#fff' : Colors.textMuted} />
                  <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                    {cfg.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>

          {/* Error Banner */}
          {apiError && (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={20} color={Colors.danger} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.errorText}>{apiError}</Text>
                {isNetworkError && (
                  <Text style={styles.errorHint}>
                    Cannot reach server at {API_BASE_URL}.{'\n'}
                    Check that your backend is running and update{' '}
                    <Text style={styles.errorHintBold}>EXPO_PUBLIC_API_BASE_URL</Text> in{' '}
                    <Text style={styles.errorHintBold}>.env</Text> with your machine&apos;s IP.
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => setApiError(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Form Card */}
          <Animated.View
            entering={FadeInDown.delay(280).duration(600)}
            style={[
              styles.formCard,
              { borderTopColor: activeColor, borderTopWidth: 3 },
            ]}
          >
            {mode === 'student' ? (
              <StudentLoginForm
                fields={studentFields}
                loading={loading}
                onLogin={handleStudentLogin}
              />
            ) : (
              <TeacherLoginForm
                fields={teacherFields}
                loading={loading}
                onLogin={handleTeacherLogin}
              />
            )}
          </Animated.View>

          {/* Server info chip */}
          <Animated.View entering={FadeInDown.delay(420).duration(400)} style={{ alignItems: 'center' }}>
            <TouchableOpacity
              style={styles.serverChip}
              onPress={() =>
                Alert.alert(
                  'Connected Server',
                  `API: ${API_BASE_URL}\n\nIf on a physical device, replace "localhost" with your machine's local IP address in the .env file.`,
                )
              }
            >
              <Ionicons name="globe-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.serverChipText}>{API_BASE_URL}</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 20 },

  bgBlob1: {
    position: 'absolute', top: -90, right: -90,
    width: 260, height: 260, borderRadius: 130,
  },
  bgBlob2: {
    position: 'absolute', bottom: -60, left: -60,
    width: 220, height: 220, borderRadius: 110,
  },

  header: { alignItems: 'center', paddingVertical: 12, gap: 6 },
  logoBox: {
    width: 76, height: 76, borderRadius: 24,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, marginBottom: 6,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 6,
  },
  logoEmoji: { fontSize: 38 },
  appName: { fontSize: 30, fontWeight: '900', color: Colors.text, letterSpacing: -1 },
  tagline: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },

  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
  },
  toggleText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  toggleTextActive: { color: Colors.white },

  errorBanner: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: `${Colors.danger}10`,
    borderWidth: 1,
    borderColor: `${Colors.danger}40`,
    borderRadius: 16,
    padding: 14,
  },
  errorText: { fontSize: 14, color: Colors.danger, fontWeight: '700', lineHeight: 20 },
  errorHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, lineHeight: 18 },
  errorHintBold: { fontWeight: '800', color: Colors.text },

  formCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 4,
  },

  serverChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  serverChipText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
});
