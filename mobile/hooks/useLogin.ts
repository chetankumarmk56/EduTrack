import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from './useAuth';
import { authService } from '../services/authService';
import { STORAGE_KEYS } from '../constants';
import { Storage } from '../utils/storage';

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

  const handleStudentLogin = async () => {
    setApiError(null);
    if (!studentName.trim() || !classLevel.trim() || !section.trim() || !dob || !institutionId) {
      setApiError('Please fill in all fields.');
      return;
    }

    // Format Date to YYYY-MM-DD
    const dobString = dob.toISOString().split('T')[0];

    setLoading(true);
    try {
      await clearStaleSession();
      const data = await authService.loginStudent(studentName.trim(), classLevel.trim(), section.trim().toUpperCase(), dobString, institutionId.trim());
      await login(data.access_token, { ...data.user, role: data.role, institution_id: data.institution_id }, String(data.institution_id));
      router.replace(data.role === 'teacher' ? '/(teacher)/dashboard' : '/(parent)/dashboard');
    } catch (err: any) {
      setApiError(err?.message || 'Student login failed');
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
      await login(data.access_token, { ...data.user, role: data.role, institution_id: data.institution_id }, String(data.institution_id));
      router.replace(data.role === 'teacher' ? '/(teacher)/dashboard' : '/(parent)/dashboard');
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
