import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/shared/constants/Colors';
import { LoadingScreen } from '@/shared/components/ui/Feedback';
import { teacherAttendanceService, type TeacherAttendanceRecord, type TeacherLeaveRecord } from '@/features/teacher-attendance/services/teacherAttendanceService';

type Tab = 'today' | 'history' | 'leave';

const LEAVE_TYPES = ['CASUAL', 'SICK', 'EARNED', 'MATERNITY', 'PATERNITY', 'OTHER'];

const STATUS_COLORS: Record<string, string> = {
  PRESENT: Colors.success,
  ABSENT: Colors.danger,
  HALF_DAY: Colors.warning,
  ON_LEAVE: Colors.info,
};

const LEAVE_STATUS_COLORS: Record<string, string> = {
  PENDING: Colors.warning,
  APPROVED: Colors.success,
  REJECTED: Colors.danger,
  CANCELLED: Colors.textMuted,
};

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function MyAttendanceScreen() {
  const [tab, setTab] = useState<Tab>('today');
  const [refreshing, setRefreshing] = useState(false);

  // ── Today state ──────────────────────────────────────────────────────────
  const [todayRecord, setTodayRecord] = useState<TeacherAttendanceRecord | null | undefined>(undefined);
  const [actionLoading, setActionLoading] = useState(false);

  // ── History state ────────────────────────────────────────────────────────
  const [history, setHistory] = useState<TeacherAttendanceRecord[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const PAGE_SIZE = 20;

  // ── Leave state ──────────────────────────────────────────────────────────
  const [leaves, setLeaves] = useState<TeacherLeaveRecord[]>([]);
  const [leavesTotal, setLeavesTotal] = useState(0);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leavePage, setLeavePage] = useState(0);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveType, setLeaveType] = useState('CASUAL');
  const [leaveTypeIdx, setLeaveTypeIdx] = useState(0);
  const [startDate, setStartDate] = useState(localDateStr(new Date()));
  const [endDate, setEndDate] = useState(localDateStr(new Date()));
  const [reason, setReason] = useState('');
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveError, setLeaveError] = useState('');

  // ── Loaders ──────────────────────────────────────────────────────────────
  const loadToday = useCallback(async () => {
    try {
      const rec = await teacherAttendanceService.getTodayStatus();
      setTodayRecord(rec);
    } catch {
      setTodayRecord(null);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await teacherAttendanceService.getMyHistory({ skip: historyPage * PAGE_SIZE, limit: PAGE_SIZE });
      setHistory(res.items);
      setHistoryTotal(res.total);
    } catch (e) {
      // Treat fetch failure as "no records yet" so the screen renders an
      // empty state instead of throwing an Uncaught (in promise) error.
      console.warn('[my-attendance] history fetch failed', e);
      setHistory([]);
      setHistoryTotal(0);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage]);

  const loadLeaves = useCallback(async () => {
    setLeaveLoading(true);
    try {
      const res = await teacherAttendanceService.getMyLeaves({ skip: leavePage * PAGE_SIZE, limit: PAGE_SIZE });
      setLeaves(res.items);
      setLeavesTotal(res.total);
    } catch (e) {
      console.warn('[my-attendance] leave fetch failed', e);
      setLeaves([]);
      setLeavesTotal(0);
    } finally {
      setLeaveLoading(false);
    }
  }, [leavePage]);

  useEffect(() => { loadToday(); }, [loadToday]);
  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab, loadHistory]);
  useEffect(() => { if (tab === 'leave') loadLeaves(); }, [tab, loadLeaves]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    const current = tab;
    Promise.all([
      current === 'today' ? loadToday() : Promise.resolve(),
      current === 'history' ? loadHistory() : Promise.resolve(),
      current === 'leave' ? loadLeaves() : Promise.resolve(),
    ]).finally(() => setRefreshing(false));
  }, [tab, loadToday, loadHistory, loadLeaves]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleCheckIn = async () => {
    setActionLoading(true);
    try {
      const rec = await teacherAttendanceService.checkIn();
      setTodayRecord(rec);
      Alert.alert('✓ Checked In', `Checked in at ${rec.check_in_time}`);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Check-in failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setActionLoading(true);
    try {
      const rec = await teacherAttendanceService.checkOut();
      setTodayRecord(rec);
      Alert.alert('✓ Checked Out', `Checked out at ${rec.check_out_time}`);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Check-out failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveSubmit = async () => {
    if (!reason.trim()) { setLeaveError('Please provide a reason'); return; }
    if (endDate < startDate) { setLeaveError('End date must be on or after start date'); return; }
    setLeaveSubmitting(true);
    setLeaveError('');
    try {
      await teacherAttendanceService.applyLeave({ leave_type: leaveType, start_date: startDate, end_date: endDate, reason });
      setShowLeaveModal(false);
      setReason('');
      setLeaveType('CASUAL');
      setLeaveTypeIdx(0);
      setStartDate(localDateStr(new Date()));
      setEndDate(localDateStr(new Date()));
      loadLeaves();
    } catch (e: any) {
      setLeaveError(e?.response?.data?.detail || 'Failed to apply leave');
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const handleCancelLeave = (id: number) => {
    Alert.alert('Cancel Leave', 'Are you sure you want to cancel this leave request?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            await teacherAttendanceService.cancelLeave(id);
            loadLeaves();
          } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.detail || 'Could not cancel leave');
          }
        },
      },
    ]);
  };

  const canCheckIn = todayRecord === null;
  const canCheckOut = !!todayRecord && !todayRecord.check_out_time;
  const totalHistoryPages = Math.ceil(historyTotal / PAGE_SIZE);
  const totalLeavePages = Math.ceil(leavesTotal / PAGE_SIZE);

  if (todayRecord === undefined) return <LoadingScreen message="Loading attendance..." />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['today', 'history', 'leave'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'today' ? 'Today' : t === 'history' ? 'History' : 'Leave'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.success} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── TODAY ─────────────────────────────────────────────────────── */}
        {tab === 'today' && (
          <>
            {/* Status card */}
            <Animated.View entering={FadeInDown.springify()} style={styles.card}>
              <Text style={styles.cardLabel}>TODAY'S STATUS</Text>
              {todayRecord === null ? (
                <View style={styles.emptyStatus}>
                  <Ionicons name="time-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyStatusText}>Not checked in yet</Text>
                </View>
              ) : (
                <View style={styles.statusGrid}>
                  <StatusItem label="STATUS">
                    <View style={[styles.badge, { backgroundColor: `${STATUS_COLORS[todayRecord.status]}18`, borderColor: `${STATUS_COLORS[todayRecord.status]}40` }]}>
                      <Text style={[styles.badgeText, { color: STATUS_COLORS[todayRecord.status] }]}>
                        {todayRecord.status.replace('_', ' ')}
                      </Text>
                    </View>
                  </StatusItem>
                  <StatusItem label="CHECK-IN">
                    <Text style={styles.statusValue}>{todayRecord.check_in_time || '—'}</Text>
                  </StatusItem>
                  <StatusItem label="CHECK-OUT">
                    <Text style={styles.statusValue}>{todayRecord.check_out_time || '—'}</Text>
                  </StatusItem>
                  <StatusItem label="DATE">
                    <Text style={styles.statusValue}>{todayRecord.date}</Text>
                  </StatusItem>
                </View>
              )}
            </Animated.View>

            {/* Action buttons */}
            <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.actionRow}>
              <ActionButton
                icon="log-in-outline"
                label="Check In"
                color={Colors.success}
                disabled={!canCheckIn || actionLoading}
                loading={actionLoading && canCheckIn}
                onPress={handleCheckIn}
              />
              <ActionButton
                icon="log-out-outline"
                label="Check Out"
                color={Colors.warning}
                disabled={!canCheckOut || actionLoading}
                loading={actionLoading && !!canCheckOut}
                onPress={handleCheckOut}
              />
            </Animated.View>
          </>
        )}

        {/* ── HISTORY ───────────────────────────────────────────────────── */}
        {tab === 'history' && (
          <>
            {historyLoading ? (
              <View style={styles.centerLoader}><ActivityIndicator color={Colors.success} size="large" /></View>
            ) : history.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No attendance records yet</Text>
              </View>
            ) : (
              <>
                {history.map((row, i) => (
                  <Animated.View key={row.id} entering={FadeInDown.delay(i * 40).springify()} style={styles.historyRow}>
                    <View style={[styles.historyStatus, { backgroundColor: `${STATUS_COLORS[row.status]}18` }]}>
                      <Text style={[styles.historyStatusText, { color: STATUS_COLORS[row.status] }]}>
                        {row.status.replace('_', ' ')}
                      </Text>
                    </View>
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyDate}>{row.date}</Text>
                      <Text style={styles.historyTimes}>
                        In: {row.check_in_time || '—'} · Out: {row.check_out_time || '—'}
                      </Text>
                      {row.remarks ? <Text style={styles.historyRemarks} numberOfLines={1}>{row.remarks}</Text> : null}
                    </View>
                    {row.is_edited ? (
                      <View style={styles.editedBadge}>
                        <Text style={styles.editedText}>Edited</Text>
                      </View>
                    ) : null}
                  </Animated.View>
                ))}

                {/* Pagination */}
                {totalHistoryPages > 1 && (
                  <View style={styles.paginationRow}>
                    <TouchableOpacity
                      style={[styles.pageBtn, historyPage === 0 && styles.pageBtnDisabled]}
                      disabled={historyPage === 0}
                      onPress={() => setHistoryPage(p => p - 1)}
                    >
                      <Ionicons name="chevron-back" size={18} color={historyPage === 0 ? Colors.textMuted : Colors.success} />
                    </TouchableOpacity>
                    <Text style={styles.pageText}>Page {historyPage + 1} / {totalHistoryPages}</Text>
                    <TouchableOpacity
                      style={[styles.pageBtn, historyPage >= totalHistoryPages - 1 && styles.pageBtnDisabled]}
                      disabled={historyPage >= totalHistoryPages - 1}
                      onPress={() => setHistoryPage(p => p + 1)}
                    >
                      <Ionicons name="chevron-forward" size={18} color={historyPage >= totalHistoryPages - 1 ? Colors.textMuted : Colors.success} />
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {/* ── LEAVE ─────────────────────────────────────────────────────── */}
        {tab === 'leave' && (
          <>
            <Animated.View entering={FadeInDown.springify()}>
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => setShowLeaveModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle-outline" size={20} color={Colors.white} />
                <Text style={styles.applyBtnText}>Apply for Leave</Text>
              </TouchableOpacity>
            </Animated.View>

            {leaveLoading ? (
              <View style={styles.centerLoader}><ActivityIndicator color={Colors.success} size="large" /></View>
            ) : leaves.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="document-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No leave requests yet</Text>
              </View>
            ) : (
              <>
                {leaves.map((leave, i) => (
                  <Animated.View key={leave.id} entering={FadeInDown.delay(i * 40).springify()} style={styles.leaveCard}>
                    <View style={styles.leaveHeader}>
                      <View style={styles.leaveTypePill}>
                        <Text style={styles.leaveTypeText}>{leave.leave_type}</Text>
                      </View>
                      <View style={[styles.leaveStatusBadge, { backgroundColor: `${LEAVE_STATUS_COLORS[leave.status]}18`, borderColor: `${LEAVE_STATUS_COLORS[leave.status]}40` }]}>
                        <Text style={[styles.leaveStatusText, { color: LEAVE_STATUS_COLORS[leave.status] }]}>{leave.status}</Text>
                      </View>
                    </View>
                    <Text style={styles.leaveDates}>{leave.start_date} → {leave.end_date} ({leave.days_count} day{leave.days_count !== 1 ? 's' : ''})</Text>
                    <Text style={styles.leaveReason} numberOfLines={2}>{leave.reason}</Text>
                    {leave.rejection_reason ? (
                      <Text style={styles.leaveRejected}>Rejected: {leave.rejection_reason}</Text>
                    ) : null}
                    {leave.status === 'PENDING' && (
                      <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancelLeave(leave.id)} activeOpacity={0.7}>
                        <Text style={styles.cancelBtnText}>Cancel Request</Text>
                      </TouchableOpacity>
                    )}
                  </Animated.View>
                ))}

                {totalLeavePages > 1 && (
                  <View style={styles.paginationRow}>
                    <TouchableOpacity
                      style={[styles.pageBtn, leavePage === 0 && styles.pageBtnDisabled]}
                      disabled={leavePage === 0}
                      onPress={() => setLeavePage(p => p - 1)}
                    >
                      <Ionicons name="chevron-back" size={18} color={leavePage === 0 ? Colors.textMuted : Colors.success} />
                    </TouchableOpacity>
                    <Text style={styles.pageText}>Page {leavePage + 1} / {totalLeavePages}</Text>
                    <TouchableOpacity
                      style={[styles.pageBtn, leavePage >= totalLeavePages - 1 && styles.pageBtnDisabled]}
                      disabled={leavePage >= totalLeavePages - 1}
                      onPress={() => setLeavePage(p => p + 1)}
                    >
                      <Ionicons name="chevron-forward" size={18} color={leavePage >= totalLeavePages - 1 ? Colors.textMuted : Colors.success} />
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Leave Apply Modal ──────────────────────────────────────────── */}
      <Modal visible={showLeaveModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowLeaveModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Apply for Leave</Text>
            <TouchableOpacity onPress={() => { setShowLeaveModal(false); setLeaveError(''); }} activeOpacity={0.7}>
              <Ionicons name="close" size={26} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            {/* Leave type selector */}
            <Text style={styles.fieldLabel}>LEAVE TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
              {LEAVE_TYPES.map((t, idx) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => { setLeaveType(t); setLeaveTypeIdx(idx); }}
                  style={[styles.typeChip, leaveType === t && styles.typeChipActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.typeChipText, leaveType === t && styles.typeChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Start date */}
            <Text style={styles.fieldLabel}>START DATE (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="2026-05-14"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />

            {/* End date */}
            <Text style={styles.fieldLabel}>END DATE (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="2026-05-14"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />

            {/* Reason */}
            <Text style={styles.fieldLabel}>REASON</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={reason}
              onChangeText={setReason}
              placeholder="Provide a brief reason..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            {leaveError ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
                <Text style={styles.errorText}>{leaveError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.submitBtn, leaveSubmitting && { opacity: 0.6 }]}
              onPress={handleLeaveSubmit}
              disabled={leaveSubmitting}
              activeOpacity={0.8}
            >
              {leaveSubmitting
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Text style={styles.submitBtnText}>Submit Leave Request</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatusItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.statusItem}>
      <Text style={styles.statusLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ActionButton({
  icon, label, color, disabled, loading, onPress,
}: {
  icon: string;
  label: string;
  color: string;
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { backgroundColor: color, opacity: disabled ? 0.4 : 1 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator color={Colors.white} size="small" />
        : <Ionicons name={icon as any} size={22} color={Colors.white} />
      }
      <Text style={styles.actionBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 16, paddingBottom: 40 },

  // Tab bar
  tabBar: { flexDirection: 'row', margin: 16, backgroundColor: Colors.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: Colors.border },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.success },
  tabText: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  tabTextActive: { color: Colors.white },

  // Today card
  card: { backgroundColor: Colors.card, borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12, elevation: 3 },
  cardLabel: { fontSize: 10, fontWeight: '900', color: Colors.textMuted, letterSpacing: 1.5, marginBottom: 16 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statusItem: { width: '46%', gap: 4 },
  statusLabel: { fontSize: 10, fontWeight: '900', color: Colors.textMuted, letterSpacing: 1 },
  statusValue: { fontSize: 15, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  emptyStatus: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyStatusText: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },

  // Actions
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 18, shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 10, elevation: 3 },
  actionBtnText: { color: Colors.white, fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },

  // History
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  historyStatus: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, minWidth: 80, alignItems: 'center' },
  historyStatusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  historyInfo: { flex: 1 },
  historyDate: { fontSize: 14, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  historyTimes: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  historyRemarks: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  editedBadge: { backgroundColor: `${Colors.warning}15`, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  editedText: { fontSize: 9, fontWeight: '900', color: Colors.warning, letterSpacing: 0.5 },

  // Leave list
  applyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.success, borderRadius: 18, paddingVertical: 16, marginBottom: 16, shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
  applyBtnText: { color: Colors.white, fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  leaveCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  leaveHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  leaveTypePill: { backgroundColor: Colors.surfaceElevated, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  leaveTypeText: { fontSize: 11, fontWeight: '900', color: Colors.text, letterSpacing: 0.5 },
  leaveStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  leaveStatusText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  leaveDates: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, fontVariant: ['tabular-nums'], marginBottom: 4 },
  leaveReason: { fontSize: 13, color: Colors.text, marginBottom: 6 },
  leaveRejected: { fontSize: 12, color: Colors.danger, marginBottom: 6 },
  cancelBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: `${Colors.danger}40`, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, marginTop: 4 },
  cancelBtnText: { fontSize: 12, fontWeight: '800', color: Colors.danger },

  // Shared
  centerLoader: { paddingVertical: 60, alignItems: 'center' },
  emptyContainer: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 12 },
  pageBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  pageBtnDisabled: { opacity: 0.35 },
  pageText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },

  // Modal
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 20, fontWeight: '900', color: Colors.text, letterSpacing: -0.5 },
  modalScroll: { padding: 20, paddingBottom: 60 },
  fieldLabel: { fontSize: 10, fontWeight: '900', color: Colors.textMuted, letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.text, fontWeight: '600' },
  textarea: { height: 100, paddingTop: 12 },
  typeScroll: { marginBottom: 4 },
  typeChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginRight: 8 },
  typeChipActive: { backgroundColor: Colors.success, borderColor: Colors.success },
  typeChipText: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary },
  typeChipTextActive: { color: Colors.white },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${Colors.danger}10`, borderRadius: 12, padding: 12, marginTop: 12 },
  errorText: { fontSize: 13, fontWeight: '700', color: Colors.danger, flex: 1 },
  submitBtn: { backgroundColor: Colors.success, borderRadius: 18, paddingVertical: 18, alignItems: 'center', marginTop: 24, shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
  submitBtnText: { color: Colors.white, fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
});
