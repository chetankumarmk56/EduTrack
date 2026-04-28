import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { marksService, type Mark } from '../../services';
import { Colors } from '../../constants/Colors';
import { Card, SectionHeader } from '../../components/ui/Card';
import { ProgressBar, LoadingScreen, EmptyState, ErrorState } from '../../components/ui/Feedback';
import { useRouter } from 'expo-router';

function getLetterGrade(pct: number) {
  if (pct >= 90) return { grade: 'A+', color: Colors.success };
  if (pct >= 80) return { grade: 'A', color: Colors.success };
  if (pct >= 70) return { grade: 'B+', color: Colors.info };
  if (pct >= 60) return { grade: 'B', color: Colors.info };
  if (pct >= 50) return { grade: 'C', color: Colors.warning };
  return { grade: 'D', color: Colors.danger };
}

interface SubjectSummary {
  subject: string;
  tests: Mark[];
  totalScore: number;
  maxScore: number;
  pct: number;
}

export default function MarksScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [marks, setMarks] = useState<Mark[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  const studentId = user?.student_id || user?.id;

  const fetchMarks = useCallback(async () => {
    if (!studentId) return;
    setError(null);
    try {
      const data = await marksService.getMarks(studentId);
      setMarks(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load marks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId]);

  useEffect(() => { fetchMarks(); }, [fetchMarks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMarks();
  }, [fetchMarks]);

  const subjectSummaries: SubjectSummary[] = useMemo(() => {
    const map: Record<string, Mark[]> = {};
    for (const m of marks) {
      if (!map[m.subject]) map[m.subject] = [];
      map[m.subject].push(m);
    }
    return Object.entries(map).map(([subject, tests]) => {
      const totalScore = tests.reduce((a, b) => a + b.score, 0);
      const maxScore = tests.reduce((a, b) => a + b.max_score, 0);
      const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
      return { subject, tests, totalScore, maxScore, pct };
    }).sort((a, b) => b.pct - a.pct);
  }, [marks]);

  const overallPct = useMemo(() => {
    if (subjectSummaries.length === 0) return 0;
    return Math.round(
      subjectSummaries.reduce((a, b) => a + b.pct, 0) / subjectSummaries.length,
    );
  }, [subjectSummaries]);

  const selectedSummary = selectedSubject
    ? subjectSummaries.find((s) => s.subject === selectedSubject) || null
    : null;

  if (loading) return <LoadingScreen message="Loading report card..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Marks Ledger</Text>
            <Text style={styles.subtitle}>Academic Record</Text>
          </View>
          <TouchableOpacity
            style={styles.aiButton}
            onPress={() => router.push('/ai-questions')}
            activeOpacity={0.8}
          >
            <Text style={styles.aiButtonText}>✨ AI Quiz</Text>
          </TouchableOpacity>
        </View>

        {error && <ErrorState message={error} onRetry={fetchMarks} />}

        {/* Overall Grade Card */}
        {subjectSummaries.length > 0 && (
          <View style={styles.overallCard}>
            <View style={styles.overallLeft}>
              <Text style={styles.overallLabel}>Overall Performance</Text>
              <Text style={styles.overallPct}>{overallPct}%</Text>
              <Text style={styles.overallSub}>{marks.length} assessments across {subjectSummaries.length} subjects</Text>
            </View>
            <View style={[styles.gradeBadge, { backgroundColor: getLetterGrade(overallPct).color }]}>
              <Text style={styles.gradeText}>{getLetterGrade(overallPct).grade}</Text>
            </View>
          </View>
        )}

        {/* Subject Cards */}
        {subjectSummaries.length > 0 ? (
          <View>
            <SectionHeader title="Subjects" subtitle="Tap a subject to see test details" />
            <View style={styles.subjectGrid}>
              {subjectSummaries.map((s) => {
                const { grade, color } = getLetterGrade(s.pct);
                const isSelected = selectedSubject === s.subject;
                return (
                  <TouchableOpacity
                    key={s.subject}
                    style={[styles.subjectCard, isSelected && styles.subjectCardSelected]}
                    onPress={() => setSelectedSubject(isSelected ? null : s.subject)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.subjectCardTop}>
                      <Text style={styles.subjectName} numberOfLines={1}>{s.subject}</Text>
                      <View style={[styles.gradeChip, { backgroundColor: `${color}22` }]}>
                        <Text style={[styles.gradeChipText, { color }]}>{grade}</Text>
                      </View>
                    </View>
                    <Text style={[styles.subjectPct, { color }]}>{s.pct}%</Text>
                    <ProgressBar value={s.pct} color={color} height={5} />
                    <Text style={styles.subjectMeta}>
                      {s.totalScore}/{s.maxScore} pts · {s.tests.length} test{s.tests.length !== 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : !error && (
          <EmptyState
            icon={<Text style={{ fontSize: 40 }}>📚</Text>}
            title="No marks recorded yet"
            subtitle="Your test results will appear here once your teacher records them"
          />
        )}

        {/* Expanded Test Details */}
        {selectedSummary && (
          <View>
            <SectionHeader
              title={selectedSummary.subject}
              subtitle={`${selectedSummary.tests.length} assessments`}
            />
            <Card>
              {selectedSummary.tests
                .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
                .map((test, i) => {
                  const testPct = test.max_score > 0 ? Math.round((test.score / test.max_score) * 100) : 0;
                  const { color } = getLetterGrade(testPct);
                  return (
                    <View
                      key={test.id}
                      style={[
                        styles.testRow,
                        i < selectedSummary.tests.length - 1 && styles.testDivider,
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.testName}>{test.test_name}</Text>
                        <Text style={styles.testDate}>
                          {new Date(test.recorded_at).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </Text>
                      </View>
                      <View style={styles.testScore}>
                        <Text style={[styles.testScoreValue, { color }]}>
                          {test.score}<Text style={styles.testScoreMax}>/{test.max_score}</Text>
                        </Text>
                        <Text style={[styles.testPct, { color }]}>{testPct}%</Text>
                      </View>
                    </View>
                  );
                })}
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, gap: 24, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: { fontSize: 26, fontWeight: '900', color: Colors.text, letterSpacing: -0.8 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginTop: 2 },
  aiButton: {
    backgroundColor: `${Colors.secondary}22`,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: `${Colors.secondary}44`,
  },
  aiButtonText: { fontSize: 13, fontWeight: '800', color: Colors.secondary },

  overallCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    borderRadius: 22,
    padding: 22,
  },
  overallLeft: { gap: 4 },
  overallLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.6 },
  overallPct: { fontSize: 40, fontWeight: '900', color: Colors.white, letterSpacing: -1.5 },
  overallSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  gradeBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeText: { fontSize: 24, fontWeight: '900', color: Colors.white },

  subjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  subjectCard: {
    width: '47%',
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subjectCardSelected: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  subjectCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subjectName: { fontSize: 13, fontWeight: '700', color: Colors.text, flex: 1, marginRight: 6 },
  gradeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  gradeChipText: { fontSize: 11, fontWeight: '800' },
  subjectPct: { fontSize: 26, fontWeight: '900', letterSpacing: -0.8 },
  subjectMeta: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },

  testRow: { paddingVertical: 14, flexDirection: 'row', alignItems: 'center' },
  testDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  testName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  testDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  testScore: { alignItems: 'flex-end', gap: 2 },
  testScoreValue: { fontSize: 18, fontWeight: '900' },
  testScoreMax: { fontSize: 14, color: Colors.textMuted, fontWeight: '500' },
  testPct: { fontSize: 11, fontWeight: '700' },
});
