import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { directoryService, type Teacher } from '../../services';
import { Colors } from '../../constants/Colors';
import { Card, SectionHeader } from '../../components/ui/Card';
import { LoadingScreen, EmptyState, ErrorState } from '../../components/ui/Feedback';

export default function TeachersScreen() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTeachers = useCallback(async () => {
    setError(null);
    try {
      const data = await directoryService.getTeachers();
      setTeachers(data);
    } catch (e: any) {
      setError(e.message || 'Failed to sync faculty directory');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTeachers();
  }, [fetchTeachers]);

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    Linking.openURL(`whatsapp://send?phone=${cleanPhone}`);
  };

  const handleEmail = (email: string) => {
    Linking.openURL(`mailto:${email}`);
  };

  if (loading) return <LoadingScreen message="Syncing with faculty..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        <Animated.View entering={FadeInDown} style={styles.header}>
          <Text style={styles.title}>Faculty Directory</Text>
          <Text style={styles.subtitle}>{teachers.length} Active Mentors</Text>
        </Animated.View>

        {error && <ErrorState message={error} onRetry={fetchTeachers} />}

        <View style={styles.list}>
          {teachers.length > 0 ? (
            teachers.map((teacher, index) => (
              <Card key={teacher.id} index={index} style={styles.teacherCard}>
                <View style={styles.teacherRow}>
                  <View style={[styles.avatar, { backgroundColor: `${Colors.primary}10` }]}>
                    <Text style={styles.avatarText}>{teacher.name[0]}</Text>
                    <View style={styles.onlineIndicator} />
                  </View>

                  <View style={styles.infoContainer}>
                    <Text style={styles.teacherName}>{teacher.name}</Text>
                    <View style={styles.subjectContainer}>
                      <Text style={styles.subjectText}>Assigned Faculty</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.actionGrid}>
                  {teacher.phone && (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleCall(teacher.phone!)}
                    >
                      <Text style={styles.actionIcon}>📞</Text>
                      <Text style={styles.actionLabel}>Call</Text>
                    </TouchableOpacity>
                  )}
                  {teacher.whatsapp && (
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#25D36615', borderColor: '#25D36640' }]}
                      onPress={() => handleWhatsApp(teacher.whatsapp!)}
                    >
                      <Text style={styles.actionIcon}>💬</Text>
                      <Text style={[styles.actionLabel, { color: '#16a34a' }]}>WhatsApp</Text>
                    </TouchableOpacity>
                  )}
                  {teacher.email && (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleEmail(teacher.email!)}
                    >
                      <Text style={styles.actionIcon}>✉️</Text>
                      <Text style={styles.actionLabel}>Email</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Card>
            ))
          ) : !error && (
            <EmptyState
              icon={<Text style={{ fontSize: 50 }}>👨‍🏫</Text>}
              title="Directory Empty"
              subtitle="Your mentors will appear here soon."
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
  scroll: { padding: 20 },
  header: { marginBottom: 26 },
  title: { fontSize: 34, fontWeight: '900', color: Colors.text, letterSpacing: -1.5 },
  subtitle: { fontSize: 16, color: Colors.textSecondary, fontWeight: '600', marginTop: 4 },

  list: { gap: 16 },
  teacherCard: { padding: 0 },
  teacherRow: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  avatarText: { fontSize: 30, fontWeight: '900', color: Colors.primary },
  onlineIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.success,
    borderWidth: 4,
    borderColor: Colors.background,
  },

  infoContainer: { flex: 1, marginLeft: 18, gap: 5 },
  teacherName: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.8 },
  subjectContainer: {
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  subjectText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '800', textTransform: 'uppercase' },

  divider: { height: 1, backgroundColor: Colors.divider },

  actionGrid: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionIcon: { fontSize: 18 },
  actionLabel: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary },
});
