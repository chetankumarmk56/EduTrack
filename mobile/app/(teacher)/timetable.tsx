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
import type { TeacherTimetable, ClassTimetable, SchedulePeriod } from '@/shared/types';
import {
  DAY_LABELS,
  DAY_FULL,
  todayIndex,
  formatTime,
  periodIconName,
  sortPeriods,
  buildSlotMap,
} from '@/features/timetable/utils';

type TimetableView = 'mine' | 'class';

export default function TeacherTimetableScreen() {
  const [data, setData] = useState<TeacherTimetable | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(todayIndex());

  // View toggle: own slots vs full class timetable
  const [view, setView] = useState<TimetableView>('mine');
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [classData, setClassData] = useState<ClassTimetable | null>(null);
  const [classLoading, setClassLoading] = useState(false);

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

  // Unique classes the teacher is assigned to (derived from their own slots).
  const assignedClasses = useMemo(() => {
    const map = new Map<number, { id: number; display_name: string }>();
    (data?.slots ?? []).forEach((s) => {
      if (!s.school_class_id || map.has(s.school_class_id)) return;
      map.set(s.school_class_id, {
        id: s.school_class_id,
        display_name: s.school_class?.display_name || `Class ${s.school_class_id}`,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [data]);

  // Auto-select the first assigned class when switching to class view.
  useEffect(() => {
    if (view === 'class' && selectedClassId == null && assignedClasses.length > 0) {
      setSelectedClassId(assignedClasses[0].id);
    }
  }, [view, selectedClassId, assignedClasses]);

  // Fetch the full class timetable when selection changes.
  useEffect(() => {
    if (view !== 'class' || selectedClassId == null) return;
    setClassLoading(true);
    setClassData(null);
    (async () => {
      try {
        const ct = await timetableService.getClassTimetable(selectedClassId);
        setClassData(ct);
      } catch (err) {
        console.warn('[timetable] class fetch failed', err);
      } finally {
        setClassLoading(false);
      }
    })();
  }, [view, selectedClassId]);

  // Active source: own slots or selected class's slots.
  const activePeriods = view === 'class' ? (classData?.periods ?? []) : (data?.periods ?? []);
  const activeSlots = view === 'class' ? (classData?.slots ?? []) : (data?.slots ?? []);

  const sortedPeriods = useMemo<SchedulePeriod[]>(
    () => sortPeriods(activePeriods),
    [activePeriods],
  );
  const slotByCoord = useMemo(() => buildSlotMap(activeSlots), [activeSlots]);

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
            <Text style={styles.title}>{view === 'mine' ? 'My Schedule' : 'Class Timetable'}</Text>
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

        {/* View toggle */}
        {data && data.periods.length > 0 && (
          <Animated.View entering={FadeInDown.delay(30)} style={styles.viewToggleRow}>
            <TouchableOpacity
              style={[styles.viewToggleBtn, view === 'mine' && styles.viewToggleBtnActive]}
              onPress={() => setView('mine')}
              activeOpacity={0.85}
            >
              <Ionicons name="person-circle-outline" size={15} color={view === 'mine' ? Colors.white : Colors.textMuted} />
              <Text style={[styles.viewToggleText, view === 'mine' && styles.viewToggleTextActive]}>
                My Schedule
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewToggleBtn, view === 'class' && styles.viewToggleBtnActive]}
              onPress={() => setView('class')}
              activeOpacity={0.85}
            >
              <Ionicons name="grid-outline" size={15} color={view === 'class' ? Colors.white : Colors.textMuted} />
              <Text style={[styles.viewToggleText, view === 'class' && styles.viewToggleTextActive]}>
                Class Timetable
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Class picker (class view only) */}
        {view === 'class' && data && assignedClasses.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classPickerRow}>
            {assignedClasses.map((c) => {
              const active = c.id === selectedClassId;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setSelectedClassId(c.id)}
                  activeOpacity={0.78}
                  style={[styles.classPickerChip, active && styles.classPickerChipActive]}
                >
                  <Text style={[styles.classPickerText, active && styles.classPickerTextActive]}>
                    {c.display_name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {view === 'class' && assignedClasses.length === 0 && data && (
          <View style={{ marginTop: 24 }}>
            <EmptyState
              icon={<Ionicons name="people-outline" size={40} color={Colors.textMuted} />}
              title="No classes assigned"
              subtitle="Ask your administrator to assign you to a class."
            />
          </View>
        )}

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
        ) : view === 'class' && assignedClasses.length > 0 && (classLoading || !classData) ? (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: Colors.textMuted, fontWeight: '700' }}>
              {classLoading ? 'Loading class timetable...' : ''}
            </Text>
          </View>
        ) : view === 'class' && classData && classData.periods.length === 0 ? (
          <View style={{ marginTop: 24 }}>
            <EmptyState
              icon={<Ionicons name="time-outline" size={48} color={Colors.textMuted} />}
              title="No timetable published for this class"
              subtitle="Once your administrator publishes it, you'll see it here."
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
                // In class view, highlight slots taught by the current teacher.
                const isMine =
                  view === 'class' && !!slot && !!data && slot.teacher_id === data.teacher_id;

                return (
                  <Animated.View
                    key={period.id}
                    entering={FadeInDown.delay(idx * 30)}
                    style={[
                      styles.slotCard,
                      hasClass && styles.slotCardActive,
                      isMine && styles.slotCardMine,
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
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={[styles.slotSubject, isMine && { color: Colors.primary }]} numberOfLines={1}>
                              {slot!.subject!.name}
                            </Text>
                            {isMine && (
                              <View style={styles.youBadge}>
                                <Text style={styles.youBadgeText}>YOU</Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.slotMetaRow}>
                            {view === 'class' && slot!.teacher?.name && !isMine && (
                              <View style={styles.metaItem}>
                                <Ionicons name="person-outline" size={12} color={Colors.textMuted} />
                                <Text style={styles.metaText}>{slot!.teacher.name}</Text>
                              </View>
                            )}
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

  // View toggle
  viewToggleRow: {
    flexDirection: 'row',
    padding: 4,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  viewToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  viewToggleBtnActive: { backgroundColor: Colors.primary },
  viewToggleText: { fontSize: 12, fontWeight: '900', color: Colors.textMuted, letterSpacing: 0.3 },
  viewToggleTextActive: { color: Colors.white },

  // Class picker chips
  classPickerRow: { gap: 8, paddingRight: 12 },
  classPickerChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  classPickerChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  classPickerText: { fontSize: 12, fontWeight: '900', color: Colors.textMuted, letterSpacing: 0.5 },
  classPickerTextActive: { color: Colors.white },

  // "You" highlight for teacher's own slots in class view
  slotCardMine: {
    backgroundColor: `${Colors.primary}10`,
    borderColor: `${Colors.primary}40`,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  youBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  youBadgeText: { fontSize: 9, fontWeight: '900', color: Colors.white, letterSpacing: 0.8 },
});
