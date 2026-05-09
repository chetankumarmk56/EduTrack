import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { attendanceService, type AttendanceRecord } from '../../services';
import { Colors } from '../../constants/Colors';
import { LoadingScreen, EmptyState, ErrorState } from '../../components/ui/Feedback';

type FilterKey = 'All' | 'Present' | 'Absent' | 'Late';

const STATUS_META: Record<
  'Present' | 'Absent' | 'Late',
  { color: string; icon: keyof typeof Ionicons.glyphMap; label: string }
> = {
  Present: { color: Colors.success, icon: 'checkmark-circle', label: 'Present' },
  Absent: { color: Colors.danger, icon: 'close-circle', label: 'Absent' },
  Late: { color: Colors.warning, icon: 'time', label: 'Late' },
};

function getRating(pct: number): { label: string; color: string; emoji: string } {
  if (pct >= 90) return { label: 'Excellent', color: Colors.success, emoji: '⭐' };
  if (pct >= 75) return { label: 'On Track', color: Colors.success, emoji: '✅' };
  if (pct >= 60) return { label: 'Needs Attention', color: Colors.warning, emoji: '⚠️' };
  return { label: 'Critical', color: Colors.danger, emoji: '🚨' };
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function AttendanceScreen() {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All');

  const studentId = user?.student_id || user?.id;

  const fetchAttendance = useCallback(async () => {
    if (!studentId) return;
    setError(null);
    try {
      const data = await attendanceService.getAttendance(studentId);
      setRecords(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAttendance();
  }, [fetchAttendance]);

  const stats = useMemo(() => {
    const present = records.filter((r) => r.status === 'Present').length;
    const absent = records.filter((r) => r.status === 'Absent').length;
    const late = records.filter((r) => r.status === 'Late').length;
    const total = records.length;
    const counted = present + late;
    const pct = total > 0 ? Math.round((counted / total) * 100) : 0;
    return { present, absent, late, total, pct };
  }, [records]);

  const sortedAll = useMemo(
    () =>
      records
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [records],
  );

  const streak = useMemo(() => {
    let count = 0;
    for (const r of sortedAll) {
      if (r.status === 'Present' || r.status === 'Late') count++;
      else break;
    }
    return count;
  }, [sortedAll]);

  // Last 7 days sparkline (oldest left → newest right)
  const last7 = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    sortedAll.forEach((r) => map.set(new Date(r.date).toDateString(), r));
    const days: { key: string; status?: AttendanceRecord['status']; isFuture: boolean }[] = [];
    const today = startOfDay(new Date());
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const r = map.get(d.toDateString());
      days.push({ key: d.toISOString(), status: r?.status, isFuture: false });
    }
    return days;
  }, [sortedAll]);

  // Last 30 days heatmap (week-aligned grid)
  const heatmap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    sortedAll.forEach((r) => map.set(new Date(r.date).toDateString(), r));
    const cells: { key: string; status?: AttendanceRecord['status']; date: Date }[] = [];
    const today = startOfDay(new Date());
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const r = map.get(d.toDateString());
      cells.push({ key: d.toISOString(), status: r?.status, date: d });
    }
    return cells;
  }, [sortedAll]);

  const filteredRecords = useMemo(
    () => (activeFilter === 'All' ? sortedAll : sortedAll.filter((r) => r.status === activeFilter)),
    [sortedAll, activeFilter],
  );

  // Group filtered records by Year-Month
  const grouped = useMemo(() => {
    const groups: { label: string; items: AttendanceRecord[] }[] = [];
    let lastKey = '';
    for (const r of filteredRecords) {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      if (key !== lastKey) {
        groups.push({ label, items: [] });
        lastKey = key;
      }
      groups[groups.length - 1].items.push(r);
    }
    return groups;
  }, [filteredRecords]);

  if (loading) return <LoadingScreen message="Loading attendance..." />;

  const rating = getRating(stats.pct);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        <Animated.View entering={FadeInUp.duration(400)} style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Attendance</Text>
            <Text style={styles.subtitle}>
              {stats.total} day{stats.total === 1 ? '' : 's'} tracked
            </Text>
          </View>
          {streak > 0 && (
            <View style={styles.streakChip}>
              <Text style={styles.streakEmoji}>🔥</Text>
              <Text style={styles.streakText}>{streak}-day streak</Text>
            </View>
          )}
        </Animated.View>

        {error && <ErrorState message={error} onRetry={fetchAttendance} />}

        {records.length > 0 ? (
          <>
            {/* HERO CARD */}
            <Animated.View entering={FadeInDown.delay(100)} style={styles.heroWrap}>
              <View style={[styles.heroCard, { backgroundColor: rating.color }]}>
                <View style={styles.heroBgCircle1} />
                <View style={styles.heroBgCircle2} />

                <View style={styles.heroTop}>
                  <View style={styles.heroPill}>
                    <Text style={styles.heroPillText}>{rating.emoji} {rating.label}</Text>
                  </View>
                  <Text style={styles.heroLabel}>OVERALL ATTENDANCE</Text>
                </View>

                <View style={styles.heroPctRow}>
                  <Text style={styles.heroPct}>{stats.pct}</Text>
                  <Text style={styles.heroPctSign}>%</Text>
                </View>

                {/* Progress bar */}
                <View style={styles.heroBarTrack}>
                  <View style={[styles.heroBarFill, { width: `${Math.max(2, stats.pct)}%` }]} />
                </View>
                <View style={styles.heroBarLegend}>
                  <Text style={styles.heroLegendText}>Goal · 75%</Text>
                  <Text style={styles.heroLegendText}>
                    {stats.present + stats.late}/{stats.total} attended
                  </Text>
                </View>

                {/* Sparkline last 7 days */}
                <View style={styles.sparkRow}>
                  {last7.map((d, i) => {
                    const meta = d.status ? STATUS_META[d.status as keyof typeof STATUS_META] : null;
                    const dot = meta ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.25)';
                    const dayLabel = new Date(d.key).toLocaleDateString('en-IN', { weekday: 'narrow' });
                    return (
                      <View key={d.key} style={styles.sparkCol}>
                        <View
                          style={[
                            styles.sparkDot,
                            {
                              backgroundColor: dot,
                              borderWidth: d.status === 'Absent' ? 2 : 0,
                              borderColor: 'rgba(255,255,255,0.6)',
                              opacity: d.status === 'Absent' ? 0.5 : 1,
                            },
                          ]}
                        />
                        <Text style={styles.sparkDayLabel}>{dayLabel}</Text>
                        {i === last7.length - 1 && <View style={styles.sparkTodayMark} />}
                      </View>
                    );
                  })}
                </View>
              </View>
            </Animated.View>

            {/* STAT FILTER TILES */}
            <View style={styles.statsRow}>
              {(['Present', 'Absent', 'Late'] as const).map((key, i) => {
                const meta = STATUS_META[key];
                const value = stats[key.toLowerCase() as 'present' | 'absent' | 'late'];
                const active = activeFilter === key;
                return (
                  <Animated.View key={key} entering={FadeInDown.delay(200 + i * 80)} style={{ flex: 1 }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setActiveFilter(active ? 'All' : key)}
                      style={[
                        styles.statTile,
                        active && {
                          backgroundColor: meta.color,
                          borderColor: meta.color,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.statIconBox,
                          { backgroundColor: active ? 'rgba(255,255,255,0.22)' : `${meta.color}15` },
                        ]}
                      >
                        <Ionicons
                          name={meta.icon}
                          size={18}
                          color={active ? Colors.white : meta.color}
                        />
                      </View>
                      <Text
                        style={[
                          styles.statTileVal,
                          { color: active ? Colors.white : Colors.text },
                        ]}
                      >
                        {value}
                      </Text>
                      <Text
                        style={[
                          styles.statTileLabel,
                          { color: active ? 'rgba(255,255,255,0.85)' : Colors.textMuted },
                        ]}
                      >
                        {meta.label}
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>

            {/* 30-DAY HEATMAP */}
            <Animated.View entering={FadeInDown.delay(380)} style={styles.heatCard}>
              <View style={styles.heatHeader}>
                <View>
                  <Text style={styles.sectionLabel}>LAST 30 DAYS</Text>
                  <Text style={styles.heatTitle}>Attendance Pattern</Text>
                </View>
                <View style={styles.legendRow}>
                  <Legend color={Colors.success} label="P" />
                  <Legend color={Colors.warning} label="L" />
                  <Legend color={Colors.danger} label="A" />
                  <Legend color={Colors.divider} label="—" />
                </View>
              </View>
              <View style={styles.heatGrid}>
                {heatmap.map((c) => {
                  const meta = c.status ? STATUS_META[c.status as keyof typeof STATUS_META] : null;
                  return (
                    <View
                      key={c.key}
                      style={[
                        styles.heatCell,
                        {
                          backgroundColor: meta ? meta.color : Colors.divider,
                          opacity: meta ? 1 : 0.6,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            </Animated.View>

            {/* TIMELINE FILTER + LIST */}
            <View style={styles.timelineHeader}>
              <Text style={styles.timelineTitle}>
                {activeFilter === 'All' ? 'All Records' : `${activeFilter} Days`}
              </Text>
              {activeFilter !== 'All' && (
                <TouchableOpacity onPress={() => setActiveFilter('All')} style={styles.clearChip}>
                  <Ionicons name="close" size={12} color={Colors.textSecondary} />
                  <Text style={styles.clearChipText}>Clear filter</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.list}>
              {grouped.length === 0 ? (
                <EmptyState
                  icon={<Ionicons name="filter-outline" size={36} color={Colors.textMuted} />}
                  title="No matching records"
                  subtitle={`There are no ${activeFilter.toLowerCase()} entries to show.`}
                />
              ) : (
                grouped.map((group) => (
                  <View key={group.label} style={{ gap: 10 }}>
                    <Text style={styles.monthHeader}>{group.label}</Text>
                    {group.items.map((record, idx) => {
                      const status = record.status as keyof typeof STATUS_META;
                      const meta = STATUS_META[status] ?? STATUS_META.Present;
                      const date = new Date(record.date);
                      return (
                        <Animated.View
                          key={record.id}
                          entering={FadeInDown.delay(idx * 35)}
                          layout={LinearTransition.springify().damping(18)}
                        >
                          <View style={[styles.recordCard, { borderLeftColor: meta.color }]}>
                            <View style={[styles.dateBox, { backgroundColor: `${meta.color}10` }]}>
                              <Text style={[styles.dateDay, { color: meta.color }]}>
                                {date.getDate()}
                              </Text>
                              <Text style={[styles.dateMonth, { color: meta.color }]}>
                                {date
                                  .toLocaleDateString(undefined, { month: 'short' })
                                  .toUpperCase()}
                              </Text>
                            </View>
                            <View style={styles.recordBody}>
                              <Text style={styles.recordWeekday}>
                                {date.toLocaleDateString('en-IN', { weekday: 'long' })}
                              </Text>
                              <Text style={styles.recordSub}>
                                {date.toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </Text>
                            </View>
                            <View style={[styles.statusPill, { backgroundColor: `${meta.color}15` }]}>
                              <Ionicons name={meta.icon} size={13} color={meta.color} />
                              <Text style={[styles.statusPillText, { color: meta.color }]}>
                                {meta.label}
                              </Text>
                            </View>
                          </View>
                        </Animated.View>
                      );
                    })}
                  </View>
                ))
              )}
            </View>
          </>
        ) : (
          !error && (
            <View style={{ marginTop: 40 }}>
              <EmptyState
                icon={<Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />}
                title="No attendance recorded yet"
                subtitle="Records will appear here once your teacher marks attendance."
              />
            </View>
          )
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 18, gap: 18 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '900', color: Colors.text, letterSpacing: -1 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginTop: 2 },

  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  streakEmoji: { fontSize: 14 },
  streakText: { fontSize: 12, fontWeight: '900', color: '#c2410c' },

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
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -90,
    right: -60,
  },
  heroBgCircle2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -60,
    left: -40,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroPill: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  heroPillText: { color: Colors.white, fontWeight: '900', fontSize: 11, letterSpacing: 0.4 },
  heroLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  heroPctRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 14, marginBottom: 6 },
  heroPct: { color: Colors.white, fontSize: 84, fontWeight: '900', letterSpacing: -4, lineHeight: 84 },
  heroPctSign: { color: 'rgba(255,255,255,0.85)', fontSize: 32, fontWeight: '900', marginLeft: 4, marginBottom: 12 },

  heroBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
    marginTop: 4,
  },
  heroBarFill: { height: 8, borderRadius: 4, backgroundColor: Colors.white },
  heroBarLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 14,
  },
  heroLegendText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700' },

  sparkRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  sparkCol: { alignItems: 'center', gap: 6, flex: 1 },
  sparkDot: { width: 14, height: 14, borderRadius: 7 },
  sparkDayLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },
  sparkTodayMark: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.white,
    marginTop: -3,
  },

  // STAT TILES
  statsRow: { flexDirection: 'row', gap: 10 },
  statTile: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  statIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTileVal: { fontSize: 22, fontWeight: '900', letterSpacing: -1 },
  statTileLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },

  // HEATMAP
  heatCard: {
    backgroundColor: Colors.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  heatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  sectionLabel: { fontSize: 10, fontWeight: '900', color: Colors.textMuted, letterSpacing: 1 },
  heatTitle: { fontSize: 16, fontWeight: '900', color: Colors.text, marginTop: 2 },
  legendRow: { flexDirection: 'row', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendLabel: { fontSize: 10, fontWeight: '900', color: Colors.textMuted },
  heatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heatCell: {
    width: 26,
    height: 26,
    borderRadius: 6,
  },

  // TIMELINE
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timelineTitle: { fontSize: 16, fontWeight: '900', color: Colors.text },
  clearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  clearChipText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },

  list: { gap: 18 },
  monthHeader: {
    fontSize: 11,
    fontWeight: '900',
    color: Colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    gap: 12,
  },
  dateBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { fontSize: 20, fontWeight: '900', lineHeight: 22 },
  dateMonth: { fontSize: 9, fontWeight: '900', marginTop: 1, letterSpacing: 0.6 },

  recordBody: { flex: 1 },
  recordWeekday: { fontSize: 15, fontWeight: '800', color: Colors.text },
  recordSub: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusPillText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
});
