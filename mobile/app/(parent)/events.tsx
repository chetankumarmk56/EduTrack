import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Text,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/shared/constants/Colors';
import { LoadingScreen, ErrorState, EmptyState } from '@/shared/components/ui/Feedback';
import { eventsService, type SchoolEvent } from '../../services';

type FilterKey = 'all' | 'holiday' | 'working';
type Scope = 'upcoming' | 'all' | 'past';

const HOLIDAY_META = {
  color: Colors.success,
  bg: '#f0fdf4',
  icon: 'sunny' as keyof typeof Ionicons.glyphMap,
  label: 'Non-Teaching',
};

const TYPE_META: Record<string, {
  color: string;
  bg: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}> = {
  exam:     { color: Colors.danger,  bg: '#fef2f2', icon: 'document-text', label: 'Exam' },
  meeting:  { color: Colors.primary, bg: '#eff6ff', icon: 'people',        label: 'Meeting' },
  sports:   { color: Colors.warning, bg: '#fffbeb', icon: 'football',      label: 'Sports' },
  activity: { color: Colors.info,    bg: '#eff6ff', icon: 'sparkles',      label: 'Activity' },
};

const META_FALLBACK = {
  color: Colors.textMuted, bg: Colors.surface,
  icon: 'calendar' as keyof typeof Ionicons.glyphMap, label: 'Event',
};

function metaFor(event: SchoolEvent) {
  if (event.is_holiday) return HOLIDAY_META;
  const type = (event.event_type || event.type || '').toString().toLowerCase();
  if (!type) return META_FALLBACK;
  if (TYPE_META[type]) return TYPE_META[type];
  if (type.includes('exam')) return TYPE_META.exam;
  if (type.includes('meeting')) return TYPE_META.meeting;
  if (type.includes('sport')) return TYPE_META.sports;
  if (type.includes('activity')) return TYPE_META.activity;
  return { ...META_FALLBACK, label: event.event_type || event.type || 'Event' };
}

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

function daysBetween(a: Date, b: Date) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}

function relativeLabel(eventDate: Date, today: Date) {
  const diff = daysBetween(eventDate, today);
  if (diff === 0) return { label: 'Today', urgent: true };
  if (diff === 1) return { label: 'Tomorrow', urgent: true };
  if (diff > 0 && diff <= 7) return { label: `In ${diff} days`, urgent: diff <= 3 };
  if (diff > 7 && diff <= 30) return { label: `In ${Math.ceil(diff / 7)} wk`, urgent: false };
  if (diff > 30) return { label: eventDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }), urgent: false };
  if (diff === -1) return { label: 'Yesterday', urgent: false };
  return { label: `${Math.abs(diff)}d ago`, urgent: false };
}

function bucketFor(eventDate: Date, today: Date): string {
  const diff = daysBetween(eventDate, today);
  if (diff < 0) return 'Past';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7) return 'This Week';
  if (diff <= 30) return 'This Month';
  return 'Later';
}

const BUCKET_ORDER = ['Today', 'Tomorrow', 'This Week', 'This Month', 'Later', 'Past'];

