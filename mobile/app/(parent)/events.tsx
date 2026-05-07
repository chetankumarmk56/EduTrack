import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { neonShadows } from '@/styles/neonStyles';
import { SectionHeader } from '../../components/ui/Card';
import { LoadingScreen, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { Ionicons } from '@expo/vector-icons';
import { eventsService, type SchoolEvent } from '../../services';

export default function EventsScreen() {
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

  if (loading) return <LoadingScreen message="Loading events..." />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <SectionHeader title="School Calendar" />
        
        {error && <ErrorState message={error} onRetry={fetchEvents} />}
        {events.length === 0 ? (
          <EmptyState
            title="No Upcoming Events"
            subtitle="There are no major events scheduled for the next few weeks. Enjoy the quiet!"
            icon={<Ionicons name="sparkles-outline" size={40} color={Colors.textMuted} />}
          />
        ) : (
          events.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <View style={[styles.typeBar, { backgroundColor: getEventTypeColor(event.event_type) }]} />
              <View style={styles.content}>
                <View style={styles.header}>
                  <Text style={styles.date}>{new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                  <View style={[styles.badge, { backgroundColor: `${getEventTypeColor(event.event_type)}15` }]}>
                    <Text style={[styles.badgeText, { color: getEventTypeColor(event.event_type) }]}>{(event.event_type || 'Event').replace('_', ' ')}</Text>
                  </View>
                </View>
                <Text style={styles.title}>{event.title}</Text>
                {event.description && (
                  <Text style={styles.description} numberOfLines={2}>{event.description}</Text>
                )}
              </View>
            </View>
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
  scroll: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40, gap: 16 },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.primary,
    ...neonShadows.blue,
  },
  typeBar: { width: 6 },
  content: { flex: 1, padding: 16, gap: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 13, fontWeight: '700', color: Colors.accent, textTransform: 'uppercase' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.surface },
  badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', color: Colors.accent },
  title: { fontSize: 18, fontWeight: '800', color: Colors.accent, letterSpacing: -0.5 },
  description: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  locationText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
});
