import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { SectionHeader } from '../../components/ui/Card';
import { LoadingScreen, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/apiClient';

interface Event {
  id: number;
  title: string;
  description: string;
  date: string;
  location?: string;
  type: 'academic' | 'holiday' | 'sports' | 'other';
}

export default function EventsScreen() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/events');
      setEvents(res.data);
    } catch (err: any) {
      // If endpoint doesn't exist yet, show empty state instead of error
      if (err.message.includes('404')) {
        setEvents([]);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEvents(); }, []);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={fetchEvents} />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchEvents} tintColor={Colors.primary} />}
      >
        <SectionHeader title="School Calendar" />
        
        {events.length === 0 ? (
          <EmptyState
            title="No Upcoming Events"
            subtitle="There are no major events scheduled for the next few weeks. Enjoy the quiet!"
            icon={<Ionicons name="sparkles-outline" size={40} color={Colors.textMuted} />}
          />
        ) : (
          events.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <View style={[styles.typeBar, { backgroundColor: getEventTypeColor(event.type) }]} />
              <View style={styles.content}>
                <View style={styles.header}>
                  <Text style={styles.date}>{new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                  <View style={[styles.badge, { backgroundColor: `${getEventTypeColor(event.type)}15` }]}>
                    <Text style={[styles.badgeText, { color: getEventTypeColor(event.type) }]}>{event.type}</Text>
                  </View>
                </View>
                <Text style={styles.title}>{event.title}</Text>
                <Text style={styles.description} numberOfLines={2}>{event.description}</Text>
                {event.location && (
                  <View style={styles.locationRow}>
                    <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.locationText}>{event.location}</Text>
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getEventTypeColor = (type: string) => {
  switch (type.toLowerCase()) {
    case 'academic': return Colors.primary;
    case 'holiday': return Colors.success;
    case 'sports': return Colors.warning;
    default: return Colors.textMuted;
  }
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40, gap: 16 },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeBar: { width: 6 },
  content: { flex: 1, padding: 16, gap: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 13, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  title: { fontSize: 18, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  description: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  locationText: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
});
