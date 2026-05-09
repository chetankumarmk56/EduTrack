import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { LoadingScreen, ErrorState } from '../../components/ui/Feedback';
import { Ionicons } from '@expo/vector-icons';
import { eventsService, type SchoolEvent } from '../../services';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function TeacherEvents() {
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setError(null);
    try {
      const data = await eventsService.getEvents();
      setEvents(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEvents();
  }, [fetchEvents]);

  if (loading) return <LoadingScreen message="Loading calendar..." />;

  const upcomingCount = events.filter(
    (e) => new Date(e.event_date) >= new Date(new Date().toDateString()),
  ).length;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.success}
          />
        }
      >
        {/* ── Header Banner ── */}
        <Animated.View entering={FadeInDown.delay(0)} style={styles.headerBanner}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="calendar" size={22} color={Colors.success} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Academic Calendar</Text>
              <Text style={styles.headerSubtitle}>School events &amp; schedule</Text>
            </View>
          </View>
          {upcomingCount > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{upcomingCount} upcoming</Text>
            </View>
          )}
        </Animated.View>

        {/* ── Error State ── */}
        {error && <ErrorState message={error} onRetry={fetchEvents} />}

        {/* ── Empty State ── */}
        {!error && events.length === 0 && (
          <Animated.View entering={FadeInDown.delay(100)} style={styles.emptyWrap}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="calendar-outline" size={64} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No Events Scheduled</Text>
            <Text style={styles.emptySubtitle}>
              The calendar is clear for now.{'\n'}Check back later for updates.
            </Text>
          </Animated.View>
        )}

        {/* ── Event Cards ── */}
        {events.map((event, index) => {
          const typeColor = getEventTypeColor(event.event_type);
          const dateObj = new Date(event.event_date);
          const dayNum = dateObj.toLocaleDateString('en-US', { day: '2-digit' });
          const monthStr = dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
          const typeLabel = (event.event_type || 'Event').replace('_', ' ').toUpperCase();

          return (
            <Animated.View
              key={event.id}
              entering={FadeInDown.delay(index * 80 + 100)}
              style={styles.cardShadowWrap}
            >
              <View style={styles.eventCard}>
                {/* ── Left Date Block ── */}
                <View style={[styles.dateBlock, { backgroundColor: typeColor }]}>
                  <Text style={styles.dateDay}>{dayNum}</Text>
                  <Text style={styles.dateMonth}>{monthStr}</Text>
                  <View style={styles.dateDivider} />
                  <Ionicons
                    name={getEventTypeIcon(event.event_type)}
                    size={16}
                    color="rgba(255,255,255,0.7)"
                  />
                </View>

                {/* ── Right Content ── */}
                <View style={styles.cardContent}>
                  {/* Type badge */}
                  <View
                    style={[
                      styles.typeBadge,
                      { backgroundColor: `${typeColor}18` },
                    ]}
                  >
                    <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                      {typeLabel}
                    </Text>
                  </View>

                  {/* Title */}
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {event.title}
                  </Text>

                  {/* Description */}
                  {event.description ? (
                    <Text style={styles.cardDescription} numberOfLines={2}>
                      {event.description}
                    </Text>
                  ) : null}

                  {/* Footer date row */}
                  <View style={styles.cardFooter}>
                    <Ionicons
                      name="time-outline"
                      size={12}
                      color={Colors.textMuted}
                    />
                    <Text style={styles.cardFooterText}>
                      {dateObj.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                </View>
              </View>
            </Animated.View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const getEventTypeColor = (type: string | undefined) => {
  if (!type) return Colors.textMuted;
  switch (type.toLowerCase()) {
    case 'exam':     return Colors.danger;
    case 'meeting':  return Colors.primary;
    case 'holiday':  return Colors.success;
    case 'sports':   return Colors.warning;
    case 'activity': return Colors.info;
    default:         return Colors.textMuted;
  }
};

const getEventTypeIcon = (
  type: string | undefined,
): React.ComponentProps<typeof Ionicons>['name'] => {
  if (!type) return 'calendar-outline';
  switch (type.toLowerCase()) {
    case 'exam':     return 'document-text-outline';
    case 'meeting':  return 'people-outline';
    case 'holiday':  return 'sunny-outline';
    case 'sports':   return 'football-outline';
    case 'activity': return 'star-outline';
    default:         return 'calendar-outline';
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    padding: 20,
    gap: 14,
    paddingBottom: 32,
  },

  /* ── Header Banner ── */
  headerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 6,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: `${Colors.success}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },
  countBadge: {
    backgroundColor: `${Colors.success}18`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  /* ── Empty State ── */
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 12,
  },
  emptyIconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },

  /* ── Event Card ── */
  cardShadowWrap: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },

  /* ── Date Block (left) ── */
  dateBlock: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 2,
  },
  dateDay: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.white,
    lineHeight: 30,
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dateDivider: {
    width: 24,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginVertical: 6,
  },

  /* ── Card Content (right) ── */
  cardContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  cardDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  cardFooterText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
  },
});
