import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/shared/constants/Colors';
import { LoadingScreen } from '@/shared/components/ui/Feedback';
import { useDashboard } from '../../hooks';
import {
  getAttendancePct,
  getSubjectPerformance,
  getTimeGreeting,
} from '@/shared/utils/formatters';
import type { SubjectComparison } from '@/features/dashboard/hooks/useDashboard';

export default function DashboardScreen() {
  const router = useRouter();
  const {
    user,
    profile,
    marks,
    attendance,
    fees,
    announcements,
    subjectComparisons,
    loading,
    refreshing,
    onRefresh,
  } = useDashboard();

  if (loading) return <LoadingScreen message="Loading your dashboard..." />;

  const attendancePct = getAttendancePct(attendance);
  const subjectPerf = getSubjectPerformance(marks);
  const overallPct =
    subjectPerf.length > 0
      ? Math.round(subjectPerf.reduce((a, b) => a + b.pct, 0) / subjectPerf.length)
      : 0;

  const totalDue = fees.reduce((sum, f) => sum + (f.due_amount || 0), 0);
  const overdueCount = fees.filter((f) => (f.overdue_days || 0) > 0).length;
  const unreadAnnouncements = announcements.filter((a) => !a.is_read).length;
  const latestAnnouncement = announcements[0];

  const displayName = profile?.name || user?.name || 'there';
  const gradeInfo =
    profile?.school_class?.grade?.level || profile?.class_level
      ? `Grade ${profile?.school_class?.grade?.level || profile?.class_level}${profile?.school_class?.section?.name || profile?.section || ''}`
      : null;

  const perfColor =
    overallPct >= 75 ? Colors.success : overallPct >= 50 ? Colors.warning : Colors.danger;
  const attColor =
    attendancePct >= 75 ? Colors.success : attendancePct >= 60 ? Colors.warning : Colors.danger;
  const feeColor = totalDue > 0 ? Colors.danger : Colors.success;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Greeting */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <Text style={styles.greeting}>Good {getTimeGreeting()},</Text>
          <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
          {gradeInfo && (
            <View style={styles.badge}>
              <View style={styles.dot} />
              <Text style={styles.badgeText}>{gradeInfo}</Text>
            </View>
          )}
        </Animated.View>

        {/* 4 clickable summary cards */}
        <View style={styles.grid}>
          <SummaryCard
            delay={100}
            icon="trending-up"
            label="Overall Performance"
            value={subjectPerf.length > 0 ? `${overallPct}%` : '—'}
            sub={
              subjectPerf.length > 0
                ? `${marks.length} evaluation${marks.length === 1 ? '' : 's'}`
                : 'No marks yet'
            }
            color={perfColor}
            onPress={() => router.push('/(parent)/marks')}
          />
          <SummaryCard
            delay={200}
            icon="calendar"
            label="Attendance"
            value={attendance.length > 0 ? `${attendancePct}%` : '—'}
            sub={
              attendance.length > 0
                ? `${attendance.length} day${attendance.length === 1 ? '' : 's'} tracked`
                : 'No records'
            }
            color={attColor}
            onPress={() => router.push('/(parent)/attendance')}
          />
          <SummaryCard
            delay={300}
            icon="megaphone"
            label="Announcements"
            value={String(announcements.length)}
            sub={
              unreadAnnouncements > 0
                ? `${unreadAnnouncements} unread`
                : latestAnnouncement
                ? 'All caught up'
                : 'Nothing yet'
            }
            color={Colors.primary}
            onPress={() => router.push('/(parent)/announcements')}
          />
          <SummaryCard
            delay={400}
            icon="card"
            label="Fees Due"
            value={totalDue > 0 ? `₹${totalDue.toLocaleString()}` : 'Paid'}
            sub={
              totalDue > 0
                ? overdueCount > 0
                  ? `${overdueCount} overdue`
                  : 'Pay now'
                : 'No dues'
            }
            color={feeColor}
            onPress={() => router.push('/(parent)/fees')}
          />
        </View>

        {/* Subject vs Class Average chart */}
        {subjectComparisons.length > 0 && (
          <Animated.View entering={FadeInDown.delay(500)}>
            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.chartCard}
              onPress={() => router.push('/(parent)/marks')}
            >
              <View style={styles.chartHeader}>
                <View style={styles.chartTitleRow}>
                  <Ionicons name="bar-chart" size={16} color={Colors.primary} />
                  <Text style={styles.chartTitle}>You vs Class Average</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </View>

              {/* Legend */}
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
                  <Text style={styles.legendText}>You</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.border }]} />
                  <Text style={styles.legendText}>Class Avg</Text>
                </View>
              </View>

              {subjectComparisons.slice(0, 5).map((item) => (
                <ComparisonRow key={item.subject} item={item} />
              ))}
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

