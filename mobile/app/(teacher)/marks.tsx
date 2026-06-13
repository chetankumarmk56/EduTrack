import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { directoryService, marksService, type StudentProfile } from '../../services';
import { Colors } from '@/shared/constants/Colors';
import { SectionHeader } from '@/shared/components/ui/Card';
import { LoadingScreen, ErrorState } from '@/shared/components/ui/Feedback';
import { toast } from '@/shared/components/ui/Toast';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

type ExamDialogMode = { kind: 'create' } | { kind: 'edit'; exam: any };

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
  const [maxMarks, setMaxMarks] = useState<string>('100');

  // Test create/edit modal state
  const [examDialog, setExamDialog] = useState<ExamDialogMode | null>(null);
  const [dialogName, setDialogName] = useState('');
  const [dialogSaving, setDialogSaving] = useState(false);

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

  const applyExistingMarks = (existingMarks: any[]) => {
    const marksMap: Record<number, string> = {};
    let observedMax: number | null = null;
    existingMarks.forEach((m) => {
      if (m.student_id != null) {
        marksMap[m.student_id] = String(m.score ?? '');
      }
      if (observedMax == null && m.max_score) observedMax = m.max_score;
    });
    setMarksData(marksMap);
    if (observedMax != null) setMaxMarks(String(observedMax));
  };

  const loadStudentsAndExams = useCallback(async () => {
    const assignment = assignments[selectedAssignmentIdx];
    if (!assignment) return;

    try {
      const allStudents = await directoryService.getTeacherStudents();
      const classStudents = allStudents
        .filter((s) => s.school_class?.id === assignment.school_class_id)
        .sort((a, b) => {
          const ra = a.roll_number ?? Number.MAX_SAFE_INTEGER;
          const rb = b.roll_number ?? Number.MAX_SAFE_INTEGER;
          return ra - rb || a.name.localeCompare(b.name);
        });
      setStudents(classStudents);

      const examList = await marksService.getExamsForClass(
        assignment.school_class_id,
        assignment.subject_id,
      );
      setExams(examList);

      if (examList.length > 0) {
        const nextExamId = examList[0].id;
        setSelectedExamId(nextExamId);

        const subjectName = assignment.subject_ref?.name ?? assignment.subject?.name ?? '';
        if (subjectName) {
          const existingMarks = await marksService.getClassMarks(
            subjectName,
            assignment.school_class_id,
            nextExamId,
          );
          applyExistingMarks(existingMarks);
        }
      } else {
        setSelectedExamId(null);
        setMarksData({});
      }
    } catch (err: any) {
      console.error('Failed to load students/exams:', err);
      toast.error(err?.message || 'Failed to load class data. Pull down to retry.', 'Load Error');
    }
  }, [assignments, selectedAssignmentIdx]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);
  useEffect(() => {
    loadStudentsAndExams();
  }, [loadStudentsAndExams]);

  const loadExistingMarks = async (examId: number) => {
    const assignment = assignments[selectedAssignmentIdx];
    if (!assignment) return;
    const subjectName = assignment.subject_ref?.name ?? assignment.subject?.name ?? '';
    if (!subjectName) return;
    try {
      const existingMarks = await marksService.getClassMarks(
        subjectName,
        assignment.school_class_id,
        examId,
      );
      applyExistingMarks(existingMarks);
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
    setMarksData((prev) => ({ ...prev, [studentId]: value }));
  };

  const parsedMaxMarks = (() => {
    const n = parseFloat(maxMarks);
    return Number.isFinite(n) && n > 0 ? n : 100;
  })();

  const handleSubmit = async () => {
    const assignment = assignments[selectedAssignmentIdx];
    if (!assignment || !selectedExamId) {
      toast.error('Please select an assignment and an exam.');
      return;
    }

    const max = parsedMaxMarks;

    // Validate scores client-side so the user sees a clear message.
    for (const s of students) {
      const raw = marksData[s.id];
      if (raw === undefined || raw === '') continue;
      const score = parseFloat(raw);
      if (!Number.isFinite(score) || score < 0 || score > max) {
        toast.error(`${s.name}'s score must be between 0 and ${max}.`, 'Invalid score');
        return;
      }
    }

    setSubmitting(true);
    try {
      const marks = students.map((s) => ({
        student_id: s.id,
        subject_id: assignment.subject_id,
        exam_id: selectedExamId,
        score: parseFloat(marksData[s.id] || '0'),
        max_score: max,
      }));

      await marksService.recordBatch(marks);
      toast.success('Marks recorded successfully!');
      loadExistingMarks(selectedExamId);
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail ||
        (Array.isArray(error?.response?.data?.detail) &&
          error.response.data.detail.map((e: any) => e.msg).join(', ')) ||
        error?.message ||
        'Failed to record marks.';
      toast.error(String(detail), 'Could not save marks');
    } finally {
      setSubmitting(false);
    }
  };

  const openCreateExam = () => {
    setDialogName('');
    setExamDialog({ kind: 'create' });
  };

  const openEditExam = (exam: any) => {
    setDialogName(exam.name || '');
    setExamDialog({ kind: 'edit', exam });
  };

  const closeDialog = () => {
    if (dialogSaving) return;
    setExamDialog(null);
    setDialogName('');
  };

  const handleDialogSubmit = async () => {
    if (!examDialog) return;
    const name = dialogName.trim();
    if (!name) {
      toast.error('Please enter a test name.', 'Name required');
      return;
    }
    const assignment = assignments[selectedAssignmentIdx];
    if (!assignment) return;

    setDialogSaving(true);
    try {
      if (examDialog.kind === 'create') {
        const created = await marksService.createExam(
          { name },
          assignment.school_class_id,
          assignment.subject_id,
        );
        setExams((prev) => [...prev, created]);
        setSelectedExamId(created.id);
        setMarksData({});
      } else {
        const updated = await marksService.updateExam(examDialog.exam.id, name);
        setExams((prev) =>
          prev.map((e) => (e.id === examDialog.exam.id ? { ...e, ...updated } : e)),
        );
      }
      toast.success(examDialog.kind === 'create' ? 'Test created' : 'Test updated');
      setExamDialog(null);
      setDialogName('');
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail || err?.message || 'Failed to save test.';
      toast.error(String(detail), 'Could not save test');
    } finally {
      setDialogSaving(false);
    }
  };

  const handleDeleteExam = (exam: any) => {
    Alert.alert(
      'Delete test?',
      `This permanently deletes "${exam.name}" and all marks recorded under it. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await marksService.deleteExam(exam.id);
              setExams((prev) => {
                const next = prev.filter((e) => e.id !== exam.id);
                if (selectedExamId === exam.id) {
                  const fallback = next[0]?.id ?? null;
                  setSelectedExamId(fallback);
                  if (fallback != null) {
                    loadExistingMarks(fallback);
                  } else {
                    setMarksData({});
                  }
                }
                return next;
              });
              toast.success('Test deleted');
            } catch (err: any) {
              const detail =
                err?.response?.data?.detail || err?.message || 'Failed to delete test.';
              toast.error(String(detail), 'Could not delete test');
            }
          },
        },
      ],
    );
  };

  if (loading) return <LoadingScreen message="Loading assignments..." />;
  if (error) return <ErrorState message={error} onRetry={loadInitialData} />;

  const currentAssignment = assignments[selectedAssignmentIdx];
  const canManageExams = !!currentAssignment;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <SectionHeader title="Select Subject & Class" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.selectorScroll}
          >
            {assignments.map((a, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.assignmentCard,
                  selectedAssignmentIdx === i && styles.selectedAssignment,
                ]}
                onPress={() => setSelectedAssignmentIdx(i)}
              >
                <Text
                  style={[
                    styles.subjectName,
                    selectedAssignmentIdx === i && styles.whiteText,
                  ]}
                >
                  {a.subject_ref?.name ?? a.subject?.name ?? 'Subject'}
                </Text>
                <Text
                  style={[
                    styles.className,
                    selectedAssignmentIdx === i && styles.whiteText,
                  ]}
                >
                  {a.school_class?.grade?.name ?? '?'}-
                  {a.school_class?.section?.name ?? '?'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <SectionHeader
            title="Assessment Type"
            rightElement={
              <TouchableOpacity
                style={[styles.newTestBtn, !canManageExams && styles.disabledBtn]}
                onPress={openCreateExam}
                disabled={!canManageExams}
              >
                <Ionicons name="add" size={16} color={Colors.white} />
                <Text style={styles.newTestText}>New Test</Text>
              </TouchableOpacity>
            }
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.selectorScroll}
          >
            {exams.length > 0 ? (
              exams.map((e) => {
                const isSelected = selectedExamId === e.id;
                return (
                  <View
                    key={e.id}
                    style={[styles.examItem, isSelected && styles.selectedExam]}
                  >
                    <TouchableOpacity
                      onPress={() => handleExamChange(e.id)}
                      style={styles.examTouchable}
                    >
                      <Text
                        style={[styles.examText, isSelected && styles.whiteText]}
                        numberOfLines={1}
                      >
                        {e.name}
                      </Text>
                    </TouchableOpacity>
                    {isSelected && (
                      <View style={styles.examActions}>
                        <TouchableOpacity
                          onPress={() => openEditExam(e)}
                          style={styles.examActionBtn}
                          hitSlop={8}
                        >
                          <Ionicons name="pencil" size={14} color={Colors.white} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteExam(e)}
                          style={styles.examActionBtn}
                          hitSlop={8}
                        >
                          <Ionicons name="trash" size={14} color={Colors.white} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            ) : (
              <View style={styles.noExams}>
                <Text style={styles.noExamsText}>
                  No tests yet. Tap "New Test" to create one.
                </Text>
              </View>
            )}
          </ScrollView>

          <SectionHeader
            title="Mark Entry"
            rightElement={
              <View style={styles.maxMarksRow}>
                <Text style={styles.maxMarksLabel}>Max:</Text>
                <TextInput
                  style={styles.maxMarksInput}
                  keyboardType="numeric"
                  value={maxMarks}
                  onChangeText={(val) => setMaxMarks(val.replace(/[^0-9.]/g, ''))}
                  onBlur={() => {
                    const n = parseFloat(maxMarks);
                    if (!Number.isFinite(n) || n <= 0) setMaxMarks('100');
                  }}
                  maxLength={5}
                  placeholder="100"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            }
          />

          <View style={styles.studentList}>
            {students.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                <Text style={{ color: Colors.textMuted, marginTop: 10 }}>
                  No students in this class.
                </Text>
              </View>
            ) : (
              students.map((student, index) => (
                <Animated.View
                  key={student.id}
                  entering={FadeInDown.delay(index * 50)}
                  style={styles.studentRow}
                >
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName} numberOfLines={1}>
                      {student.name}
                    </Text>
                    <Text style={styles.rollNo}>
                      Roll No: {student.roll_number ?? student.roll_no ?? index + 1}
                    </Text>
                  </View>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.markInput}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={Colors.textMuted}
                      value={marksData[student.id] || ''}
                      onChangeText={(val) => handleMarkChange(student.id, val)}
                      maxLength={5}
                    />
                    <Text style={styles.unitText}>/ {parsedMaxMarks}</Text>
                  </View>
                </Animated.View>
              ))
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.disabledBtn]}
            onPress={handleSubmit}
            disabled={submitting || students.length === 0 || !selectedExamId}
          >
            <Text style={styles.submitText}>
              {submitting ? 'Recording...' : 'Record Marks'}
            </Text>
          </TouchableOpacity>
        </View>

        <Modal
          visible={examDialog !== null}
          transparent
          animationType="fade"
          onRequestClose={closeDialog}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeDialog}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>
                {examDialog?.kind === 'edit' ? 'Rename Test' : 'New Test'}
              </Text>
              <Text style={styles.modalHint}>
                {examDialog?.kind === 'edit'
                  ? 'Update the test name. Existing marks stay attached.'
                  : `Create a test for ${
                      currentAssignment?.subject_ref?.name ??
                      currentAssignment?.subject?.name ??
                      'this subject'
                    } (${currentAssignment?.school_class?.grade?.name ?? '?'}-${
                      currentAssignment?.school_class?.section?.name ?? '?'
                    }).`}
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Unit Test 1"
                placeholderTextColor={Colors.textMuted}
                value={dialogName}
                onChangeText={setDialogName}
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                  onPress={closeDialog}
                  disabled={dialogSaving}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalSaveBtn, dialogSaving && styles.disabledBtn]}
                  onPress={handleDialogSubmit}
                  disabled={dialogSaving}
                >
                  <Text style={styles.modalSaveText}>
                    {dialogSaving
                      ? 'Saving...'
                      : examDialog?.kind === 'edit'
                      ? 'Save'
                      : 'Create'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20 },
  selectorScroll: { marginBottom: 20, flexDirection: 'row' },
  assignmentCard: {
    padding: 15,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 12,
    minWidth: 140,
  },
  selectedAssignment: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  subjectName: { fontSize: 16, fontWeight: '800', color: Colors.text },
  className: { fontSize: 12, color: Colors.textMuted, fontWeight: '700', marginTop: 4 },
  whiteText: { color: Colors.white },
  examItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 10,
  },
  selectedExam: { backgroundColor: Colors.success, borderColor: Colors.success },
  examTouchable: { paddingVertical: 4, paddingRight: 6, maxWidth: 180 },
  examText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  examActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  examActionBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginLeft: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  noExams: { padding: 10 },
  noExamsText: { color: Colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  newTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 4,
  },
  newTestText: { color: Colors.white, fontSize: 13, fontWeight: '800' },
  maxMarksRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  maxMarksLabel: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  maxMarksInput: {
    minWidth: 56,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '900',
    color: Colors.primary,
  },
  studentList: { gap: 10, marginBottom: 100 },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  rollNo: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  markInput: {
    width: 64,
    height: 44,
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '900',
    color: Colors.primary,
  },
  unitText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  footer: {
    padding: 20,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    padding: 18,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 5,
  },
  disabledBtn: { opacity: 0.6 },
  submitText: { color: Colors.white, fontSize: 18, fontWeight: '900' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, marginBottom: 6 },
  modalHint: { fontSize: 12, color: Colors.textMuted, marginBottom: 16, lineHeight: 18 },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  modalBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  modalCancelBtn: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  modalCancelText: { color: Colors.text, fontWeight: '800' },
  modalSaveBtn: { backgroundColor: Colors.primary },
  modalSaveText: { color: Colors.white, fontWeight: '900' },
});
