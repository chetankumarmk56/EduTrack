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

  // Student login fields
  const [studentName, setStudentName] = useState('');
  const [classLevel, setClassLevel] = useState('');
  const [section, setSection] = useState('');
  const [dob, setDob] = useState<Date | null>(null); // Changed to Date object
  const [institutionId, setInstitutionId] = useState('1');

  // Teacher login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [teacherInstId, setTeacherInstId] = useState('1');

  const clearStaleSession = async () => {
    await Promise.all(
      Object.values(STORAGE_KEYS).map((k) => Storage.deleteItem(k)),
    );
  };

  const isMobileRole = (role: string | undefined) =>
    role === 'parent' || role === 'student' || role === 'teacher';

  const handleStudentLogin = async () => {
    setApiError(null);
    if (!studentName.trim() || !classLevel.trim() || !section.trim() || !dob || !institutionId) {
      setApiError('Please fill in all fields.');
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
      const data = await authService.loginStudent(studentName.trim(), classLevel.trim(), section.trim().toUpperCase(), dobString, institutionId.trim());
      if (!isMobileRole(data.role)) {
        setApiError('This account type is not supported in the mobile app. Please use the website.');
        return;
      }
      await login(data.access_token, { ...data.user, role: data.role, institution_id: data.institution_id }, String(data.institution_id));
      router.replace('/(parent)/dashboard');
    } catch (err: any) {
      setApiError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTeacherLogin = async () => {
    setApiError(null);
    if (!email.trim() || !password.trim() || !teacherInstId.trim()) {
      setApiError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      await clearStaleSession();
      const data = await authService.loginTeacher(email.trim(), password, teacherInstId.trim());
      if (data.role !== 'teacher') {
        setApiError('This account type is not supported in the mobile app. Please use the website.');
        return;
      }
      await login(data.access_token, { ...data.user, role: data.role, institution_id: data.institution_id }, String(data.institution_id));
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
      studentName, setStudentName,
      classLevel, setClassLevel,
      section, setSection,
      dob, setDob,
      institutionId, setInstitutionId,
    },
    teacherFields: {
      email, setEmail,
      password, setPassword,
      showPassword, setShowPassword,
      teacherInstId, setTeacherInstId,
    },
    handleStudentLogin,
    handleTeacherLogin,
  };
}
