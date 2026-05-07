import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { SectionHeader } from '../../components/ui/Card';
import { LoadingScreen, ErrorState, EmptyState } from '../../components/ui/Feedback';
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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.success} />}
      >
        <SectionHeader title="Academic Calendar" />
        
        {error && <ErrorState message={error} onRetry={fetchEvents} />}
        {events.length === 0 ? (
          <EmptyState
            title="No Upcoming Events"
            subtitle="The calendar is clear for now. Check back later for updates."
            icon={<Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />}
          />
        ) : (
          events.map((event, index) => (
            <Animated.View key={event.id} entering={FadeInDown.delay(index * 100)}>
              <View style={styles.eventCard}>
                <View style={[styles.typeBar, { backgroundColor: getEventTypeColor(event.event_type) }]} />
                <View style={styles.content}>
                  <View style={styles.header}>
                    <Text style={styles.date}>
                      {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: `${getEventTypeColor(event.event_type)}15` }]}>
                      <Text style={[styles.badgeText, { color: getEventTypeColor(event.event_type) }]}>
                        {(event.event_type || 'Event').replace('_', ' ')}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.title}>{event.title}</Text>
                  {event.description && (
                    <Text style={styles.description} numberOfLines={2}>{event.description}</Text>
                  )}
                </View>
              </View>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getEventTypeColor = (type: string | undefined) => {
  if (!type) return Colors.textMuted;
  switch (type.toLowerCase()) {
    case 'exam': return Colors.danger;
    case 'meeting': return Colors.primary;
    case 'holiday': return Colors.success;
    case 'sports': return Colors.warning;
    case 'activity': return Colors.info;
    default: return Colors.textMuted;
  }
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, gap: 16 },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 5,
  },
  typeBar: { width: 5 },
  content: { flex: 1, padding: 18, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 12, fontWeight: '800', color: Colors.success, textTransform: 'uppercase', letterSpacing: 0.5 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  title: { fontSize: 18, fontWeight: '900', color: Colors.text, letterSpacing: -0.5 },
  description: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
});