interface SummaryCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sub: string;
  color: string;
  onPress: () => void;
  delay?: number;
}

function SummaryCard({ icon, label, value, sub, color, onPress, delay = 0 }: SummaryCardProps) {
  return (
    <Animated.View entering={FadeInDown.delay(delay)} style={styles.cardWrap}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.card}>
        <View style={[styles.iconBox, { backgroundColor: `${color}18` }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <Text style={styles.cardLabel}>{label}</Text>
        <Text style={[styles.cardValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text style={styles.cardSub} numberOfLines={1}>{sub}</Text>
        <View style={styles.cardArrow}>
          <Ionicons name="arrow-forward" size={14} color={Colors.textMuted} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function ComparisonRow({ item }: { item: SubjectComparison }) {
  const studentColor =
    item.studentPct >= 75 ? Colors.success : item.studentPct >= 50 ? Colors.warning : Colors.danger;

  return (
    <View style={styles.compRow}>
      <Text style={styles.compSubject} numberOfLines={1}>{item.subject}</Text>
      <View style={styles.compBars}>
        {/* Student bar */}
        <View style={styles.compBarGroup}>
          <View style={styles.compTrack}>
            <View
              style={[
                styles.compBar,
                { width: `${Math.min(100, item.studentPct)}%`, backgroundColor: studentColor },
              ]}
            />
          </View>
          <Text style={[styles.compPct, { color: studentColor }]}>{item.studentPct}%</Text>
        </View>
        {/* Class avg bar */}
        <View style={styles.compBarGroup}>
          <View style={styles.compTrack}>
            <View
              style={[
                styles.compBar,
                { width: `${Math.min(100, item.classAvgPct)}%`, backgroundColor: item.classAvgPct > 0 ? '#94a3b8' : 'transparent' },
              ]}
            />
          </View>
          <Text style={[styles.compPct, { color: Colors.textMuted }]}>
            {item.classAvgPct > 0 ? `${item.classAvgPct}%` : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 18, gap: 16 },

  header: { marginBottom: 4 },
  greeting: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  userName: { fontSize: 28, fontWeight: '900', color: Colors.text, letterSpacing: -1, marginTop: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.primary}15`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary, marginRight: 6 },
  badgeText: { fontSize: 11, color: Colors.primary, fontWeight: '800', textTransform: 'uppercase' },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cardWrap: {
    width: '48%',
    flexGrow: 1,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 140,
    gap: 6,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValue: { fontSize: 24, fontWeight: '900', letterSpacing: -0.8 },
  cardSub: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  cardArrow: {
    position: 'absolute',
    top: 16,
    right: 16,
    opacity: 0.6,
  },

  // Comparison chart
  chartCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },

  compRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  compSubject: {
    width: 82,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  compBars: { flex: 1, gap: 4 },
  compBarGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compTrack: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  compBar: { height: 7, borderRadius: 4 },
  compPct: { width: 36, fontSize: 11, fontWeight: '800', textAlign: 'right' },
});
