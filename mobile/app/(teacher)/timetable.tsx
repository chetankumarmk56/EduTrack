import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/shared/constants/Colors';
import { LoadingScreen, ErrorState, EmptyState } from '@/shared/components/ui/Feedback';
import { timetableService } from '@/features/timetable/services/timetableService';
import type { TeacherTimetable, SchedulePeriod } from '@/shared/types';
import {
  DAY_LABELS,
  DAY_FULL,
  todayIndex,
  formatTime,
  periodIconName,
  sortPeriods,
  buildSlotMap,
} from '@/features/timetable/utils';

export default function TeacherTimetableScreen() {
  const [data, setData] = useState<TeacherTimetable | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(todayIndex());

  const today = todayIndex();

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const tt = await timetableService.getMyTimetable();
      setData(tt);
    } catch (err: any) {
      setError(err?.message || 'Failed to load timetable');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const sortedPeriods = useMemo<SchedulePeriod[]>(
    () => sortPeriods(data?.periods ?? []),
    [data],
  );
  const slotByCoord = useMemo(() => buildSlotMap(data?.slots ?? []), [data]);

  const dayItems = useMemo(() => {
    return sortedPeriods.map((period) => ({
      period,
      slot: slotByCoord.get(`${period.id}:${selectedDay}`),
    }));
  }, [sortedPeriods, slotByCoord, selectedDay]);

  const teachingClassesToday = useMemo(
    () =>
      dayItems.filter(
        (x) => x.period.period_type === 'class_period' && x.slot?.subject,
      ).length,
    [dayItems],
  );

  if (loading) return <LoadingScreen message="Loading timetable..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
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
        {/* Header */}
        <Animated.View entering={FadeInUp.duration(400)} style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>My Schedule</Text>
            <Text style={styles.subtitle}>
              {selectedDay === today ? `Today · ${DAY_FULL[today]}` : DAY_FULL[selectedDay]}
              {' · '}
              {teachingClassesToday}{' '}
              {teachingClassesToday === 1 ? 'class' : 'classes'}
            </Text>
          </View>
          <View style={styles.todayChip}>
            <Ionicons name="calendar" size={14} color={Colors.primary} />
            <Text style={styles.todayChipText}>{DAY_LABELS[today]}</Text>
          </View>
        </Animated.View>

        {error ? (
          <ErrorState message={error} onRetry={fetchData} />
        ) : !data || data.periods.length === 0 ? (
          <View style={{ marginTop: 40 }}>
            <EmptyState
              icon={
                <Ionicons name="time-outline" size={48} color={Colors.textMuted} />
              }
              title="No timetable available yet"
              subtitle="Your administrator hasn't published the schedule."
            />
          </View>
        ) : (
          <>
            {/* Day tabs */}
            <Animated.View entering={FadeInDown.delay(60)}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dayRow}
              >
                {DAY_LABELS.map((label, idx) => {
                  const active = idx === selectedDay;
                  const isToday = idx === today;
                  return (
                    <TouchableOpacity
                      key={label}
                      activeOpacity={0.85}
                      onPress={() => setSelectedDay(idx)}
                      style={[
                        styles.dayTab,
                        active && styles.dayTabActive,
                        !active && isToday && styles.dayTabToday,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayTabLabel,
                          active && styles.dayTabLabelActive,
                          !active && isToday && { color: Colors.primary },
                        ]}
                      >
                        {label}
                      </Text>
                      {isToday && (
                        <View
                          style={[
                            styles.todayDot,
                            active && { backgroundColor: Colors.white },
                          ]}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Animated.View>

            {/* Period list for selected day */}
            <View style={styles.list}>
              {dayItems.map(({ period, slot }, idx) => {
                if (period.period_type !== 'class_period') {
                  return (
                    <Animated.View
                      key={period.id}
                      entering={FadeInDown.delay(idx * 30)}
                      style={styles.breakRow}
                    >
                      <View style={styles.breakIconBox}>
                        <Ionicons
                          name={periodIconName(period.period_type)}
                          size={16}
                          color={Colors.warning}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.breakName}>{period.name}</Text>
                        <Text style={styles.breakTime}>
                          {formatTime(period.start_time)} – {formatTime(period.end_time)}
                        </Text>
                      </View>
                    </Animated.View>
                  );
                }

                const hasClass = !!slot?.subject;
                const room =
                  slot?.school_class?.room_number || slot?.room || null;

                return (
                  <Animated.View
                    key={period.id}
                    entering={FadeInDown.delay(idx * 30)}
                    style={[
                      styles.slotCard,
                      hasClass && styles.slotCardActive,
                    ]}
                  >
                    <View style={styles.timeCol}>
                      <Text style={styles.timeStart}>
                        {formatTime(period.start_time)}
                      </Text>
                      <View style={styles.timeBar} />
                      <Text style={styles.timeEnd}>
                        {formatTime(period.end_time)}
                      </Text>
                    </View>

                    <View style={styles.slotBody}>
                      {hasClass ? (
                        <>
                          <Text style={styles.slotSubject} numberOfLines={1}>
                            {slot!.subject!.name}
                          </Text>
                          <View style={styles.slotMetaRow}>
                            <View style={styles.metaItem}>
                              <Ionicons
                                name="people-outline"
                                size={12}
                                color={Colors.textMuted}
                              />
                              <Text style={styles.metaText}>
                                {slot!.school_class?.display_name ||
                                  `Class ${slot!.school_class_id}`}
                              </Text>
                            </View>
                            {room && (
                              <View style={styles.metaItem}>
                                <Ionicons
                                  name="location-outline"
                                  size={12}
                                  color={Colors.textMuted}
                                />
                                <Text style={styles.metaText}>Rm {room}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.slotPeriodLabel}>
                            {period.name}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.slotFree}>Free Period</Text>
                          <Text style={styles.slotPeriodLabel}>
                            {period.name}
                          </Text>
                        </>
                      )}
                    </View>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 18, gap: 18 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  todayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${Colors.primary}10`,
    borderColor: `${Colors.primary}30`,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  todayChipText: { fontSize: 12, fontWeight: '900', color: Colors.primary },

  // Day tabs
  dayRow: { gap: 8, paddingRight: 12 },
  dayTab: {
    width: 60,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: 4,
  },
  dayTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayTabToday: {
    borderColor: Colors.primary,
  },
  dayTabLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 0.5,
  },
  dayTabLabelActive: { color: Colors.white },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.primary,
  },

  // Period list
  list: { gap: 10 },

  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: `${Colors.warning}10`,
    borderWidth: 1,
    borderColor: `${Colors.warning}25`,
  },
  breakIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: `${Colors.warning}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakName: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  breakTime: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },

  slotCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  slotCardActive: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  timeCol: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  timeStart: { fontSize: 13, fontWeight: '900', color: Colors.text },
  timeEnd: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  timeBar: { width: 2, height: 16, backgroundColor: Colors.border, borderRadius: 1 },

  slotBody: { flex: 1, gap: 6, justifyContent: 'center' },
  slotSubject: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  slotMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  slotPeriodLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  slotFree: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});
