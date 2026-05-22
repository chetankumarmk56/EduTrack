import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { marksService, directoryService, type Mark } from '../../services';
import { Colors } from '@/shared/constants/Colors';
import { LoadingScreen, EmptyState, ErrorState } from '@/shared/components/ui/Feedback';
import { Skeleton, SkeletonHeader, SkeletonStatRow, SkeletonList } from '@/shared/components/ui/Skeleton';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type SortKey = 'best' | 'worst' | 'name' | 'recent';

interface GradeMeta {
  grade: string;
  color: string;
  bg: string;
  label: string;
}

function gradeFor(pct: number): GradeMeta {
  if (pct >= 90) return { grade: 'A+', color: '#10b981', bg: '#ecfdf5', label: 'Outstanding' };
  if (pct >= 80) return { grade: 'A',  color: '#10b981', bg: '#ecfdf5', label: 'Excellent' };
  if (pct >= 70) return { grade: 'B+', color: '#2563eb', bg: '#eff6ff', label: 'Very Good' };
  if (pct >= 60) return { grade: 'B',  color: '#2563eb', bg: '#eff6ff', label: 'Good' };
  if (pct >= 50) return { grade: 'C',  color: '#f59e0b', bg: '#fffbeb', label: 'Average' };
  if (pct >= 35) return { grade: 'D',  color: '#f97316', bg: '#fff7ed', label: 'Below Average' };
  return            { grade: 'F',  color: '#ef4444', bg: '#fef2f2', label: 'Needs Work' };
}

const SUBJECT_ICONS: { match: RegExp; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { match: /math|algebra|geom/i,           icon: 'calculator',   color: '#2563eb' },
  { match: /sci|phys/i,                    icon: 'flash',        color: '#0891b2' },
  { match: /chem/i,                        icon: 'flask',        color: '#7c3aed' },
  { match: /bio|life/i,                    icon: 'leaf',         color: '#16a34a' },
  { match: /eng|lit|lang/i,                icon: 'book',         color: '#db2777' },
  { match: /hindi|sansk|tamil|telugu|urdu/i, icon: 'language',   color: '#ea580c' },
  { match: /hist/i,                        icon: 'time',         color: '#92400e' },
  { match: /geo/i,                         icon: 'globe',        color: '#0d9488' },
  { match: /comp|coding|cs/i,              icon: 'code-slash',   color: '#475569' },
  { match: /art|draw|paint/i,              icon: 'color-palette', color: '#9333ea' },
  { match: /music/i,                       icon: 'musical-notes', color: '#c026d3' },
  { match: /sport|phys ed|pe/i,            icon: 'football',     color: '#e11d48' },
  { match: /soc|civic|moral/i,             icon: 'people',       color: '#65a30d' },
];

function iconForSubject(name: string): { icon: keyof typeof Ionicons.glyphMap; color: string } {
  for (const m of SUBJECT_ICONS) {
    if (m.match.test(name)) return { icon: m.icon, color: m.color };
  }
  return { icon: 'school', color: Colors.primary };
}

function abbreviateSubject(name: string, max = 5): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '—';
  if (trimmed.length <= max) return trimmed;
  // Multi-word: take initials of each word, e.g. "Social Studies" -> "SS"
  const words = trimmed.split(/\s+/);
  if (words.length > 1) {
    return words.map((w) => w[0]).join('').toUpperCase().slice(0, max);
  }
  // Single long word: take first {max-1} + dot, e.g. "Mathematics" -> "Math."
  return trimmed.slice(0, Math.max(3, max - 1)) + '.';
}

interface SubjectSummary {
  subject: string;
  tests: Mark[];
  totalScore: number;
  maxScore: number;
  pct: number;
  best: number;
  recent?: Mark;
}

interface Rankings {
  class_rank: number | null;
  class_total: number;
  grade_rank: number | null;
  grade_total: number;
  percentage: number;
}

function getDateMs(m: Mark): number {
  const d = m.exam?.date;
  return d ? new Date(d).getTime() : 0;
}

