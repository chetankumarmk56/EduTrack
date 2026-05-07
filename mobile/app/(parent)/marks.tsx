import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, Layout } from 'react-native-reanimated';
import { useAuth } from '../../hooks/useAuth';
import { marksService, type Mark } from '../../services';
import { Colors } from '../../constants/Colors';
import { Card, SectionHeader } from '../../components/ui/Card';
import { ProgressBar, LoadingScreen, EmptyState, ErrorState } from '../../components/ui/Feedback';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

function getLetterGrade(pct: number) {
  if (pct >= 90) return { grade: 'A+', color: '#10b981', label: 'Outstanding' };
  if (pct >= 80) return { grade: 'A', color: '#10b981', label: 'Excellent' };
  if (pct >= 70) return { grade: 'B+', color: '#3b82f6', label: 'Very Good' };
  if (pct >= 60) return { grade: 'B', color: '#3b82f6', label: 'Good' };
  if (pct >= 50) return { grade: 'C', color: '#f59e0b', label: 'Average' };
  return { grade: 'D', color: '#ef4444', label: 'Needs Improvement' };
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
      setError(e.message || 'Failed to load academic records');
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
      // Prefer subject_ref.name (new API), fall back to legacy subject field
      const subjectKey = m.subject_ref?.name || m.subject || 'General';
      if (!map[subjectKey]) map[subjectKey] = [];
      map[subjectKey].push(m);
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

  if (loading) return <LoadingScreen message="Decrypting report cards..." />;

  const { grade: overallGrade, color: overallColor, label: overallLabel } = getLetterGrade(overallPct);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Neon Header */}
        <Animated.View entering={FadeInUp} style={styles.header}>
          <View>
            <Text style={styles.title}>Academic Ledger</Text>
            <Text style={styles.subtitle}>Performance Overview</Text>
          </View>
          <TouchableOpacity
            style={styles.aiButton}
            onPress={() => router.push('/ai-questions')}
          >
            <Text style={styles.aiButtonText}>✨ Neon Quiz</Text>
          </TouchableOpacity>
        </Animated.View>

        {error && <ErrorState message={error} onRetry={fetchMarks} />}

        {/* Neon Hero Card */}
        {subjectSummaries.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200)}>
            <View style={[styles.heroCard, { backgroundColor: Colors.primary }]}>
              <View style={styles.heroContent}>
                <Text style={styles.heroLabel}>{overallLabel}</Text>
                <Text style={styles.heroPct}>{overallPct}%</Text>
                <View style={styles.heroDivider} />
                <Text style={styles.heroSub}>{marks.length} Total Assessments</Text>
              </View>
              <View style={styles.heroBadge}>
                <Text style={styles.heroGrade}>{overallGrade}</Text>
              </View>
              <View style={styles.neonGlow} />
            </View>
          </Animated.View>
        )}

        {/* Subject Grid */}
        {subjectSummaries.length > 0 ? (
          <View>
            <SectionHeader title="Subject Mastery" subtitle="Tap to see breakdown" />
            <View style={styles.subjectGrid}>
              {subjectSummaries.map((s, index) => {
                const { grade, color } = getLetterGrade(s.pct);
                const isSelected = selectedSubject === s.subject;
                return (
                  <Card 
                    key={s.subject} 
                    index={index} 
                    onPress={() => setSelectedSubject(isSelected ? null : s.subject)}
                    style={[styles.subjectTile, isSelected && { borderColor: Colors.primary, borderWidth: 2 }]}
                  >
                    <View style={styles.tileHeader}>
                      <Text style={styles.tileSubject} numberOfLines={1}>{s.subject}</Text>
                      <View style={[styles.tileGrade, { backgroundColor: `${color}15` }]}>
                        <Text style={[styles.tileGradeText, { color }]}>{grade}</Text>
                      </View>
                    </View>
                    <Text style={[styles.tilePct, { color: Colors.primary }]}>{s.pct}%</Text>
                    <ProgressBar 
                      value={s.pct} 
                      color={Colors.primary} 
                      height={6} 
                      style={{ backgroundColor: `${Colors.primary}10` }}
                    />
                    <Text style={styles.tileMeta}>{s.tests.length} tests recorded</Text>
                  </Card>
                );
              })}
            </View>
          </View>
        ) : !error && (
          <EmptyState
            icon={<Text style={{ fontSize: 50 }}>📚</Text>}
            title="Curriculum pending"
            subtitle="Your academic data will manifest here soon."
          />
        )}

        {/* Animated Details Section */}
        {selectedSummary && (
          <Animated.View layout={Layout.springify()} entering={FadeInDown}>
            <SectionHeader
              title={`${selectedSummary.subject} Breakdown`}
              subtitle="Detailed test history"
            />
            <Card>
              {selectedSummary.tests
                .sort((a, b) => {
                  // Sort by exam date if available, otherwise keep order
                  const dateA = a.exam?.date || '';
                  const dateB = b.exam?.date || '';
                  return dateB.localeCompare(dateA);
                })
                .map((test, i) => {
                  const testPct = test.max_score > 0 ? Math.round((test.score / test.max_score) * 100) : 0;
                  const { color } = getLetterGrade(testPct);
                  // Prefer exam.name (new API), fall back to legacy test_name
                  const displayName = test.exam?.name || test.test_name || 'Assessment';
                  const displayDate = test.exam?.date;
                  return (
                    <View key={test.id} style={[styles.testRow, i < selectedSummary.tests.length - 1 && styles.divider]}>
                      <View style={styles.testInfo}>
                        <Text style={styles.testName}>{displayName}</Text>
                        <Text style={styles.testDate}>
                          {displayDate
                            ? new Date(displayDate).toLocaleDateString('en-IN', {
                                day: 'numeric', month: 'short', year: 'numeric',
                              })
                            : 'Date not set'}
                        </Text>
                      </View>
                      <View style={styles.testResult}>
                        <Text style={[styles.testScore, { color: Colors.text }]}>
                          {test.score}<Text style={styles.testMax}>/{test.max_score}</Text>
                        </Text>
                        <View style={[styles.testPctBadge, { backgroundColor: `${Colors.primary}10` }]}>
                          <Text style={[styles.testPctText, { color: Colors.primary }]}>{testPct}%</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
            </Card>
          </Animated.View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, gap: 20 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 30, fontWeight: '900', color: Colors.text, letterSpacing: -1.2 },
  subtitle: { fontSize: 15, color: Colors.textSecondary, fontWeight: '600', marginTop: 2 },
  aiButton: {
    backgroundColor: `${Colors.secondary}15`,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${Colors.secondary}30`,
  },
  aiButtonText: { fontSize: 13, fontWeight: '800', color: Colors.secondary },

  heroCard: {
    borderRadius: 32,
    padding: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  heroContent: { zIndex: 2 },
  heroLabel: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: 1 },
  heroPct: { fontSize: 60, fontWeight: '900', color: Colors.white, letterSpacing: -3 },
  heroDivider: { width: 45, height: 5, backgroundColor: 'rgba(255,255,255,0.3)', marginVertical: 14, borderRadius: 3 },
  heroSub: { fontSize: 15, color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
  heroBadge: {
    width: 84,
    height: 84,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  heroGrade: { fontSize: 36, fontWeight: '900', color: Colors.white },
  neonGlow: {
    position: 'absolute',
    right: -30,
    top: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.15)',
    zIndex: 1,
  },

  subjectGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  subjectTile: { width: (width - 52) / 2, marginBottom: 12 },
  tileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  tileSubject: { fontSize: 15, fontWeight: '800', color: Colors.text, flex: 1, marginRight: 8 },
  tileGrade: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tileGradeText: { fontSize: 11, fontWeight: '900' },
  tilePct: { fontSize: 32, fontWeight: '900', marginVertical: 6, letterSpacing: -1 },
  tileMeta: { fontSize: 12, color: Colors.textMuted, fontWeight: '700', marginTop: 6 },

  testRow: { paddingVertical: 20, flexDirection: 'row', alignItems: 'center' },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  testInfo: { flex: 1 },
  testName: { fontSize: 17, fontWeight: '800', color: Colors.text },
  testDate: { fontSize: 13, color: Colors.textSecondary, marginTop: 5, fontWeight: '500' },
  testResult: { alignItems: 'flex-end' },
  testScore: { fontSize: 20, fontWeight: '900' },
  testMax: { fontSize: 14, color: Colors.textMuted, fontWeight: '700' },
  testPctBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginTop: 5 },
  testPctText: { fontSize: 13, fontWeight: '900' },
});