export default function EventsScreen() {
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [scope, setScope] = useState<Scope>('all');

  const fetchEvents = useCallback(async () => {
    setError(null);
    try {
      const data = await eventsService.getEvents();
      setEvents(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEvents();
  }, [fetchEvents]);

  const today = useMemo(() => startOfDay(new Date()), []);

  const sorted = useMemo(
    () => events.slice().sort(
      (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime(),
    ),
    [events],
  );

  const upcoming = useMemo(
    () => sorted.filter((e) => daysBetween(new Date(e.event_date), today) >= 0),
    [sorted, today],
  );
  const past = useMemo(
    () => sorted.filter((e) => daysBetween(new Date(e.event_date), today) < 0).reverse(),
    [sorted, today],
  );

  const featured = upcoming[0];

  const counts = useMemo(() => {
    const holiday = events.filter((e) => e.is_holiday).length;
    return {
      all: events.length,
      holiday,
      working: events.length - holiday,
    };
  }, [events]);

  const filteredAll = useMemo(() => {
    const base =
      scope === 'upcoming' ? upcoming : scope === 'past' ? past : [...upcoming, ...past];
    if (filter === 'holiday') return base.filter((e) => e.is_holiday);
    if (filter === 'working') return base.filter((e) => !e.is_holiday);
    return base;
  }, [upcoming, past, filter, scope]);

  const grouped = useMemo(() => {
    const buckets: Record<string, SchoolEvent[]> = {};
    for (const e of filteredAll) {
      const b = bucketFor(new Date(e.event_date), today);
      if (!buckets[b]) buckets[b] = [];
      buckets[b].push(e);
    }
    return BUCKET_ORDER.filter((b) => buckets[b]?.length).map((b) => ({ label: b, items: buckets[b] }));
  }, [filteredAll, today]);

  // 14-day strip — dots indicating event days
  const strip = useMemo(() => {
    const eventsByDay = new Map<string, SchoolEvent[]>();
    for (const e of upcoming) {
      const k = startOfDay(new Date(e.event_date)).toDateString();
      if (!eventsByDay.has(k)) eventsByDay.set(k, []);
      eventsByDay.get(k)!.push(e);
    }
    const days: { date: Date; events: SchoolEvent[] }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push({ date: d, events: eventsByDay.get(d.toDateString()) || [] });
    }
    return days;
  }, [upcoming, today]);

  if (loading) return <LoadingScreen message="Loading events..." />;

  const featuredMeta = featured ? metaFor(featured) : null;
  const featuredRel = featured ? relativeLabel(new Date(featured.event_date), today) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
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
            <Text style={styles.title}>Calendar</Text>
            <Text style={styles.subtitle}>
              {upcoming.length} upcoming · {events.length} total
            </Text>
          </View>
          <View style={styles.todayChip}>
            <Ionicons name="calendar" size={14} color={Colors.primary} />
            <Text style={styles.todayChipText}>
              {today.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
            </Text>
          </View>
        </Animated.View>

        {error && <ErrorState message={error} onRetry={fetchEvents} />}

        {events.length === 0 && !error ? (
          <View style={{ marginTop: 40 }}>
            <EmptyState
              icon={<Ionicons name="sparkles-outline" size={48} color={Colors.textMuted} />}
              title="No events on the calendar"
              subtitle="When your school schedules events, exams or non-teaching days they'll show up here."
            />
          </View>
        ) : (
          <>
            {/* HERO: Next event */}
            {featured && featuredMeta && featuredRel && (
              <Animated.View entering={FadeInDown.delay(80)} style={styles.heroWrap}>
                <View style={[styles.heroCard, { backgroundColor: featuredMeta.color }]}>
                  <View style={styles.heroBgCircle1} />
                  <View style={styles.heroBgCircle2} />

                  <View style={styles.heroTop}>
                    <View style={styles.heroPill}>
                      <Ionicons name={featuredMeta.icon} size={12} color={Colors.white} />
                      <Text style={styles.heroPillText}>{featuredMeta.label}</Text>
                    </View>
                    <Text style={styles.heroLabel}>NEXT UP</Text>
                  </View>

                  <Text style={styles.heroTitle} numberOfLines={2}>{featured.title}</Text>

                  {featured.description ? (
                    <Text style={styles.heroDesc} numberOfLines={2}>{featured.description}</Text>
                  ) : null}

                  <View style={styles.heroFooter}>
                    <View style={styles.heroDateBox}>
                      <Text style={styles.heroDateDay}>
                        {new Date(featured.event_date).getDate()}
                      </Text>
                      <View>
                        <Text style={styles.heroDateMonth}>
                          {new Date(featured.event_date).toLocaleDateString('en-IN', { month: 'long' })}
                        </Text>
                        <Text style={styles.heroDateWeekday}>
                          {new Date(featured.event_date).toLocaleDateString('en-IN', { weekday: 'long' })}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.heroCountdown, featuredRel.urgent && styles.heroCountdownUrgent]}>
                      <Text style={styles.heroCountdownText}>{featuredRel.label}</Text>
                    </View>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* 14-day strip */}
            <Animated.View entering={FadeInDown.delay(160)}>
              <View style={styles.stripCard}>
                <View style={styles.stripHeader}>
                  <Text style={styles.sectionLabel}>NEXT 14 DAYS</Text>
                  <Text style={styles.stripHint}>
                    {strip.reduce((s, d) => s + d.events.length, 0)} event
                    {strip.reduce((s, d) => s + d.events.length, 0) === 1 ? '' : 's'}
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.stripScroll}
                >
                  {strip.map((d, i) => {
                    const hasEvent = d.events.length > 0;
                    const isToday = i === 0;
                    const accent = hasEvent ? metaFor(d.events[0]).color : null;
                    return (
                      <View
                        key={d.date.toISOString()}
                        style={[
                          styles.stripDay,
                          isToday && styles.stripDayToday,
                          hasEvent && !isToday && { borderColor: accent ?? Colors.border },
                        ]}
                      >
                        <Text style={[
                          styles.stripWeekday,
                          isToday && { color: Colors.white },
                        ]}>
                          {d.date.toLocaleDateString('en-IN', { weekday: 'narrow' })}
                        </Text>
                        <Text style={[
                          styles.stripDate,
                          isToday && { color: Colors.white },
                        ]}>
                          {d.date.getDate()}
                        </Text>
                        <View style={styles.stripDots}>
                          {hasEvent ? (
                            d.events.slice(0, 3).map((e, idx) => (
                              <View
                                key={idx}
                                style={[
                                  styles.stripDot,
                                  { backgroundColor: isToday ? Colors.white : metaFor(e).color },
                                ]}
                              />
                            ))
                          ) : (
                            <View style={styles.stripDotEmpty} />
                          )}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </Animated.View>

            {/* Scope toggle: upcoming / all / past */}
            <Animated.View entering={FadeInDown.delay(220)} style={styles.scopeRow}>
              {(['upcoming', 'all', 'past'] as Scope[]).map((s) => {
                const active = scope === s;
                const count =
                  s === 'upcoming' ? upcoming.length : s === 'past' ? past.length : events.length;
                return (
                  <TouchableOpacity
                    key={s}
                    activeOpacity={0.85}
                    onPress={() => setScope(s)}
                    style={[styles.scopeBtn, active && styles.scopeBtnActive]}
                  >
                    <Text style={[styles.scopeText, active && styles.scopeTextActive]}>
                      {s === 'upcoming' ? 'Upcoming' : s === 'past' ? 'Past' : 'All'}
                    </Text>
                    <View style={[styles.scopeCount, active && styles.scopeCountActive]}>
                      <Text style={[styles.scopeCountText, active && styles.scopeCountTextActive]}>
                        {count}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>

            {/* Type filter pills */}
            <Animated.View entering={FadeInDown.delay(260)}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                <FilterPill
                  active={filter === 'all'}
                  onPress={() => setFilter('all')}
                  label="All"
                  count={counts.all}
                  color={Colors.primary}
                  icon="apps"
                />
                {counts.working > 0 && (
                  <FilterPill
                    active={filter === 'working'}
                    onPress={() => setFilter('working')}
                    label="Working"
                    count={counts.working}
                    color={Colors.primary}
                    icon="briefcase"
                  />
                )}
                {counts.holiday > 0 && (
                  <FilterPill
                    active={filter === 'holiday'}
                    onPress={() => setFilter('holiday')}
                    label="Non-Teaching"
                    count={counts.holiday}
                    color={HOLIDAY_META.color}
                    icon={HOLIDAY_META.icon}
                  />
                )}
              </ScrollView>
            </Animated.View>

            {/* Grouped list */}
            <View style={styles.list}>
              {grouped.length === 0 ? (
                <EmptyState
                  icon={<Ionicons name="filter-outline" size={36} color={Colors.textMuted} />}
                  title="No matching events"
                  subtitle="Try a different filter — there's nothing in this category."
                />
              ) : (
                grouped.map((g) => (
                  <View key={g.label} style={{ gap: 10 }}>
                    <View style={styles.bucketHeader}>
                      <Text style={styles.bucketLabel}>{g.label.toUpperCase()}</Text>
                      <View style={styles.bucketCount}>
                        <Text style={styles.bucketCountText}>{g.items.length}</Text>
                      </View>
                    </View>
                    {g.items.map((event, idx) => {
                      const m = metaFor(event);
                      const date = new Date(event.event_date);
                      const rel = relativeLabel(date, today);
                      const isPast = daysBetween(date, today) < 0;
                      return (
                        <Animated.View
                          key={event.id}
                          entering={FadeInDown.delay(idx * 35)}
                          layout={LinearTransition.springify().damping(18)}
                        >
                          <View
                            style={[
                              styles.eventCard,
                              { borderLeftColor: m.color },
                              isPast && styles.eventCardPast,
                            ]}
                          >
                            <View style={[styles.dateBox, { backgroundColor: m.bg }]}>
                              <Text style={[styles.dateDay, { color: m.color }]}>
                                {date.getDate()}
                              </Text>
                              <Text style={[styles.dateMonth, { color: m.color }]}>
                                {date.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}
                              </Text>
                            </View>

                            <View style={styles.eventBody}>
                              <View style={styles.eventTopRow}>
                                <View style={[styles.typeBadge, { backgroundColor: m.bg }]}>
                                  <Ionicons name={m.icon} size={11} color={m.color} />
                                  <Text style={[styles.typeBadgeText, { color: m.color }]}>
                                    {m.label}
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.relPill,
                                    rel.urgent && { backgroundColor: `${m.color}18` },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.relPillText,
                                      rel.urgent && { color: m.color },
                                    ]}
                                  >
                                    {rel.label}
                                  </Text>
                                </View>
                              </View>
                              <Text
                                style={[styles.eventTitle, isPast && styles.eventTitlePast]}
                                numberOfLines={2}
                              >
                                {event.title}
                              </Text>
                              {event.description ? (
                                <Text style={styles.eventDesc} numberOfLines={2}>
                                  {event.description}
                                </Text>
                              ) : null}
                              <View style={styles.metaRow}>
                                <View style={styles.metaItem}>
                                  <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                                  <Text style={styles.metaText}>
                                    {date.toLocaleDateString('en-IN', {
                                      weekday: 'short',
                                      day: 'numeric',
                                      month: 'short',
                                    })}
                                  </Text>
                                </View>
                                {event.time ? (
                                  <View style={styles.metaItem}>
                                    <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
                                    <Text style={styles.metaText}>{event.time}</Text>
                                  </View>
                                ) : null}
                                {event.location ? (
                                  <View style={styles.metaItem}>
                                    <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
                                    <Text style={styles.metaText} numberOfLines={1}>
                                      {event.location}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
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
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

interface FilterPillProps {
  active: boolean;
  onPress: () => void;
  label: string;
  count: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}
function FilterPill({ active, onPress, label, count, color, icon }: FilterPillProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.pill,
        active && { backgroundColor: color, borderColor: color },
      ]}
    >
      <Ionicons name={icon} size={13} color={active ? Colors.white : color} />
      <Text style={[styles.pillLabel, { color: active ? Colors.white : Colors.text }]}>
        {label}
      </Text>
      <View
        style={[
          styles.pillCount,
          { backgroundColor: active ? 'rgba(255,255,255,0.25)' : `${color}15` },
        ]}
      >
        <Text style={[styles.pillCountText, { color: active ? Colors.white : color }]}>
          {count}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 18, gap: 18 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '900', color: Colors.text, letterSpacing: -1 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginTop: 2 },
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
    backgroundColor: 'rgba(255,255,255,0.10)',
    top: -90, right: -60,
  },
  heroBgCircle2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -60, left: -40,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  heroPillText: { color: Colors.white, fontWeight: '900', fontSize: 11, letterSpacing: 0.4 },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  heroTitle: {
    color: Colors.white,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1,
    marginTop: 14,
  },
  heroDesc: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 6, lineHeight: 18 },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  heroDateBox: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroDateDay: { color: Colors.white, fontSize: 44, fontWeight: '900', letterSpacing: -2, lineHeight: 44 },
  heroDateMonth: { color: Colors.white, fontSize: 14, fontWeight: '900' },
  heroDateWeekday: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', marginTop: 1 },
  heroCountdown: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  heroCountdownUrgent: { backgroundColor: Colors.white },
  heroCountdownText: { color: Colors.white, fontWeight: '900', fontSize: 12 },

  // STRIP
  stripCard: {
    backgroundColor: Colors.card,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  stripHint: { fontSize: 11, fontWeight: '800', color: Colors.textMuted },
  stripScroll: { gap: 8, paddingHorizontal: 2 },
  stripDay: {
    width: 50,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: 4,
  },
  stripDayToday: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  stripWeekday: { fontSize: 10, fontWeight: '900', color: Colors.textMuted, textTransform: 'uppercase' },
  stripDate: { fontSize: 18, fontWeight: '900', color: Colors.text },
  stripDots: { flexDirection: 'row', gap: 3, height: 6, alignItems: 'center', marginTop: 2 },
  stripDot: { width: 5, height: 5, borderRadius: 2.5 },
  stripDotEmpty: { width: 5, height: 2, borderRadius: 1, backgroundColor: Colors.border },

  // SCOPE TOGGLE
  scopeRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  scopeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  scopeBtnActive: {
    backgroundColor: Colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  scopeText: { fontSize: 13, fontWeight: '800', color: Colors.textMuted },
  scopeTextActive: { color: Colors.text },
  scopeCount: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  scopeCountActive: { backgroundColor: `${Colors.primary}15` },
  scopeCountText: { fontSize: 11, fontWeight: '900', color: Colors.textMuted },
  scopeCountTextActive: { color: Colors.primary },

  // FILTER PILLS
  filterRow: { flexDirection: 'row', gap: 8, paddingVertical: 2, paddingRight: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  pillLabel: { fontSize: 13, fontWeight: '800' },
  pillCount: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, minWidth: 22, alignItems: 'center' },
  pillCountText: { fontSize: 11, fontWeight: '900' },

  // SECTION LABELS
  sectionLabel: { fontSize: 10, fontWeight: '900', color: Colors.textMuted, letterSpacing: 1 },

  // LIST
  list: { gap: 18 },
  bucketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  bucketLabel: { fontSize: 11, fontWeight: '900', color: Colors.text, letterSpacing: 1 },
  bucketCount: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  bucketCountText: { fontSize: 10, fontWeight: '900', color: Colors.textSecondary },

  eventCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    gap: 14,
  },
  eventCardPast: { opacity: 0.55 },
  dateBox: {
    width: 56,
    height: 64,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  dateDay: { fontSize: 22, fontWeight: '900', lineHeight: 24 },
  dateMonth: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },

  eventBody: { flex: 1, gap: 6 },
  eventTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeBadgeText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  relPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  relPillText: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary },

  eventTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  eventTitlePast: { textDecorationLine: 'line-through', textDecorationColor: Colors.textMuted },
  eventDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  eventDate: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginTop: 2 },

  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
});
