import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { directoryService, attendanceService, type StudentProfile } from '../../services';
import { localDateStr } from '@/shared/utils/formatters';
import { toast } from '@/shared/components/ui/Toast';
import { Colors } from '@/shared/constants/Colors';
import { SectionHeader } from '@/shared/components/ui/Card';
import { LoadingScreen } from '@/shared/components/ui/Feedback';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useLocalSearchParams } from 'expo-router';

export default function TeacherAttendance() {
  const params = useLocalSearchParams<{ classId?: string }>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [attendance, setAttendance] = useState<Record<number, 'Present' | 'Absent'>>({});
  const [submitting, setSubmitting] = useState(false);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Get teacher profile to see assignments
      const profile = await directoryService.getMyProfile();
      const assignments = profile.assignments || [];
      
      // Extract unique classes
      const uniqueClasses = Array.from(new Set(assignments.map((a: any) => a.school_class_id)))
        .map(id => assignments.find((a: any) => a.school_class_id === id).school_class);
      
      setClasses(uniqueClasses);
      
      // Handle param from dashboard
      if (params.classId) {
        setSelectedClassId(parseInt(params.classId));
      } else if (uniqueClasses.length > 0) {
        setSelectedClassId(uniqueClasses[0].id);
      }
    } catch (error) {
      console.error('Failed to load classes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStudents = useCallback(async () => {
    if (!selectedClassId) return;
    try {
      const allStudents = await directoryService.getTeacherStudents();
      const filtered = allStudents
        .filter(s => s.school_class?.id === selectedClassId)
        .sort((a, b) => {
          const ra = a.roll_number ?? Number.MAX_SAFE_INTEGER;
          const rb = b.roll_number ?? Number.MAX_SAFE_INTEGER;
          return ra - rb || a.name.localeCompare(b.name);
        });
      setStudents(filtered);

      // Pre-fill from any attendance already saved for today, so a refresh
      // reflects the real state instead of resetting everyone to Present.
      let savedByStudent: Record<number, string> = {};
      try {
        const saved = await attendanceService.getClassAttendanceForDate(
          selectedClassId,
          localDateStr(new Date()),
        );
        savedByStudent = Object.fromEntries(saved.map((a: any) => [a.student_id, a.status]));
      } catch (e) {
        // Non-fatal: if today's records can't load, fall back to all-Present.
        console.warn('Could not load saved attendance for today:', e);
      }

      // Backend stores TitleCase ('Present'/'Absent'/'Late'); this screen is
      // binary, so treat anything that isn't 'Absent' as 'Present'.
      const initial: Record<number, 'Present' | 'Absent'> = {};
      filtered.forEach(s => {
        initial[s.id] = savedByStudent[s.id] === 'Absent' ? 'Absent' : 'Present';
      });
      setAttendance(initial);
    } catch (error) {
      console.error('Failed to load students:', error);
    }
  }, [selectedClassId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInitialData();
    await loadStudents();
    setRefreshing(false);
  };

  const toggleAttendance = (studentId: number) => {
    setAttendance(prev => ({
      ...prev,
      [studentId]: prev[studentId] === 'Present' ? 'Absent' : 'Present'
    }));
  };

  const handleSubmit = async () => {
    if (!selectedClassId) return;
    
    setSubmitting(true);
    try {
      const records = Object.entries(attendance).map(([id, status]) => ({
        student_id: parseInt(id),
        status
      }));
      
      await attendanceService.markBatch({
        school_class_id: selectedClassId,
        // Local calendar date — toISOString() gave the UTC date, which
        // recorded attendance under *yesterday* before 05:30 IST.
        date: localDateStr(new Date()),
        records
      });
      
      toast.success('Attendance marked successfully!');
    } catch (error) {
      toast.error('Failed to mark attendance.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingScreen message="Loading assignments..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView 
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <SectionHeader title="Select Class" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classSelector}>
          {classes.map((cls) => (
            <TouchableOpacity
              key={cls.id}
              style={[
                styles.classItem,
                selectedClassId === cls.id && styles.selectedClassItem
              ]}
              onPress={() => setSelectedClassId(cls.id)}
            >
              <Text style={[
                styles.classText,
                selectedClassId === cls.id && styles.selectedClassText
              ]}>
                {cls.grade.name}-{cls.section.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <SectionHeader
          title={`Students (${students.length})`}
          rightElement={
            <TouchableOpacity
              style={styles.markAllBtn}
              onPress={() => {
                const allPresent: Record<number, 'Present' | 'Absent'> = {};
                students.forEach(s => allPresent[s.id] = 'Present');
                setAttendance(allPresent);
              }}
            >
              <Text style={styles.markAllText}>Mark All Present</Text>
            </TouchableOpacity>
          }
        />

        {students.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No students found in this class.</Text>
          </View>
        ) : (
          <View style={styles.studentList}>
            {students.map((student, index) => (
              <Animated.View key={student.id} entering={FadeInDown.delay(index * 50)}>
                <TouchableOpacity 
                  style={[
                    styles.studentCard,
                    attendance[student.id] === 'Absent' && styles.absentCard
                  ]}
                  onPress={() => toggleAttendance(student.id)}
                >
                  <View style={styles.studentInfo}>
                    <View style={[
                      styles.avatar,
                      { backgroundColor: attendance[student.id] === 'Present' ? Colors.success : Colors.danger }
                    ]}>
                      <Text style={styles.avatarText}>{student.name.charAt(0)}</Text>
                    </View>
                    <View>
                      <Text style={styles.studentName}>{student.name}</Text>
                      <Text style={styles.rollNo}>Roll No: {student.roll_number ?? student.roll_no ?? index + 1}</Text>
                    </View>
                  </View>
                  
                  <View style={[
                    styles.statusBadge,
                    attendance[student.id] === 'Present' ? styles.presentBadge : styles.absentBadge
                  ]}>
                    <Text style={[
                      styles.statusText,
                      attendance[student.id] === 'Present' ? styles.presentText : styles.absentText
                    ]}>
                      {attendance[student.id]}
                    </Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.submitBtn, submitting && styles.disabledBtn]} 
          onPress={handleSubmit}
          disabled={submitting || students.length === 0}
        >
          <Text style={styles.submitText}>{submitting ? 'Submitting...' : 'Submit Attendance'}</Text>
          {!submitting && <Ionicons name="checkmark-done" size={24} color={Colors.white} />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20 },
  classSelector: { marginBottom: 20, flexDirection: 'row' },
  classItem: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 10,
  },
  selectedClassItem: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  classText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  selectedClassText: { color: Colors.white },
  markAllBtn: { padding: 5 },
  markAllText: { fontSize: 12, color: Colors.primary, fontWeight: '700' },
  studentList: { gap: 12, marginBottom: 100 },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  absentCard: {
    borderColor: `${Colors.danger}40`,
    backgroundColor: `${Colors.danger}05`,
  },
  studentInfo: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  avatar: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontSize: 18, fontWeight: '900' },
  studentName: { fontSize: 16, fontWeight: '800', color: Colors.text },
  rollNo: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  presentBadge: { backgroundColor: `${Colors.success}15` },
  absentBadge: { backgroundColor: `${Colors.danger}15` },
  statusText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  presentText: { color: Colors.success },
  absentText: { color: Colors.danger },
  empty: { padding: 50, alignItems: 'center', gap: 10 },
  emptyText: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    padding: 18,
    borderRadius: 20,
    gap: 10,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  disabledBtn: { opacity: 0.6 },
  submitText: { color: Colors.white, fontSize: 18, fontWeight: '900' },
});
