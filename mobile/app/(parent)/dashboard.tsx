import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { 
  FadeInDown, 
  FadeInRight,
  useAnimatedStyle, 
  withSpring 
} from 'react-native-reanimated';
import { Colors } from '../../constants/Colors';
import { Card, SectionHeader } from '../../components/ui/Card';
import { ProgressBar, LoadingScreen } from '../../components/ui/Feedback';
import { useDashboard } from '../../hooks';
import { 
  getAttendancePct, 
  getSubjectPerformance, 
  getTimeGreeting 
} from '../../utils/formatters';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const router = useRouter();
  const {
    user,
    profile,
    marks,
    attendance,
    fees,
    loading,
    refreshing,
    onRefresh
  } = useDashboard();

  if (loading) return <LoadingScreen message="Orchestrating your workspace..." />;

  const attendancePct = getAttendancePct(attendance);
  const subjectPerf = getSubjectPerformance(marks);
  const overallPct =
    subjectPerf.length > 0
      ? Math.round(subjectPerf.reduce((a, b) => a + b.pct, 0) / subjectPerf.length)
      : 0;

  const displayName = profile?.name || user?.name || 'Student';
  const gradeInfo =
    profile?.school_class?.grade?.level || profile?.class_level
      ? `Grade ${profile?.school_class?.grade?.level || profile?.class_level}${profile?.school_class?.section?.name || profile?.section || ''}`
      : 'Class Information Loading...';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
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
        {/* Neon Header Section */}
        <Animated.View entering={FadeInDown.duration(800)} style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getTimeGreeting()},</Text>
            <Text style={styles.userName}>{displayName}</Text>
            <View style={styles.badge}>
              <View style={styles.neonDot} />
              <Text style={styles.badgeText}>{gradeInfo}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Bento Stats Grid - Neon Edition */}
        <View style={styles.bentoGrid}>
          {/* Main Stat: Overall Performance */}
          <Animated.View entering={FadeInDown.delay(200)} style={[styles.bentoItem, { width: '100%', height: 160 }]}>
            <View style={[styles.bentoInner, { backgroundColor: Colors.primary, shadowColor: Colors.primary }]}>
              <View>
                <Text style={styles.bentoLabelLight}>Overall Mastery</Text>
                <Text style={styles.bentoValueLight}>{overallPct}%</Text>
              </View>
              <View style={styles.performanceChart}>
                {[40, 70, 50, 90, 60, 80].map((h, i) => (
                  <View key={i} style={[styles.chartBar, { height: h, backgroundColor: 'rgba(255,255,255,0.4)' }]} />
                ))}
              </View>
            </View>
          </Animated.View>

          {/* Secondary Stat: Attendance */}
          <Animated.View entering={FadeInDown.delay(300)} style={[styles.bentoItem, { width: '48%' }]}>
            <View style={[styles.bentoInner, { backgroundColor: Colors.white, borderColor: Colors.border, borderWidth: 1 }]}>
              <Text style={styles.bentoLabel}>Attendance</Text>
              <Text style={[styles.bentoValue, { color: attendancePct >= 75 ? Colors.success : Colors.danger }]}>
                {attendancePct}%
              </Text>
              <View style={[styles.statusChip, { backgroundColor: attendancePct >= 75 ? `${Colors.success}15` : `${Colors.danger}15` }]}>
                <Text style={[styles.statusText, { color: attendancePct >= 75 ? Colors.success : Colors.danger }]}>
                  {attendancePct >= 75 ? 'Excellent' : 'Low'}
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* Secondary Stat: Assessments */}
          <Animated.View entering={FadeInDown.delay(400)} style={[styles.bentoItem, { width: '48%' }]}>
            <View style={[styles.bentoInner, { backgroundColor: Colors.white, borderColor: Colors.border, borderWidth: 1 }]}>
              <Text style={styles.bentoLabel}>Assigned</Text>
              <Text style={styles.bentoValue}>{marks.length}</Text>
              <Text style={styles.bentoSubtext}>Evaluations</Text>
            </View>
          </Animated.View>
        </View>

        {/* Priority Alerts */}
        {fees.length > 0 && (
          <Animated.View entering={FadeInRight.delay(500)}>
            <SectionHeader title="Action Required" />
            {fees.slice(0, 1).map((fee, i) => (
              <Card key={i} onPress={() => router.push('/fees')} style={styles.feeCard}>
                <View style={styles.feeRow}>
                  <View style={styles.feeIconBox}>
                    <Text style={{ fontSize: 20 }}>💰</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.feeTitle}>Pending Dues</Text>
                    <Text style={styles.feeSubtitle}>₹{fee.due_amount.toLocaleString()}</Text>
                  </View>
                  <View style={styles.payButton}>
                    <Text style={styles.payButtonText}>Pay Now</Text>
                  </View>
                </View>
              </Card>
            ))}
          </Animated.View>
        )}

        {/* Subject Insights */}
        {subjectPerf.length > 0 && (
          <View>
            <SectionHeader 
              title="Subject Mastery" 
              subtitle="Real-time performance metrics"
              rightElement={
                <TouchableOpacity onPress={() => router.push('/marks')}>
                  <Text style={{ color: Colors.primary, fontWeight: '800' }}>Full Report</Text>
                </TouchableOpacity>
              }
            />
            <Card>
              {subjectPerf.slice(0, 4).map((s, i) => (
                <View key={i} style={[styles.insightRow, i < 3 && styles.divider]}>
                  <View style={styles.insightHeader}>
                    <Text style={styles.subjectName}>{s.subject}</Text>
                    <Text style={[styles.subjectPct, { color: Colors.primary }]}>
                      {s.pct}%
                    </Text>
                  </View>
                  <ProgressBar
                    value={s.pct}
                    color={Colors.primary}
                    height={8}
                    backgroundColor={`${Colors.primary}10`}
                  />
                </View>
              ))}
            </Card>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, gap: 20 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  greeting: { fontSize: 16, color: Colors.textSecondary, fontWeight: '600', letterSpacing: 0.5 },
  userName: { fontSize: 34, fontWeight: '900', color: Colors.text, letterSpacing: -1.2, marginTop: -2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.primary}10`,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  neonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    marginRight: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  badgeText: { fontSize: 12, color: Colors.primary, fontWeight: '800', textTransform: 'uppercase' },

  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 14,
  },
  bentoItem: {
    borderRadius: 32,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  },
  bentoInner: {
    flex: 1,
    padding: 26,
    borderRadius: 32,
    justifyContent: 'space-between',
  },
  bentoLabel: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  bentoLabelLight: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1 },
  bentoValue: { fontSize: 38, fontWeight: '900', color: Colors.text, letterSpacing: -1.5 },
  bentoValueLight: { fontSize: 48, fontWeight: '900', color: Colors.white, letterSpacing: -2 },
  bentoSubtext: { fontSize: 13, color: Colors.textMuted, fontWeight: '600', marginTop: 4 },
  
  performanceChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: 60,
  },
  chartBar: {
    width: 14,
    borderRadius: 7,
  },
  
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  statusText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },

  feeCard: { backgroundColor: '#fdf4ff', borderColor: '#f5d0fe' },
  feeRow: { flexDirection: 'row', alignItems: 'center' },
  feeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#a855f7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#a855f7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  feeTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  feeSubtitle: { fontSize: 14, color: '#a855f7', marginTop: 2, fontWeight: '700' },
  payButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  payButtonText: { color: Colors.white, fontWeight: '900', fontSize: 13 },

  insightRow: { paddingVertical: 18, gap: 12 },
  insightHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subjectName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  subjectPct: { fontSize: 16, fontWeight: '900' },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
});
