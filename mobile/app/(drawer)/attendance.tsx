import React from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { SectionHeader, StatCard } from '../../components/ui/Card';
import { LoadingScreen, ErrorState, EmptyState, ProgressBar } from '../../components/ui/Feedback';
import { Ionicons } from '@expo/vector-icons';
import { useStudentData } from '../../hooks/useStudentData';

export default function AttendanceScreen() {
  const { attendance, loading, error, refresh } = useStudentData();

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const presentCount = attendance.filter((r) => r.status.toLowerCase() === 'present').length;
  const absentCount = attendance.filter((r) => r.status.toLowerCase() === 'absent').length;
  const lateCount = attendance.filter((r) => r.status.toLowerCase() === 'late').length;
  const totalCount = attendance.length;
  const attendanceRate = totalCount > 0 ? (presentCount / totalCount) * 100 : 0;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={Colors.primary} />}
      >
        <SectionHeader title="Attendance Summary" />
        
        <View style={styles.statsRow}>
          <StatCard
            label="Rate"
            value={`${attendanceRate.toFixed(1)}%`}
            icon={<Text style={{fontSize: 20}}>📊</Text>}
            style={{ flex: 1 }}
          />
          <StatCard
            label="Present"
            value={String(presentCount)}
            icon={<Text style={{fontSize: 20}}>✅</Text>}
            style={{ flex: 1 }}
          />
        </View>

        <View style={styles.statsRow}>
          <StatCard
            label="Absent"
            value={String(absentCount)}
            icon={<Text style={{fontSize: 20}}>❌</Text>}
            style={{ flex: 1 }}
          />
          <StatCard
            label="Late"
            value={String(lateCount)}
            icon={<Text style={{fontSize: 20}}>⏰</Text>}
            style={{ flex: 1 }}
          />
        </View>

        <SectionHeader title="Monthly Progress" />
        <View style={styles.progressCard}>
          <ProgressBar
            value={attendanceRate}
            color={attendanceRate >= 85 ? Colors.success : Colors.warning}
          />
          <Text style={styles.progressLabel}>
            Attendance Goal (85%) — Currently {attendanceRate.toFixed(0)}%
          </Text>
        </View>

        <SectionHeader title="Recent Logs" />
        {attendance.length === 0 ? (
          <EmptyState
            title="No Records"
            subtitle="Your attendance logs for the current term are not available yet."
            icon={<Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />}
          />
        ) : (
          attendance.slice(0, 15).map((record, index) => (
            <View key={index} style={styles.logItem}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(record.status) }]} />
              <View style={styles.logInfo}>
                <View style={styles.logMain}>
                  <Text style={styles.logDate}>{new Date(record.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                  <View style={[styles.badge, { backgroundColor: `${getStatusColor(record.status)}15` }]}>
                    <Text style={[styles.badgeText, { color: getStatusColor(record.status) }]}>{record.status}</Text>
                  </View>
                </View>
                {record.subject && <Text style={styles.logSubject}>{record.subject}</Text>}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'present': return Colors.success;
    case 'absent': return Colors.danger;
    case 'late': return Colors.warning;
    default: return Colors.primary;
  }
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40, gap: 16 },
  statsRow: { flexDirection: 'row', gap: 12 },
  progressCard: { 
    backgroundColor: Colors.card, 
    padding: 20, 
    borderRadius: 22, 
    borderWidth: 1, 
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  progressLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', marginTop: 10, textAlign: 'center' },
  logItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 16, 
    backgroundColor: Colors.card, 
    padding: 16, 
    borderRadius: 18, 
    borderWidth: 1, 
    borderColor: Colors.border 
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  logInfo: { flex: 1, gap: 2 },
  logMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logDate: { fontSize: 15, fontWeight: '700', color: Colors.text },
  logSubject: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
});
