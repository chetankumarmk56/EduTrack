import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import {
  marksService,
  attendanceService,
  financeService,
  directoryService,
  type Mark,
  type AttendanceRecord,
  type ParentFee,
  type StudentProfile,
} from '../../services';
import { Colors } from '../../constants/Colors';
import { Card, SectionHeader } from '../../components/ui/Card';
import { ProgressBar, LoadingScreen } from '../../components/ui/Feedback';
import { useRouter } from 'expo-router';

function computeGradeLabel(pct: number) {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  return 'D';
}

function getAttendancePct(records: AttendanceRecord[]): number {
  if (records.length === 0) return 100;
  const present = records.filter(
    (r) => r.status === 'Present' || r.status === 'Late',
  ).length;
  return Math.round((present / records.length) * 100);
}

function getSubjectPerformance(marks: Mark[]) {
  const map: Record<string, { total: number; max: number }> = {};
  for (const m of marks) {
    if (!map[m.subject]) map[m.subject] = { total: 0, max: 0 };
    map[m.subject].total += m.score;
    map[m.subject].max += m.max_score;
  }
  return Object.entries(map).map(([subject, { total, max }]) => ({
    subject,
    pct: max > 0 ? Math.round((total / max) * 100) : 0,
  })).sort((a, b) => b.pct - a.pct);
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [fees, setFees] = useState<ParentFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const studentId = user?.student_id || user?.id;

  const fetchAll = useCallback(async () => {
    if (!studentId) return;
    try {
      const [profileData, marksData, attendData, feesData] = await Promise.allSettled([
        directoryService.getStudentProfile(studentId),
        marksService.getMarks(studentId),
        attendanceService.getAttendance(studentId),
        financeService.getParentFees(),
      ]);

      if (profileData.status === 'fulfilled') setProfile(profileData.value);
      if (marksData.status === 'fulfilled') setMarks(marksData.value);
      if (attendData.status === 'fulfilled') setAttendance(attendData.value);
      if (feesData.status === 'fulfilled') setFees(feesData.value);
    } catch (e) {
      // Silent failure — partial data is fine
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAll();
  }, [fetchAll]);

  if (loading) return <LoadingScreen message="Loading your dashboard..." />;

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
      : '';

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
        {/* Greeting Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good {getTimeGreeting()} 👋</Text>
            <Text style={styles.userName}>{displayName}</Text>
            {gradeInfo ? <Text style={styles.gradeInfo}>{gradeInfo}</Text> : null}
          </View>
          <View style={styles.avatarBox}>
            <Text style={styles.avatarText}>{displayName[0]?.toUpperCase()}</Text>
          </View>
        </View>

        {/* Hero Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.heroStat, { backgroundColor: Colors.primary }]}>
            <Text style={styles.heroStatLabel}>Overall Grade</Text>
            <Text style={styles.heroStatValue}>{overallPct}%</Text>
            <Text style={styles.heroStatGrade}>{computeGradeLabel(overallPct)}</Text>
          </View>
          <View style={[styles.heroStat, { backgroundColor: Colors.surfaceElevated }]}>
            <Text style={styles.heroStatLabel}>Attendance</Text>
            <Text style={[styles.heroStatValue, { color: attendancePct >= 75 ? Colors.success : Colors.danger }]}>
              {attendancePct}%
            </Text>
            <Text style={styles.heroStatGrade}>
              {attendancePct >= 75 ? 'Good' : 'Low'}
            </Text>
          </View>
        </View>

        {/* Fee Alerts */}
        {fees.length > 0 && (
          <View>
            <SectionHeader title="Fee Alerts" subtitle="Pending dues" />
            {fees.slice(0, 2).map((fee, i) => {
              const isOverdue = fee.overdue_days > 0;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.feeAlert, { borderColor: isOverdue ? Colors.danger : Colors.warning }]}
                  onPress={() => router.push('/payments')}
                  activeOpacity={0.8}
                >
                  <View style={styles.feeAlertLeft}>
                    <Text style={styles.feeStudentName}>{fee.student_name}</Text>
                    <Text style={styles.feeDueText}>
                      {isOverdue
                        ? `⚠️ Overdue by ${fee.overdue_days} day${fee.overdue_days !== 1 ? 's' : ''}`
                        : `Due in ${Math.abs(fee.overdue_days)} day${Math.abs(fee.overdue_days) !== 1 ? 's' : ''}`}
                    </Text>
                  </View>
                  <Text style={[styles.feeAmount, { color: isOverdue ? Colors.danger : Colors.warning }]}>
                    ₹{fee.due_amount.toLocaleString()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Subject Performance */}
        {subjectPerf.length > 0 && (
          <View>
            <SectionHeader
              title="Subject Performance"
              subtitle={`${marks.length} assessments`}
            />
            <Card>
              {subjectPerf.slice(0, 5).map((s, i) => (
                <View key={i} style={[styles.subjectRow, i < subjectPerf.length - 1 && styles.subjectDivider]}>
                  <View style={styles.subjectMeta}>
                    <Text style={styles.subjectName}>{s.subject}</Text>
                    <Text style={[styles.subjectPct, { color: s.pct >= 70 ? Colors.success : Colors.warning }]}>
                      {s.pct}%
                    </Text>
                  </View>
                  <ProgressBar
                    value={s.pct}
                    color={s.pct >= 70 ? Colors.success : s.pct >= 50 ? Colors.warning : Colors.danger}
                    height={6}
                  />
                </View>
              ))}
            </Card>
          </View>
        )}

        {/* Attendance summary */}
        <View>
          <SectionHeader title="Attendance" subtitle={`${attendance.length} records`} />
          <Card style={styles.attendanceCard}>
            <View style={styles.attendanceCircle}>
              <Text style={styles.attendancePctBig}>{attendancePct}%</Text>
              <Text style={styles.attendancePctLabel}>Presence</Text>
            </View>
            <View style={styles.attendanceLegend}>
              {[
                { label: 'Present', color: Colors.success, count: attendance.filter(r => r.status === 'Present').length },
                { label: 'Absent', color: Colors.danger, count: attendance.filter(r => r.status === 'Absent').length },
                { label: 'Late', color: Colors.warning, count: attendance.filter(r => r.status === 'Late').length },
              ].map((item) => (
                <View key={item.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendLabel}>{item.label}</Text>
                  <Text style={[styles.legendCount, { color: item.color }]}>{item.count}</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, gap: 24, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  userName: { fontSize: 26, fontWeight: '900', color: Colors.text, letterSpacing: -0.8, marginTop: 2 },
  gradeInfo: { fontSize: 13, color: Colors.primary, fontWeight: '600', marginTop: 2 },
  avatarBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '900', color: Colors.white },

  statsRow: { flexDirection: 'row', gap: 12 },
  heroStat: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  heroStatLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroStatValue: { fontSize: 32, fontWeight: '900', color: Colors.white, letterSpacing: -1 },
  heroStatGrade: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },

  feeAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  feeAlertLeft: { gap: 4 },
  feeStudentName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  feeDueText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  feeAmount: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },

  subjectRow: { paddingVertical: 14, gap: 8 },
  subjectDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  subjectMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subjectName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  subjectPct: { fontSize: 13, fontWeight: '800' },

  attendanceCard: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  attendanceCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 3,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendancePctBig: { fontSize: 22, fontWeight: '900', color: Colors.text },
  attendancePctLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },
  attendanceLegend: { flex: 1, gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flex: 1, fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  legendCount: { fontSize: 14, fontWeight: '800' },
});
