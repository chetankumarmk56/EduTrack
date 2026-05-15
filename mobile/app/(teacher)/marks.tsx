import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { directoryService, marksService, type StudentProfile } from '../../services';
import { Colors } from '@/shared/constants/Colors';
import { Card, SectionHeader } from '@/shared/components/ui/Card';
import { LoadingScreen, ErrorState } from '@/shared/components/ui/Feedback';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function TeacherMarks() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedAssignmentIdx, setSelectedAssignmentIdx] = useState(0);
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [marksData, setMarksData] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await directoryService.getMyProfile();
      setAssignments(profile.assignments || []);
    } catch (err: any) {
      console.error('Failed to load assignments:', err);
      setError(err?.message || 'Failed to load class assignments');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStudentsAndExams = useCallback(async () => {
    const assignment = assignments[selectedAssignmentIdx];
    if (!assignment) return;

    try {
      // 1. Load Students
      const allStudents = await directoryService.getTeacherStudents();
      const classStudents = allStudents
        .filter(s => s.school_class?.id === assignment.school_class_id)
        .sort((a, b) => a.name.localeCompare(b.name));
      setStudents(classStudents);

      // 2. Load Exams
      const examList = await marksService.getExamsForClass(assignment.school_class_id, assignment.subject_id);
      setExams(examList);

      if (examList.length > 0) {
        const nextExamId = examList[0].id;
        setSelectedExamId(nextExamId);

        // 3. Load Existing Marks for this exam/class/subject
        // Use subject_ref.name (preferred) with fallback to subject.name
        const subjectName = assignment.subject_ref?.name ?? assignment.subject?.name ?? '';
        if (subjectName) {
          const existingMarks = await marksService.getClassMarks(subjectName, assignment.school_class_id, nextExamId);
          const marksMap: Record<number, string> = {};
          existingMarks.forEach(m => {
            if (m.student_id != null) {
              marksMap[m.student_id] = String(m.score ?? '');
            }
          });
          setMarksData(marksMap);
        }
      } else {
        setSelectedExamId(null);
        setMarksData({});
      }
    } catch (err: any) {
      console.error('Failed to load students/exams:', err);
      Alert.alert('Load Error', err?.message || 'Failed to load class data. Pull down to retry.');
    }
  }, [assignments, selectedAssignmentIdx]);

  useEffect(() => { loadInitialData(); }, [loadInitialData]);
  useEffect(() => { loadStudentsAndExams(); }, [loadStudentsAndExams]);

  const loadExistingMarks = async (examId: number) => {
    const assignment = assignments[selectedAssignmentIdx];
    if (!assignment) return;
    const subjectName = assignment.subject_ref?.name ?? assignment.subject?.name ?? '';
    if (!subjectName) return;
    try {
      const existingMarks = await marksService.getClassMarks(subjectName, assignment.school_class_id, examId);
      const marksMap: Record<number, string> = {};
      existingMarks.forEach(m => {
        if (m.student_id != null) {
          marksMap[m.student_id] = String(m.score ?? '');
        }
      });
      setMarksData(marksMap);
    } catch (err: any) {
      console.error('Failed to load existing marks:', err);
    }
  };

  const handleExamChange = (examId: number) => {
    setSelectedExamId(examId);
    loadExistingMarks(examId);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInitialData();
    await loadStudentsAndExams();
    setRefreshing(false);
  };

  const handleMarkChange = (studentId: number, value: string) => {
    setMarksData(prev => ({ ...prev, [studentId]: value }));
  };

  const handleSubmit = async () => {
    const assignment = assignments[selectedAssignmentIdx];
    if (!assignment || !selectedExamId) {
      Alert.alert('Error', 'Please select an assignment and an exam.');
      return;
    }
    
    setSubmitting(true);
    try {
      const marks = students.map(s => ({
        student_id: s.id,
        subject_id: assignment.subject_id,
        exam_id: selectedExamId,
        score: parseFloat(marksData[s.id] || '0'),
        max_score: 100
      }));
      
      await marksService.recordBatch(marks);
      Alert.alert('Success', 'Marks recorded successfully!');
      loadExistingMarks(selectedExamId); // Refresh after save
    } catch (error) {
      Alert.alert('Error', 'Failed to record marks.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingScreen message="Loading assignments..." />;
  if (error) return <ErrorState message={error} onRetry={loadInitialData} />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView 
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          
          <SectionHeader title="Select Subject & Class" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll}>
            {assignments.map((a, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.assignmentCard, selectedAssignmentIdx === i && styles.selectedAssignment]}
                onPress={() => setSelectedAssignmentIdx(i)}
              >
                <Text style={[styles.subjectName, selectedAssignmentIdx === i && styles.whiteText]}>
                  {a.subject_ref?.name ?? a.subject?.name ?? 'Subject'}
                </Text>
                <Text style={[styles.className, selectedAssignmentIdx === i && styles.whiteText]}>
                  {a.school_class?.grade?.name ?? '?'}-{a.school_class?.section?.name ?? '?'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <SectionHeader title="Assessment Type" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll}>
            {exams.length > 0 ? exams.map((e) => (
              <TouchableOpacity
                key={e.id}
                style={[styles.examItem, selectedExamId === e.id && styles.selectedExam]}
                onPress={() => handleExamChange(e.id)}
              >
                <Text style={[styles.examText, selectedExamId === e.id && styles.whiteText]}>{e.name}</Text>
              </TouchableOpacity>
            )) : (
              <View style={styles.noExams}>
                <Text style={styles.noExamsText}>No exams scheduled for this class.</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.headerRow}>
            <SectionHeader title="Mark Entry" />
            <Text style={styles.maxMarks}>Max: 100</Text>
          </View>

          <View style={styles.studentList}>
            {students.length === 0 ? (
               <View style={{ padding: 40, alignItems: 'center' }}>
                 <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                 <Text style={{ color: Colors.textMuted, marginTop: 10 }}>No students in this class.</Text>
               </View>
            ) : students.map((student, index) => (
              <Animated.View key={student.id} entering={FadeInDown.delay(index * 50)} style={styles.studentRow}>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName} numberOfLines={1}>{student.name}</Text>
                  <Text style={styles.rollNo}>Roll No: {student.roll_no || index + 1}</Text>
                </View>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.markInput}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                    value={marksData[student.id] || ''}
                    onChangeText={(val) => handleMarkChange(student.id, val)}
                    maxLength={3}
                  />
                  <Text style={styles.unitText}>/ 100</Text>
                </View>
              </Animated.View>
            ))}
          </View>

        </ScrollView>
        
        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.submitBtn, submitting && styles.disabledBtn]} 
            onPress={handleSubmit}
            disabled={submitting || students.length === 0 || !selectedExamId}
          >
            <Text style={styles.submitText}>{submitting ? 'Recording...' : 'Record Marks'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20 },
  selectorScroll: { marginBottom: 20, flexDirection: 'row' },
  assignmentCard: { padding: 15, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginRight: 12, minWidth: 140 },
  selectedAssignment: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  subjectName: { fontSize: 16, fontWeight: '800', color: Colors.text },
  className: { fontSize: 12, color: Colors.textMuted, fontWeight: '700', marginTop: 4 },
  whiteText: { color: Colors.white },
  examItem: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginRight: 10 },
  selectedExam: { backgroundColor: Colors.success, borderColor: Colors.success },
  examText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  noExams: { padding: 10 },
  noExamsText: { color: Colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  maxMarks: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  studentList: { gap: 10, marginBottom: 100 },
  studentRow: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: Colors.border },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  rollNo: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  markInput: { width: 60, height: 44, backgroundColor: Colors.background, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, textAlign: 'center', fontSize: 18, fontWeight: '900', color: Colors.primary },
  unitText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  footer: { padding: 20, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  submitBtn: { backgroundColor: Colors.primary, padding: 18, borderRadius: 20, alignItems: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 5 },
  disabledBtn: { opacity: 0.6 },
  submitText: { color: Colors.white, fontSize: 18, fontWeight: '900' },
});
