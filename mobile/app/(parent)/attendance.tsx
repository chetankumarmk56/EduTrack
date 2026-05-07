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
import Animated, { FadeInDown, FadeInUp, ZoomIn, LinearTransition } from 'react-native-reanimated';
import { useAuth } from '../../hooks/useAuth';
import { attendanceService, type AttendanceRecord } from '../../services';
import { Colors } from '../../constants/Colors';
import { Card, SectionHeader } from '../../components/ui/Card';
import { LoadingScreen, EmptyState, ErrorState } from '../../components/ui/Feedback';

const { width } = Dimensions.get('window');

export default function AttendanceScreen() {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'All' | 'Present' | 'Absent' | 'Late'>('All');

  const studentId = user?.student_id || user?.id;

  const fetchAttendance = useCallback(async () => {
    if (!studentId) return;
    setError(null);
    try {
      const data = await attendanceService.getAttendance(studentId);
      setRecords(data);
    } catch (e: any) {
      setError(e.message || 'Failed to sync attendance logs');
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
    const present = records.filter(r => r.status === 'Present').length;
    const absent = records.filter(r => r.status === 'Absent').length;
    const late = records.filter(r => r.status === 'Late').length;
    const total = records.length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    return { present, absent, late, total, pct };
  }, [records]);

  const filteredRecords = useMemo(() => {
    let list = records.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (activeFilter !== 'All') {
      list = list.filter(r => r.status === activeFilter);
    }
    return list;
  }, [records, activeFilter]);

  if (loading) return <LoadingScreen message="Analyzing presence logs..." />;

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
          <Text style={styles.title}>Presence Monitor</Text>
          <Text style={styles.subtitle}>Real-time Engagement Tracking</Text>
        </Animated.View>

        {error && <ErrorState message={error} onRetry={fetchAttendance} />}

        {/* Hero Ring Visualizer - Click to Reset Filter */}
        {records.length > 0 && (
          <Animated.View entering={ZoomIn.delay(200)} style={styles.heroRingContainer}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setActiveFilter('All')}
              style={[
                styles.heroRing,
                { borderColor: activeFilter === 'All' ? Colors.primary : `${Colors.primary}20` },
                activeFilter === 'All' && styles.activeHeroRing
              ]}
            >
              <View style={styles.ringContent}>
                <Text style={[styles.ringPct, { color: Colors.primary }]}>{stats.pct}%</Text>
                <Text style={styles.ringLabel}>{activeFilter === 'All' ? 'Presence' : 'Reset View'}</Text>
              </View>
              {/* Neon Ring Glow Effect */}
              <View style={[styles.ringGlow, { borderColor: Colors.primary, opacity: activeFilter === 'All' ? 0.3 : 0.1 }]} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Stats Grid - Now Interactive Filters */}
        <View style={styles.statsGrid}>
          {[
            { label: 'Present', val: stats.present, color: Colors.success, icon: '🟢', type: 'Present' },
            { label: 'Absent', val: stats.absent, color: Colors.danger, icon: '🔴', type: 'Absent' },
            { label: 'Late', val: stats.late, color: Colors.warning, icon: '🟡', type: 'Late' },
          ].map((item, i) => (
            <TouchableOpacity
              key={item.label}
              activeOpacity={0.7}
              onPress={() => setActiveFilter(item.type as any)}
              style={{ flex: 1 }}
            >
              <Animated.View
                entering={FadeInDown.delay(300 + i * 100)}
                style={[
                  styles.statBox,
                  activeFilter === item.type && { borderColor: item.color, backgroundColor: `${item.color}05`, borderWidth: 2 }
                ]}
              >
                <Text style={styles.statIcon}>{item.icon}</Text>
                <Text style={[styles.statVal, activeFilter === item.type && { color: item.color }]}>{item.val}</Text>
                <Text style={styles.statLabel}>{item.label}</Text>
                {activeFilter === item.type && (
                  <View style={[styles.activeDot, { backgroundColor: item.color }]} />
                )}
              </Animated.View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Activity Feed */}
        <SectionHeader title="Activity Timeline" subtitle="Verified session logs" />
        <View style={styles.historyList}>
          {filteredRecords.length > 0 ? (
            filteredRecords.map((record, index) => {
              const isPresent = record.status === 'Present';
              const isLate = record.status === 'Late';
              const color = isPresent ? Colors.success : isLate ? Colors.warning : Colors.danger;

              return (
                <Animated.View
                  key={record.id}
                  entering={FadeInDown.delay(index * 50)}
                  layout={LinearTransition.springify()}
                >
                  <Card index={index} style={styles.historyCard}>
                    <View style={styles.historyRow}>
                      <View style={[styles.dateBox, { backgroundColor: `${color}10` }]}>
                        <Text style={[styles.dateDay, { color }]}>
                          {new Date(record.date).getDate()}
                        </Text>
                        <Text style={[styles.dateMonth, { color }]}>
                          {new Date(record.date).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.historyInfo}>
                        <Text style={styles.historyTitle}>
                          {new Date(record.date).toLocaleDateString('en-IN', { weekday: 'long' })}
                        </Text>
                        <Text style={styles.historySub}>Standard Session</Text>
                      </View>

                      <View style={[styles.statusBadge, { backgroundColor: `${color}15`, borderColor: `${color}30` }]}>
                        <Text style={[styles.statusText, { color }]}>{record.status}</Text>
                      </View>
                    </View>
                  </Card>
                </Animated.View>
              );
            })
          ) : !error && (
            <EmptyState
              icon={<Text style={{ fontSize: 50 }}>📅</Text>}
              title="History empty"
              subtitle="Your engagement logs will appear here once verified."
            />
          )}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, gap: 24 },

  header: { marginBottom: 4 },
  title: { fontSize: 32, fontWeight: '900', color: Colors.text, letterSpacing: -1.5 },
  subtitle: { fontSize: 16, color: Colors.textSecondary, fontWeight: '600', marginTop: 4 },

  heroRingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  heroRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  ringContent: {
    alignItems: 'center',
    zIndex: 2,
  },
  ringPct: { fontSize: 56, fontWeight: '900', letterSpacing: -2 },
  ringLabel: { fontSize: 14, color: Colors.textSecondary, fontWeight: '800', textTransform: 'uppercase', marginTop: -5 },
  ringGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 4,
    opacity: 0.3,
  },

  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 28,
    padding: 18,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  statIcon: { fontSize: 20, marginBottom: 4 },
  statVal: { fontSize: 24, fontWeight: '900', color: Colors.text },
  statLabel: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase' },
  activeDot: { position: 'absolute', top: 10, right: 10, width: 6, height: 6, borderRadius: 3 },
  activeHeroRing: { shadowOpacity: 0.25, shadowRadius: 30, transform: [{ scale: 1.02 }] },

  historyList: { gap: 14 },
  historyCard: { padding: 0 },
  historyRow: { flexDirection: 'row', alignItems: 'center', padding: 18 },
  dateBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { fontSize: 22, fontWeight: '900' },
  dateMonth: { fontSize: 11, fontWeight: '900', marginTop: -2 },

  historyInfo: { flex: 1, marginLeft: 18 },
  historyTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  historySub: { fontSize: 13, color: Colors.textMuted, marginTop: 3, fontWeight: '600' },

  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  statusText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
});
