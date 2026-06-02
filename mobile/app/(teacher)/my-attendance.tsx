import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { CalendarPicker } from '@/shared/components/ui/CalendarPicker';
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

/** Parse "YYYY-MM-DD" as a local Date (avoids UTC-shift bugs). */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

type DisplayStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE';
type StatusFilter = 'ALL' | DisplayStatus;

interface HistoryRow {
  date: string;
  status: DisplayStatus;
  check_in_time: string | null;
  check_out_time: string | null;
  remarks: string | null;
  is_edited: boolean;
  source: 'recorded' | 'auto-absent' | 'leave';
}

export default function MyAttendanceScreen() {
  const [tab, setTab] = useState<Tab>('today');
  const [refreshing, setRefreshing] = useState(false);

  // ── Today state ──────────────────────────────────────────────────────────
  const [todayRecord, setTodayRecord] = useState<TeacherAttendanceRecord | null | undefined>(undefined);
  const [actionLoading, setActionLoading] = useState(false);

  // ── History state — windowed view (last N days, Sundays excluded, gaps auto-filled) ──
  const [historyRecords, setHistoryRecords] = useState<TeacherAttendanceRecord[]>([]);
  const [historyLeaves, setHistoryLeaves] = useState<TeacherLeaveRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [rangeDays, setRangeDays] = useState<30 | 60 | 90>(30);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
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
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - (rangeDays - 1));
      const date_from = localDateStr(start);
      const date_to = localDateStr(today);
      const [recs, lvs] = await Promise.all([
        teacherAttendanceService.getMyHistory({ date_from, date_to, limit: 200 }),
        teacherAttendanceService.getMyLeaves({ limit: 200 }),
      ]);
      setHistoryRecords(recs.items);
      setHistoryLeaves(lvs.items);
    } catch (e) {
      // Treat fetch failure as "no records yet" so the screen renders an
      // empty state instead of throwing an Uncaught (in promise) error.
      console.warn('[my-attendance] history fetch failed', e);
      setHistoryRecords([]);
      setHistoryLeaves([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [rangeDays]);

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
  const totalLeavePages = Math.ceil(leavesTotal / PAGE_SIZE);

  // Build a continuous list of working days (Sundays excluded) for the window,
  // overlaying real records and falling back to auto-ABSENT or ON_LEAVE.
  const mergedHistory = useMemo<HistoryRow[]>(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const recordsByDate = new Map<string, TeacherAttendanceRecord>();
    historyRecords.forEach((r) => recordsByDate.set(r.date, r));

    const leaveByDate = new Map<string, TeacherLeaveRecord>();
    historyLeaves
      .filter((l) => l.status === 'APPROVED')
      .forEach((l) => {
        const s = parseLocalDate(l.start_date);
        const e = parseLocalDate(l.end_date);
        for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
          leaveByDate.set(localDateStr(d), l);
        }
      });

    const rows: HistoryRow[] = [];
    const cursor = new Date(startOfToday);
    for (let i = 0; i < rangeDays; i++) {
      // Sunday = non-working day; skip entirely.
      if (cursor.getDay() !== 0) {
        const ds = localDateStr(cursor);
        const rec = recordsByDate.get(ds);
        if (rec) {
          rows.push({
            date: ds,
            status: rec.status as DisplayStatus,
            check_in_time: rec.check_in_time,
            check_out_time: rec.check_out_time,
            remarks: rec.remarks,
            is_edited: !!rec.is_edited,
            source: 'recorded',
          });
        } else if (cursor < startOfToday) {
          const lv = leaveByDate.get(ds);
          if (lv) {
            rows.push({
              date: ds,
              status: 'ON_LEAVE',
              check_in_time: null,
              check_out_time: null,
              remarks: `${lv.leave_type} leave (approved)`,
              is_edited: false,
              source: 'leave',
            });
          } else {
            rows.push({
              date: ds,
              status: 'ABSENT',
              check_in_time: null,
              check_out_time: null,
              remarks: 'No check-in recorded',
              is_edited: false,
              source: 'auto-absent',
            });
          }
        }
        // Today with no record is deliberately skipped — the day isn't over.
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return rows;
  }, [historyRecords, historyLeaves, rangeDays]);

  const historySummary = useMemo(() => ({
    workingDays: mergedHistory.length,
    present: mergedHistory.filter((r) => r.status === 'PRESENT').length,
    absent: mergedHistory.filter((r) => r.status === 'ABSENT').length,
    onLeave: mergedHistory.filter((r) => r.status === 'ON_LEAVE').length,
    halfDay: mergedHistory.filter((r) => r.status === 'HALF_DAY').length,
  }), [mergedHistory]);

  const filteredHistory = useMemo(
    () => statusFilter === 'ALL' ? mergedHistory : mergedHistory.filter((r) => r.status === statusFilter),
    [mergedHistory, statusFilter],
  );

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
            {/* Summary tiles */}
            <View style={styles.summaryGrid}>
              <SummaryTile label="Working days" value={historySummary.workingDays} color={Colors.text} bg={Colors.surfaceElevated} />
              <SummaryTile label="Present" value={historySummary.present} color={Colors.success} bg={`${Colors.success}15`} />
              <SummaryTile label="Absent" value={historySummary.absent} color={Colors.danger} bg={`${Colors.danger}15`} />
              <SummaryTile label="On leave" value={historySummary.onLeave} color={Colors.info} bg={`${Colors.info}15`} />
              <SummaryTile label="Half day" value={historySummary.halfDay} color={Colors.warning} bg={`${Colors.warning}15`} />
            </View>

            {/* Range selector */}
            <View style={styles.rangeRow}>
              {([30, 60, 90] as const).map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.rangeChip, rangeDays === n && styles.rangeChipActive]}
                  onPress={() => setRangeDays(n)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.rangeChipText, rangeDays === n && styles.rangeChipTextActive]}>
                    Last {n} days
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Status filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              {(['ALL', 'PRESENT', 'ABSENT', 'ON_LEAVE', 'HALF_DAY'] as const).map((s) => {
                const active = statusFilter === s;
                const baseColor =
                  s === 'PRESENT'  ? Colors.success :
                  s === 'ABSENT'   ? Colors.danger :
                  s === 'ON_LEAVE' ? Colors.info :
                  s === 'HALF_DAY' ? Colors.warning :
                  Colors.primary;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.filterChip,
                      active && { backgroundColor: `${baseColor}18`, borderColor: `${baseColor}55` },
                    ]}
                    onPress={() => setStatusFilter(s)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.filterChipText, active && { color: baseColor }]}>
                      {s === 'ALL' ? 'All' : s.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.historyCaption}>
              Sundays are excluded. Past working days with no check-in are auto-marked absent unless covered by an approved leave.
            </Text>

            {historyLoading ? (
              <View style={styles.centerLoader}><ActivityIndicator color={Colors.success} size="large" /></View>
            ) : filteredHistory.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No matching records in this window</Text>
              </View>
            ) : (
              <>
                {filteredHistory.map((row, i) => {
                  const day = parseLocalDate(row.date).toLocaleDateString(undefined, { weekday: 'short' });
                  const sourceLabel =
                    row.source === 'auto-absent' ? 'Auto-marked' :
                    row.source === 'leave' ? 'From leave' :
                    row.is_edited ? 'Edited' : 'Recorded';
                  const sourceColor =
                    row.source === 'auto-absent' ? Colors.danger :
                    row.source === 'leave' ? Colors.info :
                    row.is_edited ? Colors.warning : Colors.textMuted;
                  return (
                    <Animated.View key={row.date} entering={FadeInDown.delay(i * 25).springify()} style={styles.historyRow}>
                      <View style={[styles.historyStatus, { backgroundColor: `${STATUS_COLORS[row.status]}18` }]}>
                        <Text style={[styles.historyStatusText, { color: STATUS_COLORS[row.status] }]}>
                          {row.status.replace('_', ' ')}
                        </Text>
                      </View>
                      <View style={styles.historyInfo}>
                        <Text style={styles.historyDate}>
                          {row.date}
                          <Text style={styles.historyDayMuted}>  ·  {day}</Text>
                        </Text>
                        <Text style={styles.historyTimes}>
                          In: {row.check_in_time || '—'} · Out: {row.check_out_time || '—'}
                        </Text>
                        {row.remarks ? <Text style={styles.historyRemarks} numberOfLines={1}>{row.remarks}</Text> : null}
                      </View>
                      <View style={[styles.sourceBadge, { backgroundColor: `${sourceColor}15` }]}>
                        <Text style={[styles.sourceBadgeText, { color: sourceColor }]}>{sourceLabel}</Text>
                      </View>
                    </Animated.View>
                  );
                })}
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
            <CalendarPicker
              label="START DATE"
              value={startDate}
              onChange={setStartDate}
              placeholder="Pick a start date"
            />

            {/* End date */}
            <View style={{ marginTop: 16 }}>
              <CalendarPicker
                label="END DATE"
                value={endDate}
                onChange={setEndDate}
                placeholder="Pick an end date"
                minDate={startDate}
              />
            </View>

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

function SummaryTile({
  label, value, color, bg,
}: { label: string; value: number; color: string; bg: string }) {
  return (
    <View style={[styles.summaryTile, { backgroundColor: bg }]}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label.toUpperCase()}</Text>
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
  historyDayMuted: { color: Colors.textMuted, fontWeight: '700' },
  sourceBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  sourceBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },

  // History summary + filters
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  summaryTile: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 95,
    padding: 12,
    borderRadius: 14,
  },
  summaryValue: { fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  summaryLabel: { fontSize: 9, fontWeight: '900', color: Colors.textMuted, letterSpacing: 0.8, marginTop: 4 },
  rangeRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  rangeChip: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  rangeChipActive: { backgroundColor: Colors.success },
  rangeChipText: { fontSize: 11, fontWeight: '900', color: Colors.textMuted, letterSpacing: 0.5 },
  rangeChipTextActive: { color: Colors.white },
  filterScroll: { marginBottom: 12 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  filterChipText: { fontSize: 11, fontWeight: '900', color: Colors.textMuted, letterSpacing: 0.5 },
  historyCaption: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 12, lineHeight: 16 },

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
