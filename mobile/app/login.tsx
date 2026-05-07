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
import { Colors } from '../constants/Colors';
import { API_BASE_URL } from '../constants';
import { useLogin, type LoginMode } from '../hooks';
import { StudentLoginForm } from '../components/portal/StudentLoginForm';
import { TeacherLoginForm } from '../components/portal/TeacherLoginForm';

import { useLocalSearchParams } from 'expo-router';

export default function LoginScreen() {
  const params = useLocalSearchParams<{ mode?: LoginMode }>();
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
    if (params.mode && (params.mode === 'student' || params.mode === 'teacher')) {
      setMode(params.mode);
    }
  }, [params.mode]);

  const isNetworkError = apiError
    ? /network|timeout|ECONNREFUSED|socket|unreachable/i.test(apiError)
    : false;

  return (
    <SafeAreaView style={styles.safe}>
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
          <View style={styles.header}>
            <View style={styles.logoBox}>
              <Text style={styles.logoEmoji}>🎓</Text>
            </View>
            <Text style={styles.appName}>EduTrack</Text>
            <Text style={styles.tagline}>Your Academic Companion</Text>
          </View>

          {/* Mode Toggle */}
          <View style={styles.toggleContainer}>
            {(['student', 'teacher'] as LoginMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.toggleBtn, mode === m && styles.toggleActive]}
                onPress={() => { setMode(m); setApiError(null); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.toggleText, mode === m && styles.toggleTextActive]}>
                  {m === 'student' ? 'Student / Parent' : 'Teacher'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Error Banner */}
          {apiError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.errorText}>{apiError}</Text>
                {isNetworkError && (
                  <Text style={styles.errorHint}>
                    Cannot reach server at {API_BASE_URL}.{'\n'}
                    Check that your backend is running and update{' '}
                    <Text style={styles.errorHintBold}>EXPO_PUBLIC_API_BASE_URL</Text> in{' '}
                    <Text style={styles.errorHintBold}>.env</Text> with your machine&apos;s IP if on a physical device.
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Form Card */}
          <View style={styles.formCard}>
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
          </View>

          {/* Server info chip */}
          <TouchableOpacity
            style={styles.serverChip}
            onPress={() =>
              Alert.alert(
                'Connected Server',
                `API: ${API_BASE_URL}\n\nIf on a physical device, replace "localhost" with your machine's local IP address in the .env file.`,
              )
            }
          >
            <Text style={styles.serverChipText}>🌐 {API_BASE_URL}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 20 },

  header: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  logoBox: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border, marginBottom: 4,
  },
  logoEmoji: { fontSize: 36 },
  appName: { fontSize: 30, fontWeight: '900', color: Colors.text, letterSpacing: -1 },
  tagline: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },

  toggleContainer: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: 16, padding: 4, borderWidth: 1, borderColor: Colors.border,
  },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 13, alignItems: 'center' },
  toggleActive: { backgroundColor: Colors.primary },
  toggleText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  toggleTextActive: { color: Colors.white },

  errorBanner: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: `${Colors.danger}18`,
    borderWidth: 1,
    borderColor: `${Colors.danger}50`,
    borderRadius: 16,
    padding: 14,
  },
  errorIcon: { fontSize: 18, lineHeight: 22 },
  errorText: { fontSize: 14, color: Colors.danger, fontWeight: '700', lineHeight: 20 },
  errorHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 6, lineHeight: 18 },
  errorHintBold: { fontWeight: '800', color: Colors.text },

  formCard: {
    backgroundColor: Colors.card, borderRadius: 24,
    padding: 24, borderWidth: 1, borderColor: Colors.border, gap: 16,
  },

  serverChip: {
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  serverChipText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
});