export default function MarksScreen() {
  const { user } = useAuth();
  const [marks, setMarks] = useState<Mark[]>([]);
  const [rankings, setRankings] = useState<Rankings | null>(null);
  const [schoolClassId, setSchoolClassId] = useState<number | null>(null);
  const [classAvgPct, setClassAvgPct] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('best');
  const [expanded, setExpanded] = useState<string | null>(null);

  const studentId = user?.student_id || user?.id;

  const fetchMarks = useCallback(async () => {
    if (!studentId) return;
    setError(null);
    try {
      const [marksData, rankData, profile] = await Promise.all([
        marksService.getMarks(studentId),
        marksService.getRankings(studentId).catch(() => null),
        directoryService.getMyProfile().catch(() => null),
      ]);
      setMarks(marksData || []);
      setRankings(rankData);
      setSchoolClassId(profile?.school_class?.id ?? null);
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

  const summaries: SubjectSummary[] = useMemo(() => {
    const map: Record<string, Mark[]> = {};
    for (const m of marks) {
      const key = m.subject_ref?.name || m.subject || 'General';
      (map[key] ||= []).push(m);
    }
    return Object.entries(map).map(([subject, tests]) => {
      const totalScore = tests.reduce((a, b) => a + b.score, 0);
      const maxScore = tests.reduce((a, b) => a + b.max_score, 0);
      const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
      const best = tests.reduce(
        (m, t) => Math.max(m, t.max_score > 0 ? Math.round((t.score / t.max_score) * 100) : 0),
        0,
      );
      const recent = tests.slice().sort((a, b) => getDateMs(b) - getDateMs(a))[0];
      return { subject, tests, totalScore, maxScore, pct, best, recent };
    });
  }, [marks]);

  // Fetch class averages for every subject the student has marks in.
  // Backend returns raw average; convert to percentage using the student's
  // per-subject average max_score so it's directly comparable to studentPct.
  useEffect(() => {
    if (!schoolClassId || summaries.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.allSettled(
        summaries.map((s) => marksService.getSubjectSummary(s.subject, schoolClassId)),
      );
      if (cancelled) return;
      const next: Record<string, number> = {};
      summaries.forEach((s, i) => {
        const r = results[i];
        if (r.status !== 'fulfilled' || !r.value.count) return;
        const avgMax = s.tests.length > 0 ? s.maxScore / s.tests.length : 0;
        if (avgMax > 0) {
          next[s.subject] = Math.round((r.value.average / avgMax) * 100);
        }
      });
      setClassAvgPct(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolClassId, summaries]);

  const comparisonChartData = useMemo(
    () =>
      summaries
        .map((s) => ({
          subject: s.subject,
          studentPct: s.pct,
          classPct: classAvgPct[s.subject] ?? null,
        }))
        .sort((a, b) => b.studentPct - a.studentPct),
    [summaries, classAvgPct],
  );

  const sortedSummaries = useMemo(() => {
    const arr = [...summaries];
    if (sort === 'best') arr.sort((a, b) => b.pct - a.pct);
    else if (sort === 'worst') arr.sort((a, b) => a.pct - b.pct);
    else if (sort === 'name') arr.sort((a, b) => a.subject.localeCompare(b.subject));
    else if (sort === 'recent') {
      arr.sort((a, b) => {
        const ad = a.recent ? getDateMs(a.recent) : 0;
        const bd = b.recent ? getDateMs(b.recent) : 0;
        return bd - ad;
      });
    }
    return arr;
  }, [summaries, sort]);

  const overallPct = useMemo(() => {
    if (summaries.length === 0) return 0;
    return Math.round(summaries.reduce((a, b) => a + b.pct, 0) / summaries.length);
  }, [summaries]);

  const recentAssessments = useMemo(
    () => marks.slice().sort((a, b) => getDateMs(b) - getDateMs(a)).slice(0, 5),
    [marks],
  );

  const topSubject = useMemo(
    () => [...summaries].sort((a, b) => b.pct - a.pct)[0],
    [summaries],
  );
  const focusSubject = useMemo(() => {
    const arr = [...summaries].sort((a, b) => a.pct - b.pct);
    return arr[0] && arr[0].pct < 70 ? arr[0] : null;
  }, [summaries]);

  const toggleExpand = (subject: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((cur) => (cur === subject ? null : subject));
  };

  if (loading) {
    return (
      <View style={{ flex: 1, padding: 20, gap: 16 }}>
        <SkeletonHeader />
        <Skeleton height={140} borderRadius={24} />
        <SkeletonStatRow count={3} />
        <SkeletonList rows={4} />
      </View>
    );
  }

  const overall = gradeFor(overallPct);

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
        <Animated.View entering={FadeInUp.duration(400)} style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Academics</Text>
            <Text style={styles.subtitle}>
              {marks.length} assessment{marks.length === 1 ? '' : 's'} · {summaries.length} subject{summaries.length === 1 ? '' : 's'}
            </Text>
          </View>
        </Animated.View>

        {error && <ErrorState message={error} onRetry={fetchMarks} />}

        {summaries.length === 0 && !error ? (
          <View style={{ marginTop: 48 }}>
            <EmptyState
              icon={<Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />}
              title="No marks yet"
              subtitle="Your assessment results will appear here once your teachers record them."
            />
          </View>
        ) : (
          <>
            {/* HERO */}
            <Animated.View entering={FadeInDown.delay(80)} style={styles.heroWrap}>
              <View style={[styles.heroCard, { backgroundColor: overall.color }]}>
                <View style={styles.heroBgCircle1} />
                <View style={styles.heroBgCircle2} />

                <View style={styles.heroTop}>
                  <View style={styles.heroPill}>
                    <Ionicons name="trophy" size={12} color={Colors.white} />
                    <Text style={styles.heroPillText}>{overall.label.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.heroLabel}>OVERALL MASTERY</Text>
                </View>

                <View style={styles.heroMain}>
                  <View style={styles.heroPctBox}>
                    <Text style={styles.heroPct}>{overallPct}</Text>
                    <Text style={styles.heroPctSign}>%</Text>
                  </View>
                  <View style={styles.heroGradeBox}>
                    <Text style={styles.heroGrade}>{overall.grade}</Text>
                    <Text style={styles.heroGradeSub}>GRADE</Text>
                  </View>
                </View>

              </View>
            </Animated.View>

            {/* Mastery Analytics — Student vs Class Avg (mirrors website) */}
            {comparisonChartData.length > 0 && (
              <Animated.View entering={FadeInDown.delay(120)}>
                <SubjectComparisonChart data={comparisonChartData} />
              </Animated.View>
            )}

            {/* Top / Focus highlights */}
            {(topSubject || focusSubject) && (
              <Animated.View entering={FadeInDown.delay(150)} style={styles.highlightRow}>
                {topSubject && (
                  <HighlightCard
                    label="Top Subject"
                    icon="trophy"
                    color={Colors.success}
                    title={topSubject.subject}
                    pct={topSubject.pct}
                  />
                )}
                {focusSubject && (
                  <HighlightCard
                    label="Focus Area"
                    icon="trending-down"
                    color={Colors.warning}
                    title={focusSubject.subject}
                    pct={focusSubject.pct}
                  />
                )}
              </Animated.View>
            )}

            {/* Rank cards */}
            {rankings && (rankings.class_rank || rankings.grade_rank) && (
              <Animated.View entering={FadeInDown.delay(180)} style={styles.rankRow}>
                <RankCard
                  label="Section Rank"
                  hint="Within your section"
                  rank={rankings.class_rank}
                  total={rankings.class_total}
                  color={Colors.primary}
                  icon="ribbon"
                />
                <RankCard
                  label="Class Rank"
                  hint="Across the grade"
                  rank={rankings.grade_rank}
                  total={rankings.grade_total}
                  color={Colors.success}
                  icon="trophy"
                />
              </Animated.View>
            )}

            {/* Recent assessments */}
            {recentAssessments.length > 0 && (
              <Animated.View entering={FadeInDown.delay(220)}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Recent Assessments</Text>
                  <Text style={styles.sectionSub}>Latest scores</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recentScroll}
                >
                  {recentAssessments.map((m) => {
                    const pct = m.max_score > 0 ? Math.round((m.score / m.max_score) * 100) : 0;
                    const subjectName = m.subject_ref?.name || m.subject || 'General';
                    const sIcon = iconForSubject(subjectName);
                    const g = gradeFor(pct);
                    return (
                      <View key={m.id} style={styles.recentCard}>
                        <View style={[styles.recentIcon, { backgroundColor: `${sIcon.color}15` }]}>
                          <Ionicons name={sIcon.icon} size={16} color={sIcon.color} />
                        </View>
                        <Text style={styles.recentSubject} numberOfLines={1}>
                          {subjectName}
                        </Text>
                        <Text style={styles.recentTest} numberOfLines={1}>
                          {m.exam?.name || m.test_name || 'Assessment'}
                        </Text>
                        <View style={styles.recentScoreRow}>
                          <Text style={[styles.recentPct, { color: g.color }]}>{pct}%</Text>
                          <View style={[styles.recentGrade, { backgroundColor: g.bg }]}>
                            <Text style={[styles.recentGradeText, { color: g.color }]}>
                              {g.grade}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.recentScore}>
                          {m.score}/{m.max_score}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </Animated.View>
            )}

            {/* Sort pills */}
            <Animated.View entering={FadeInDown.delay(280)} style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Subjects</Text>
              <Text style={styles.sectionSub}>Tap to expand</Text>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(300)}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillRow}
              >
                {(['best', 'worst', 'name', 'recent'] as SortKey[]).map((k) => {
                  const active = sort === k;
                  const label =
                    k === 'best' ? 'Highest' :
                    k === 'worst' ? 'Lowest' :
                    k === 'name' ? 'A → Z' : 'Most Recent';
                  return (
                    <TouchableOpacity
                      key={k}
                      activeOpacity={0.85}
                      onPress={() => setSort(k)}
                      style={[styles.pill, active && styles.pillActive]}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Animated.View>

            {/* Subject list */}
            <View style={styles.list}>
              {sortedSummaries.map((s, idx) => {
                const g = gradeFor(s.pct);
                const sIcon = iconForSubject(s.subject);
                const isOpen = expanded === s.subject;

                return (
                  <Animated.View
                    key={s.subject}
                    entering={FadeInDown.delay(idx * 40)}
                    layout={LinearTransition.springify().damping(18)}
                    style={[styles.subjectCard, { borderLeftColor: g.color }]}
                  >
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => toggleExpand(s.subject)}
                      style={styles.subjectHead}
                    >
                      <View style={[styles.subjectIcon, { backgroundColor: `${sIcon.color}15` }]}>
                        <Ionicons name={sIcon.icon} size={20} color={sIcon.color} />
                      </View>

                      <View style={styles.subjectInfo}>
                        <Text style={styles.subjectName} numberOfLines={1}>
                          {s.subject}
                        </Text>
                        <Text style={styles.subjectMeta}>
                          {s.tests.length} test{s.tests.length === 1 ? '' : 's'} ·
                          {' '}Best {s.best}%
                        </Text>
                      </View>

                      <View style={styles.subjectRight}>
                        <Text style={[styles.subjectPct, { color: g.color }]}>
                          {s.pct}%
                        </Text>
                        <View style={[styles.gradeBadge, { backgroundColor: g.bg }]}>
                          <Text style={[styles.gradeBadgeText, { color: g.color }]}>
                            {g.grade}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Progress bar */}
                    <View style={styles.barRow}>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { width: `${Math.max(2, s.pct)}%`, backgroundColor: g.color },
                          ]}
                        />
                      </View>
                      <Ionicons
                        name={isOpen ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={Colors.textMuted}
                      />
                    </View>

                    {isOpen && (
                      <View style={styles.testsBlock}>
                        <View style={styles.testsHeader}>
                          <Text style={styles.testsHeaderText}>ASSESSMENT</Text>
                          <Text style={styles.testsHeaderText}>SCORE</Text>
                        </View>
                        {s.tests
                          .slice()
                          .sort((a, b) => getDateMs(b) - getDateMs(a))
                          .map((t, i) => {
                            const pct = t.max_score > 0
                              ? Math.round((t.score / t.max_score) * 100)
                              : 0;
                            const tg = gradeFor(pct);
                            const name = t.exam?.name || t.test_name || 'Assessment';
                            const date = t.exam?.date;
                            return (
                              <View
                                key={t.id}
                                style={[
                                  styles.testRow,
                                  i < s.tests.length - 1 && styles.testRowDivider,
                                ]}
                              >
                                <View style={styles.testInfo}>
                                  <Text style={styles.testName} numberOfLines={1}>{name}</Text>
                                  <Text style={styles.testDate}>
                                    {date
                                      ? new Date(date).toLocaleDateString('en-IN', {
                                          day: 'numeric',
                                          month: 'short',
                                          year: 'numeric',
                                        })
                                      : 'Date pending'}
                                  </Text>
                                </View>
                                <View style={styles.testRight}>
                                  <Text style={styles.testScore}>
                                    {t.score}
                                    <Text style={styles.testMax}>/{t.max_score}</Text>
                                  </Text>
                                  <View style={[styles.testPct, { backgroundColor: tg.bg }]}>
                                    <Text style={[styles.testPctText, { color: tg.color }]}>
                                      {pct}%
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            );
                          })}
                      </View>
                    )}
                  </Animated.View>
                );
              })}
            </View>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

interface RankCardProps {
  label: string;
  hint: string;
  rank: number | null;
  total: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}
function RankCard({ label, hint, rank, total, color, icon }: RankCardProps) {
  const ordinal = (n: number | null) => {
    if (n == null) return '—';
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    switch (n % 10) {
      case 1: return `${n}st`;
      case 2: return `${n}nd`;
      case 3: return `${n}rd`;
      default: return `${n}th`;
    }
  };
  return (
    <View style={[styles.rankCard, { borderColor: `${color}30` }]}>
      <View style={[styles.rankIcon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.rankLabel}>{label.toUpperCase()}</Text>
      <View style={styles.rankRowInner}>
        <Text style={[styles.rankBig, { color }]}>{ordinal(rank)}</Text>
        <Text style={styles.rankTotal}>/ {total || '—'}</Text>
      </View>
      <Text style={styles.rankHint}>{hint}</Text>
    </View>
  );
}

interface ChartDatum {
  subject: string;
  studentPct: number;
  classPct: number | null;
}

function SubjectComparisonChart({ data }: { data: ChartDatum[] }) {
  // Each subject group needs ~62px of horizontal space (two 22px bars + gaps + label).
  // Scroll horizontally if there are too many to fit comfortably.
  const COL_WIDTH = 62;
  const Y_TICKS = [100, 75, 50, 25, 0];
  const CHART_HEIGHT = 180;

  const hasAnyClassAvg = data.some((d) => d.classPct != null);

  return (
    <View style={chartStyles.card}>
      <View style={chartStyles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={chartStyles.title}>Mastery Analytics</Text>
          <Text style={chartStyles.subtitle}>
            {hasAnyClassAvg
              ? 'Your score vs class average for each subject.'
              : 'Subject-wise average percentage.'}
          </Text>
        </View>
      </View>

      <View style={chartStyles.legendRow}>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendSwatch, { backgroundColor: Colors.primary }]} />
          <Text style={chartStyles.legendText}>You</Text>
        </View>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendSwatch, { backgroundColor: '#fbbf24' }]} />
          <Text style={chartStyles.legendText}>Class Avg</Text>
        </View>
      </View>

      <View style={chartStyles.chartRow}>
        {/* Y-axis labels */}
        <View style={[chartStyles.yAxis, { height: CHART_HEIGHT }]}>
          {Y_TICKS.map((t) => (
            <Text key={t} style={chartStyles.yLabel}>
              {t}
            </Text>
          ))}
        </View>

        {/* Plot area */}
        <View style={chartStyles.plotWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 12 }}
          >
            <View>
              <View style={[chartStyles.plotArea, { height: CHART_HEIGHT }]}>
                {/* Horizontal grid lines */}
                {Y_TICKS.map((t, i) => (
                  <View
                    key={t}
                    style={[
                      chartStyles.gridLine,
                      { top: (i * CHART_HEIGHT) / (Y_TICKS.length - 1) },
                    ]}
                  />
                ))}

                {/* Grouped bars */}
                <View style={chartStyles.barsRow}>
                  {data.map((d) => {
                    const studentColor =
                      d.studentPct >= 80
                        ? Colors.primary
                        : d.studentPct >= 50
                        ? `${Colors.primary}99`
                        : `${Colors.primary}66`;
                    const studentH = Math.max(2, (d.studentPct / 100) * CHART_HEIGHT);
                    const classH =
                      d.classPct != null
                        ? Math.max(2, (d.classPct / 100) * CHART_HEIGHT)
                        : 0;
                    return (
                      <View key={d.subject} style={[chartStyles.group, { width: COL_WIDTH }]}>
                        <View style={chartStyles.barPair}>
                          <View style={chartStyles.barCol}>
                            <Text style={chartStyles.barValue}>{d.studentPct}%</Text>
                            <View
                              style={[
                                chartStyles.bar,
                                { height: studentH, backgroundColor: studentColor },
                              ]}
                            />
                          </View>
                          <View style={chartStyles.barCol}>
                            <Text
                              style={[
                                chartStyles.barValue,
                                d.classPct == null && { color: Colors.textMuted },
                              ]}
                            >
                              {d.classPct != null ? `${d.classPct}%` : '—'}
                            </Text>
                            <View
                              style={[
                                chartStyles.bar,
                                {
                                  height: classH,
                                  backgroundColor:
                                    d.classPct != null ? '#fbbf24' : 'transparent',
                                  borderWidth: d.classPct == null ? 1 : 0,
                                  borderColor: Colors.border,
                                  borderStyle: 'dashed',
                                },
                              ]}
                            />
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Subject labels under the bars */}
              <View style={chartStyles.labelRow}>
                {data.map((d) => (
                  <View key={d.subject} style={[chartStyles.labelCell, { width: COL_WIDTH }]}>
                    <Text style={chartStyles.labelText} numberOfLines={1}>
                      {abbreviateSubject(d.subject, 6)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>

      {!hasAnyClassAvg && (
        <View style={chartStyles.notice}>
          <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
          <Text style={chartStyles.noticeText}>
            Class averages will appear once classmates have recorded marks.
          </Text>
        </View>
      )}
    </View>
  );
}

interface HighlightCardProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  pct: number;
}
function HighlightCard({ label, icon, color, title, pct }: HighlightCardProps) {
  return (
    <View style={[styles.highlightCard, { borderColor: `${color}30` }]}>
      <View style={[styles.highlightIcon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.highlightLabel}>{label}</Text>
        <Text style={styles.highlightTitle} numberOfLines={1}>{title}</Text>
        <Text style={[styles.highlightPct, { color }]}>{pct}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 18, gap: 16 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 28, fontWeight: '900', color: Colors.text, letterSpacing: -1 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginTop: 2 },
  // HERO
  heroWrap: { borderRadius: 26, overflow: 'hidden' },
  heroCard: {
    borderRadius: 26,
    padding: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  heroBgCircle1: {
    position: 'absolute',
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.10)',
    top: -90, right: -60,
  },
  heroBgCircle2: {
    position: 'absolute',
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -60, left: -40,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
  },
  heroPillText: { color: Colors.white, fontWeight: '900', fontSize: 11, letterSpacing: 0.4 },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  heroMain: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  heroPctBox: { flexDirection: 'row', alignItems: 'flex-end' },
  heroPct: { color: Colors.white, fontSize: 76, fontWeight: '900', letterSpacing: -3, lineHeight: 80 },
  heroPctSign: { color: 'rgba(255,255,255,0.85)', fontSize: 28, fontWeight: '900', marginLeft: 4, marginBottom: 12 },
  heroGradeBox: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    width: 76, height: 76,
    borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  heroGrade: { color: Colors.white, fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  heroGradeSub: { color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: -2 },

  // RANKS
  rankRow: { flexDirection: 'row', gap: 10 },
  rankCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  rankIcon: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  rankLabel: { fontSize: 9, fontWeight: '900', color: Colors.textMuted, letterSpacing: 0.6 },
  rankRowInner: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  rankBig: { fontSize: 26, fontWeight: '900', letterSpacing: -1 },
  rankTotal: { fontSize: 13, fontWeight: '800', color: Colors.textMuted },
  rankHint: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginTop: 2 },

  // HIGHLIGHT
  highlightRow: { flexDirection: 'row', gap: 10 },
  highlightCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  highlightIcon: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  highlightLabel: { fontSize: 9, fontWeight: '900', color: Colors.textMuted, letterSpacing: 0.6 },
  highlightTitle: { fontSize: 13, fontWeight: '900', color: Colors.text, marginTop: 1 },
  highlightPct: { fontSize: 16, fontWeight: '900', marginTop: 2, letterSpacing: -0.5 },

  // SECTION
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: Colors.text, letterSpacing: -0.3 },
  sectionSub: { fontSize: 11, fontWeight: '800', color: Colors.textMuted },

  // RECENT
  recentScroll: { gap: 10, paddingVertical: 4, paddingRight: 12 },
  recentCard: {
    width: 168,
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 4,
  },
  recentIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  recentSubject: { fontSize: 11, fontWeight: '900', color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  recentTest: { fontSize: 13, fontWeight: '800', color: Colors.text },
  recentScoreRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  recentPct: { fontSize: 22, fontWeight: '900', letterSpacing: -1 },
  recentGrade: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  recentGradeText: { fontSize: 11, fontWeight: '900' },
  recentScore: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginTop: 2 },

  // PILLS
  pillRow: { gap: 8, paddingVertical: 4, paddingRight: 12 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: 12, fontWeight: '800', color: Colors.text },
  pillTextActive: { color: Colors.white },

  // SUBJECT CARDS
  list: { gap: 12, marginTop: 4 },
  subjectCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    overflow: 'hidden',
  },
  subjectHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  subjectIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  subjectInfo: { flex: 1 },
  subjectName: { fontSize: 16, fontWeight: '900', color: Colors.text, letterSpacing: -0.3 },
  subjectMeta: { fontSize: 12, color: Colors.textMuted, fontWeight: '700', marginTop: 2 },

  subjectRight: { alignItems: 'flex-end', gap: 4 },
  subjectPct: { fontSize: 22, fontWeight: '900', letterSpacing: -0.8 },
  gradeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  gradeBadgeText: { fontSize: 11, fontWeight: '900' },

  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceElevated,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4 },

  // TESTS LIST
  testsBlock: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  testsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  testsHeaderText: {
    fontSize: 9, fontWeight: '900', color: Colors.textMuted, letterSpacing: 1,
  },
  testRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  testRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  testInfo: { flex: 1, marginRight: 12 },
  testName: { fontSize: 14, fontWeight: '800', color: Colors.text },
  testDate: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginTop: 2 },
  testRight: { alignItems: 'flex-end', gap: 4 },
  testScore: { fontSize: 16, fontWeight: '900', color: Colors.text },
  testMax: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  testPct: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  testPctText: { fontSize: 11, fontWeight: '900' },
});

const chartStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 16, fontWeight: '900', color: Colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginTop: 2 },

  legendRow: { flexDirection: 'row', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary, letterSpacing: 0.3 },

  chartRow: { flexDirection: 'row', gap: 8 },
  yAxis: {
    width: 28,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  yLabel: { fontSize: 9, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.4 },

  plotWrap: { flex: 1 },
  plotArea: {
    position: 'relative',
    paddingHorizontal: 4,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.divider,
    opacity: 0.6,
  },

  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: '100%',
  },
  group: { alignItems: 'center', justifyContent: 'flex-end' },
  barPair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: '100%',
  },
  barCol: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 22,
    height: '100%',
  },
  bar: {
    width: 22,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  barValue: {
    fontSize: 9,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 2,
  },

  labelRow: {
    flexDirection: 'row',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  labelCell: { alignItems: 'center' },
  labelText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
  },
  noticeText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, flex: 1 },
});
