import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { Colors } from '../../constants/Colors';
import { Card } from '../../components/ui/Card';
import { neonShadows } from '@/styles/neonStyles';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dashboardService, directoryService } from '../../services';
import { LoadingScreen } from '../../components/ui/Feedback';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  const loadData = async () => {
    try {
      const [statsData, profileData] = await Promise.all([
        dashboardService.getTeacherDashboard(),
        directoryService.getMyProfile()
      ]);
      setStats(statsData);
      setProfile(profileData);
    } catch (error) {
      console.error('Failed to load teacher dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) return <LoadingScreen message="Initializing HQ..." />;

  const displayStats = [
    { label: 'Assigned Classes', value: profile?.assignments?.length || '0', icon: 'school-outline', color: Colors.primary },
    { label: 'Total Students', value: stats?.total_students || '0', icon: 'people-outline', color: Colors.success },
    { label: 'Today Attendance', value: stats?.attendance_rate || '0%', icon: 'checkmark-circle-outline', color: Colors.warning },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView 
        contentContainerStyle={styles.scroll} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <Animated.View entering={FadeInUp} style={styles.header}>
          <View>
            <Text style={styles.welcome}>Welcome Back,</Text>
            <Text style={styles.name}>{user?.name || 'Professor'}</Text>
          </View>
          <View style={styles.dateBox}>
            <Text style={styles.dateText}>{new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
          </View>
        </Animated.View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {displayStats.map((s, i) => (
            <Animated.View key={i} entering={FadeInDown.delay(i * 100)} style={styles.statCard}>
              <View style={[styles.statIconBox, { backgroundColor: `${s.color}15` }]}>
                <Ionicons name={s.icon as any} size={20} color={s.color} />
              </View>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </Animated.View>
          ))}
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionGrid}>
          <TouchableOpacity 
            style={[styles.actionBtn, { borderColor: Colors.success }]}
            onPress={() => router.push('/(teacher)/attendance')}
          >
            <Ionicons name="checkbox-outline" size={32} color={Colors.success} />
            <Text style={styles.actionText}>Take Attendance</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionBtn, { borderColor: Colors.primary }]}
            onPress={() => router.push('/(teacher)/marks')}
          >
            <Ionicons name="create-outline" size={32} color={Colors.primary} />
            <Text style={styles.actionText}>Enter Marks</Text>
          </TouchableOpacity>
        </View>

        {/* Assignments Preview */}
        <Text style={styles.sectionTitle}>My Current Classes</Text>
        <Card style={styles.scheduleCard}>
          {profile?.assignments?.length > 0 ? profile.assignments.map((item: any, i: number) => (
            <TouchableOpacity 
              key={i} 
              style={[styles.scheduleItem, i > 0 && styles.divider]}
              onPress={() => router.push({ pathname: '/(teacher)/attendance', params: { classId: item.school_class_id } })}
            >
              <View style={styles.timeLine}>
                <Text style={styles.timeText}>{item.subject_ref.code || 'SUB'}</Text>
                <View style={[styles.dot, { backgroundColor: Colors.primary }]} />
              </View>
              <View style={styles.classInfo}>
                <Text style={styles.className}>{item.school_class.grade.name}-{item.school_class.section.name}</Text>
                <Text style={styles.subjectName}>{item.subject_ref.name}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )) : (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: Colors.textMuted }}>No active assignments found.</Text>
            </View>
          )}
        </Card>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, gap: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  welcome: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  name: { fontSize: 28, fontWeight: '900', color: Colors.text, letterSpacing: -1 },
  dateBox: { backgroundColor: Colors.surfaceElevated, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  dateText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  statsGrid: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: Colors.surface, padding: 15, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, ...neonShadows.blue },
  statIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 18, fontWeight: '900', color: Colors.text },
  statLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, marginTop: 10 },
  actionGrid: { flexDirection: 'row', gap: 15 },
  actionBtn: { flex: 1, height: 120, backgroundColor: Colors.surface, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 10, ...neonShadows.blue },
  actionText: { fontSize: 14, fontWeight: '800', color: Colors.text },
  scheduleCard: { padding: 0, overflow: 'hidden' },
  scheduleItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 15 },
  timeLine: { alignItems: 'center', width: 70 },
  timeText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success, marginTop: 4 },
  classInfo: { flex: 1 },
  className: { fontSize: 16, fontWeight: '800', color: Colors.text },
  subjectName: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  divider: { borderTopWidth: 1, borderTopColor: Colors.divider },
});
