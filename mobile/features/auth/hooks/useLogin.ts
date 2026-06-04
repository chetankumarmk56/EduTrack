import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { authService } from '@/features/auth/services/authService';
import { STORAGE_KEYS } from '@/shared/constants';
import { Storage } from '@/shared/utils/storage';

export type LoginMode = 'student' | 'teacher';

export function useLogin() {
  const { login } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('student');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Parent login fields — guardian phone + student DOB. Replaces the older
  // (name + class + section + DOB + institution code) flow; the backend now
  // derives institution_id from the matched student record.
  const [parentPhone, setParentPhone] = useState('');
  const [dob, setDob] = useState<Date | null>(null);

  // Teacher login fields — no institution code; backend derives it.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const clearStaleSession = async () => {
    await Promise.all(
      Object.values(STORAGE_KEYS).map((k) => Storage.deleteItem(k)),
    );
  };

  const isMobileRole = (role: string | undefined) =>
    role === 'parent' || role === 'student' || role === 'teacher';

  const handleStudentLogin = async () => {
    setApiError(null);
    const phone = parentPhone.trim();
    if (!phone || !dob) {
      setApiError('Please enter the guardian phone and student date of birth.');
      return;
    }
    // Mirrors the backend digit count so the user sees a fast local error
    // before the round-trip. International numbers with leading + and 12+
    // digits still pass because we count digits only.
    const digitCount = (phone.match(/\d/g) || []).length;
    if (digitCount < 10) {
      setApiError('Please enter a complete phone number (10 digits).');
      return;
    }

    // Format Date to YYYY-MM-DD using LOCAL components.
    // toISOString() converts to UTC, which shifts the date back a day for any
    // timezone east of UTC (e.g. picking Jan 1 in IST became Dec 31 UTC),
    // so the backend's exact-match dob comparison would always fail.
    const yyyy = dob.getFullYear();
    const mm = String(dob.getMonth() + 1).padStart(2, '0');
    const dd = String(dob.getDate()).padStart(2, '0');
    const dobString = `${yyyy}-${mm}-${dd}`;

    setLoading(true);
    try {
      await clearStaleSession();
      const data = await authService.loginParent(phone, dobString);
      if (!isMobileRole(data.role)) {
        setApiError('This account type is not supported in the mobile app. Please use the website.');
        return;
      }
      await login(data.access_token, { ...data.user, role: data.role, institution_id: data.institution_id }, String(data.institution_id), data.refresh_token);
      router.replace('/(parent)/dashboard');
    } catch (err: any) {
      setApiError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTeacherLogin = async () => {
    setApiError(null);
    if (!email.trim() || !password.trim()) {
      setApiError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      await clearStaleSession();
      const data = await authService.loginTeacher(email.trim(), password);
      if (data.role !== 'teacher') {
        setApiError('This account type is not supported in the mobile app. Please use the website.');
        return;
      }
      // institution_id comes back from the server (resolved off the User
      // record) and is what every authenticated request will send as
      // X-Institution-Id thereafter.
      await login(data.access_token, { ...data.user, role: data.role, institution_id: data.institution_id }, String(data.institution_id), data.refresh_token);
      router.replace('/(teacher)/dashboard');
    } catch (err: any) {
      setApiError(err?.message || 'Teacher login failed');
    } finally {
      setLoading(false);
    }
  };

  return {
    mode, setMode,
    loading,
    apiError, setApiError,
    studentFields: {
      parentPhone, setParentPhone,
      dob, setDob,
    },
    teacherFields: {
      email, setEmail,
      password, setPassword,
      showPassword, setShowPassword,
    },
    handleStudentLogin,
    handleTeacherLogin,
  };
}
