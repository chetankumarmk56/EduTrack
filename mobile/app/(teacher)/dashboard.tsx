import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { Colors } from '../../constants/Colors';
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

  const classCount = profile?.assignments?.length || 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Background Blobs */}
      <View style={styles.bgBlob1} />
      <View style={styles.bgBlob2} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.success}
          />
        }
      >
        {/* Hero Header Card */}
        <Animated.View entering={FadeInUp.delay(0)} style={styles.heroCard}>
          <View style={styles.heroTopBorder} />
          <View style={styles.heroContent}>
            <View style={styles.heroLeft}>
              <View style={styles.heroIconCircle}>
                <Ionicons name="school" size={26} color={Colors.success} />
              </View>
              <View style={styles.heroTextBlock}>
                <Text style={styles.heroWelcome}>Welcome Back,</Text>
                <Text style={styles.heroName}>{user?.name || 'Professor'}</Text>
              </View>
            </View>
            <View style={styles.datePill}>
              <Text style={styles.datePillText}>
                {new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          {displayStats.map((s, i) => (
            <Animated.View
              key={i}
              entering={FadeInDown.delay(100 + i * 80)}
              style={[styles.statCard, { borderBottomColor: s.color }]}
            >
              <View style={[styles.statIconCircle, { backgroundColor: `${s.color}18` }]}>
                <Ionicons name={s.icon as any} size={20} color={s.color} />
              </View>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </Animated.View>
          ))}
        </View>

        {/* Quick Actions */}
        <Animated.View entering={FadeInDown.delay(350)} style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400)} style={styles.actionGrid}>
          {/* Attendance Action */}
          <TouchableOpacity
            style={[styles.actionCard, styles.actionCardGreen]}
            onPress={() => router.push('/(teacher)/attendance')}
            activeOpacity={0.88}
          >
            <View style={styles.actionIconWrap}>
              <Ionicons name="checkbox-outline" size={32} color={Colors.white} />
            </View>
            <Text style={styles.actionTitle}>Take Attendance</Text>
            <Text style={styles.actionSub}>Mark today's class</Text>
          </TouchableOpacity>

          {/* Marks Action */}
          <TouchableOpacity
            style={[styles.actionCard, styles.actionCardBlue]}
            onPress={() => router.push('/(teacher)/marks')}
            activeOpacity={0.88}
          >
            <View style={styles.actionIconWrap}>
              <Ionicons name="create-outline" size={32} color={Colors.white} />
            </View>
            <Text style={styles.actionTitle}>Enter Marks</Text>
            <Text style={styles.actionSub}>Update student scores</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* My Classes Section */}
        <Animated.View entering={FadeInDown.delay(480)} style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>My Current Classes</Text>
          {classCount > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{classCount}</Text>
            </View>
          )}
        </Animated.View>

        {profile?.assignments?.length > 0 ? (
          profile.assignments.map((item: any, i: number) => (
            <Animated.View key={i} entering={FadeInDown.delay(520 + i * 60)}>
              <TouchableOpacity
                style={styles.classCard}
                onPress={() =>
                  router.push({ pathname: '/(teacher)/attendance', params: { classId: item.school_class_id } })
                }
                activeOpacity={0.85}
              >
                {/* Subject Code Pill */}
                <View style={styles.subjectCodePill}>
                  <Text style={styles.subjectCodeText}>{item.subject_ref.code || 'SUB'}</Text>
                </View>

                {/* Class Info */}
                <View style={styles.classInfoBlock}>
                  <Text style={styles.classNameText}>
                    {item.school_class.grade.name}-{item.school_class.section.name}
                  </Text>
                  <Text style={styles.subjectNameText}>{item.subject_ref.name}</Text>
                </View>

                {/* Arrow */}
                <View style={styles.classArrowCircle}>
                  <Ionicons name="chevron-forward" size={16} color={Colors.success} />
                </View>
              </TouchableOpacity>
            </Animated.View>
          ))
        ) : (
          <Animated.View entering={FadeInDown.delay(520)} style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="calendar-outline" size={28} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyText}>No active assignments found.</Text>
          </Animated.View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Background Blobs
  bgBlob1: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: `${Colors.success}0d`,
  },
  bgBlob2: {
    position: 'absolute',
    bottom: 60,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: `${Colors.success}08`,
  },

  scroll: {
    padding: 20,
    gap: 14,
  },

  // Hero Header
  heroCard: {
    backgroundColor: `${Colors.success}08`,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: `${Colors.success}22`,
    overflow: 'hidden',
    marginBottom: 6,
    ...neonShadows.emerald,
  },
  heroTopBorder: {
    height: 3,
    backgroundColor: Colors.success,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    paddingTop: 16,
  },
  heroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    flex: 1,
  },
  heroIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: `${Colors.success}15`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${Colors.success}30`,
  },
  heroTextBlock: {
    flex: 1,
  },
  heroWelcome: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
  heroName: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.8,
    marginTop: 1,
  },
  datePill: {
    backgroundColor: `${Colors.success}18`,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: `${Colors.success}30`,
  },
  datePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.success,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomWidth: 3,
    alignItems: 'flex-start',
    gap: 6,
    ...neonShadows.emerald,
  },
  statIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    lineHeight: 11,
  },

  // Section Header
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  countBadge: {
    backgroundColor: `${Colors.success}18`,
    borderWidth: 1,
    borderColor: `${Colors.success}30`,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.success,
  },

  // Quick Action Cards
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  actionCard: {
    flex: 1,
    height: 138,
    borderRadius: 24,
    padding: 18,
    justifyContent: 'space-between',
  },
  actionCardGreen: {
    backgroundColor: Colors.success,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },
  actionCardBlue: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },
  actionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -0.2,
    marginTop: 2,
  },
  actionSub: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.1,
    marginTop: 1,
  },

  // Class Cards
  classCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 14,
    marginBottom: 10,
    ...neonShadows.emerald,
  },
  subjectCodePill: {
    backgroundColor: `${Colors.success}15`,
    borderWidth: 1,
    borderColor: `${Colors.success}28`,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 54,
    alignItems: 'center',
  },
  subjectCodeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  classInfoBlock: {
    flex: 1,
  },
  classNameText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  subjectNameText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  classArrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: `${Colors.success}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty State
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },

  bottomSpacer: {
    height: 20,
  },
});
