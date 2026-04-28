import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/authService';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Colors } from '../constants/Colors';
import { STORAGE_KEYS, API_BASE_URL } from '../constants';

type LoginMode = 'student' | 'teacher';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('student');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Student login fields
  const [studentName, setStudentName] = useState('');
  const [classLevel, setClassLevel] = useState('');
  const [section, setSection] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [institutionId, setInstitutionId] = useState('1');

  // Teacher login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [teacherInstId, setTeacherInstId] = useState('1');

  // Clears any leftover SecureStore data from a previous session
  const clearStaleSession = async () => {
    await Promise.all(
      Object.values(STORAGE_KEYS).map((k) => SecureStore.deleteItemAsync(k)),
    );
  };

  const handleStudentLogin = async () => {
    setApiError(null);

    if (
      !studentName.trim() ||
      !classLevel.trim() ||
      !section.trim() ||
      !dobDay ||
      !dobMonth ||
      !dobYear ||
      !institutionId
    ) {
      setApiError('Please fill in all fields: Name, Grade, Section, DOB, and Institution Code.');
      return;
    }

    // Zero-pad day/month — backend strictly expects YYYY-MM-DD
    const dob = `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`;

    setLoading(true);
    try {
      // Clear any stale token first to avoid interceptor interference
      await clearStaleSession();

      const data = await authService.loginStudent(
        studentName.trim(),
        classLevel.trim(),
        section.trim().toUpperCase(),
        dob,
        institutionId.trim(),
      );

      await login(
        data.access_token,
        { ...data.user, role: data.role, institution_id: data.institution_id },
        String(data.institution_id),
      );
      router.replace('/dashboard');
    } catch (err: any) {
      const msg: string = err?.message || 'Unknown error';
      console.error('[Login] Student login failed:', msg);
      setApiError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleTeacherLogin = async () => {
    setApiError(null);

    if (!email.trim() || !password.trim() || !teacherInstId.trim()) {
      setApiError('Please enter your email, password, and institution code.');
      return;
    }

    setLoading(true);
    try {
      await clearStaleSession();

      const data = await authService.loginTeacher(
        email.trim(),
        password,
        teacherInstId.trim(),
      );

      await login(
        data.access_token,
        { ...data.user, role: data.role, institution_id: data.institution_id },
        String(data.institution_id),
      );
      router.replace('/dashboard');
    } catch (err: any) {
      const msg: string = err?.message || 'Unknown error';
      console.error('[Login] Teacher login failed:', msg);
      setApiError(msg);
    } finally {
      setLoading(false);
    }
  };

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
                    <Text style={styles.errorHintBold}>.env</Text> with your machine's IP if on a physical device.
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Form Card */}
          <View style={styles.formCard}>
            {mode === 'student' ? (
              <>
                <Text style={styles.formTitle}>Student Portal</Text>
                <Text style={styles.formSubtitle}>
                  Enter your child's school details to continue
                </Text>

                <View style={styles.fields}>
                  <Input
                    label="Institution Code"
                    value={institutionId}
                    onChangeText={setInstitutionId}
                    placeholder="e.g. 1"
                    keyboardType="numeric"
                    leftIcon={<Text style={styles.inputIcon}>#</Text>}
                  />
                  <Input
                    label="Student Name (exactly as registered)"
                    value={studentName}
                    onChangeText={setStudentName}
                    placeholder="e.g. John Doe"
                    autoCapitalize="words"
                    leftIcon={<Text style={styles.inputIcon}>👤</Text>}
                  />
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Grade"
                        value={classLevel}
                        onChangeText={setClassLevel}
                        placeholder="e.g. 10"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Section"
                        value={section}
                        onChangeText={(t) => setSection(t.toUpperCase())}
                        placeholder="e.g. A"
                        autoCapitalize="characters"
                        maxLength={2}
                      />
                    </View>
                  </View>

                  {/* DOB */}
                  <View>
                    <Text style={styles.dobLabel}>Date of Birth (used as password)</Text>
                    <View style={styles.dobRow}>
                      <View style={{ flex: 1 }}>
                        <Input
                          value={dobDay}
                          onChangeText={setDobDay}
                          placeholder="DD"
                          keyboardType="numeric"
                          maxLength={2}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Input
                          value={dobMonth}
                          onChangeText={setDobMonth}
                          placeholder="MM"
                          keyboardType="numeric"
                          maxLength={2}
                        />
                      </View>
                      <View style={{ flex: 1.5 }}>
                        <Input
                          value={dobYear}
                          onChangeText={setDobYear}
                          placeholder="YYYY"
                          keyboardType="numeric"
                          maxLength={4}
                        />
                      </View>
                    </View>
                    <Text style={styles.dobHint}>
                      Example: Day 03 / Month 08 / Year 2010
                    </Text>
                  </View>
                </View>

                <Button
                  label="Access Student Portal"
                  onPress={handleStudentLogin}
                  loading={loading}
                  size="lg"
                  style={styles.submitBtn}
                />
              </>
            ) : (
              <>
                <Text style={styles.formTitle}>Teacher Portal</Text>
                <Text style={styles.formSubtitle}>
                  Sign in with your school email credentials
                </Text>

                <View style={styles.fields}>
                  <Input
                    label="Institution Code"
                    value={teacherInstId}
                    onChangeText={setTeacherInstId}
                    placeholder="e.g. 1"
                    keyboardType="numeric"
                    leftIcon={<Text style={styles.inputIcon}>#</Text>}
                  />
                  <Input
                    label="Email Address"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="teacher@school.edu"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<Text style={styles.inputIcon}>✉️</Text>}
                  />
                  <Input
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    secureTextEntry={!showPassword}
                    leftIcon={<Text style={styles.inputIcon}>🔒</Text>}
                    rightIcon={
                      <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
                    }
                    onRightIconPress={() => setShowPassword(!showPassword)}
                  />
                </View>

                <Button
                  label="Sign In to Teacher Portal"
                  onPress={handleTeacherLogin}
                  loading={loading}
                  size="lg"
                  style={styles.submitBtn}
                />
              </>
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

  // Error banner
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
  formTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  formSubtitle: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginTop: -8 },

  fields: { gap: 16, marginTop: 4 },
  row: { flexDirection: 'row', gap: 12 },

  dobLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 },
  dobRow: { flexDirection: 'row', gap: 10 },
  dobHint: { fontSize: 11, color: Colors.textMuted, marginTop: 8, fontWeight: '500' },

  submitBtn: { marginTop: 4 },
  inputIcon: { fontSize: 16 },
  eyeIcon: { fontSize: 18 },

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
