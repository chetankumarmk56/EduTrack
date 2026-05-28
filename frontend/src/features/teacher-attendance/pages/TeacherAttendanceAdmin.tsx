import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, XCircle, AlertCircle, Loader2, Edit3, X,
  ChevronLeft, ChevronRight, Users, UserCheck, UserX, Clock,
  CalendarOff, FileClock, RefreshCw, Download, Search,
  BarChart3, ClipboardList, Inbox, History, Sparkles,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { teacherAttendanceApi, type TeacherAttendanceRecord, type TeacherLeaveRecord, type AuditLogRecord, type AttendanceSummary } from '@/features/teacher-attendance/api';
import { useApp } from '@/shared/contexts/AppContext';

type Tab = 'attendance' | 'leave' | 'summary' | 'audit';

interface StatusMeta {
  label: string;
  icon: typeof CheckCircle2;
  ring: string;
  dot: string;
}

const STATUS_META: Record<string, StatusMeta> = {
  PRESENT:  { label: 'Present',  icon: CheckCircle2, ring: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  ABSENT:   { label: 'Absent',   icon: XCircle,      ring: 'text-rose-400 bg-rose-500/10 border-rose-500/20',         dot: 'bg-rose-400' },
  HALF_DAY: { label: 'Half Day', icon: Clock,        ring: 'text-amber-400 bg-amber-500/10 border-amber-500/20',      dot: 'bg-amber-400' },
  ON_LEAVE: { label: 'On Leave', icon: CalendarOff,  ring: 'text-blue-400 bg-blue-500/10 border-blue-500/20',         dot: 'bg-blue-400' },
};

const LEAVE_STATUS_META: Record<string, StatusMeta> = {
  PENDING:   { label: 'Pending',   icon: FileClock,    ring: 'text-amber-400 bg-amber-500/10 border-amber-500/20',   dot: 'bg-amber-400' },
  APPROVED:  { label: 'Approved',  icon: CheckCircle2, ring: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  REJECTED:  { label: 'Rejected',  icon: XCircle,      ring: 'text-rose-400 bg-rose-500/10 border-rose-500/20',      dot: 'bg-rose-400' },
  CANCELLED: { label: 'Cancelled', icon: X,            ring: 'text-slate-400 bg-slate-500/10 border-slate-500/20',   dot: 'bg-slate-400' },
};

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE'];
const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function firstDayOfMonth(): string {
  const d = new Date();
  return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

function todayStr(): string {
  return localDateStr(new Date());
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDateStr(d);
}

interface DatePreset {
  key: string;
  label: string;
  from: () => string;
  to: () => string;
}

const DATE_PRESETS: DatePreset[] = [
  { key: 'TODAY', label: 'Today',     from: () => todayStr(),       to: () => todayStr() },
  { key: '7D',    label: 'Last 7',    from: () => daysAgoStr(6),    to: () => todayStr() },
  { key: '30D',   label: 'Last 30',   from: () => daysAgoStr(29),   to: () => todayStr() },
  { key: 'MONTH', label: 'This Month',from: () => firstDayOfMonth(),to: () => todayStr() },
];

function matchPreset(from: string, to: string): string | null {
  for (const p of DATE_PRESETS) {
    if (p.from() === from && p.to() === to) return p.key;
  }
  return null;
}

// Audit snapshots are stored as JSON strings in old_value / new_value.
interface AuditSnapshot {
  date?: string;
  status?: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  remarks?: string | null;
  leave_type?: string;
  start_date?: string;
  end_date?: string;
}

function parseAuditSnapshot(raw: string | null): AuditSnapshot | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

function deriveAuditStatus(log: AuditLogRecord, snap: AuditSnapshot): string {
  if (snap.status && ATTENDANCE_STATUSES.includes(snap.status)) return snap.status;
  if (log.entity_type === 'LEAVE') {
    if (log.action === 'CREATE_LEAVE') return 'ON_LEAVE';
    if (log.action === 'APPROVE') return 'ON_LEAVE';
    return snap.status || '';
  }
  if (log.action === 'CHECK_IN') return 'PRESENT';
  return '';
}

function formatAuditTime(t: string | null | undefined): string {
  if (!t) return '—';
  if (/^\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  const d = new Date(t);
  return Number.isNaN(d.getTime())
    ? t
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatActionLabel(action: string): string {
  return action
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Each check-in/check-out/edit produces its own audit row. For the attendance
// view we merge by (teacher, date).
interface GroupedAuditRow {
  key: string;
  teacher_id: number;
  date: string;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  latestAt: string | null;
  lastAction: string;
  lastChangedBy: string;
}

function groupAuditLogsByDay(logs: AuditLogRecord[]): GroupedAuditRow[] {
  const map = new Map<string, GroupedAuditRow>();
  for (const log of logs) {
    const snap = parseAuditSnapshot(log.new_value) || parseAuditSnapshot(log.old_value) || {};
    const date =
      snap.date || snap.start_date || (log.created_at ? log.created_at.slice(0, 10) : '');
    if (!date) continue;
    const key = `${log.teacher_id}_${date}`;

    let g = map.get(key);
    if (!g) {
      g = {
        key,
        teacher_id: log.teacher_id,
        date,
        status: '',
        check_in_time: null,
        check_out_time: null,
        latestAt: log.created_at,
        lastAction: log.action,
        lastChangedBy: log.changed_by_name,
      };
      map.set(key, g);
    }

    if (!g.status) {
      const inferred = deriveAuditStatus(log, snap);
      if (inferred) g.status = inferred;
    }
    if (!g.check_in_time && snap.check_in_time) g.check_in_time = snap.check_in_time;
    if (!g.check_out_time && snap.check_out_time) g.check_out_time = snap.check_out_time;
  }
  return Array.from(map.values()).sort((a, b) =>
    (b.latestAt || '').localeCompare(a.latestAt || ''),
  );
}

function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface EditModal {
  teacherId: number;
  teacherName: string;
  date: string;
  status: string;
  check_in_time: string;
  check_out_time: string;
  remarks: string;
}

interface RejectModal {
  leaveId: number;
  teacherName: string;
  reason: string;
}

const PAGE_SIZE = 50;

export default function TeacherAttendanceAdmin() {
  const { teacherDirectory } = useApp();
  const [tab, setTab] = useState<Tab>('attendance');

  // Attendance filters
  const [attTeacherId, setAttTeacherId] = useState('');
  const [attDateFrom, setAttDateFrom] = useState(firstDayOfMonth());
  const [attDateTo, setAttDateTo] = useState(todayStr());
  const [attStatus, setAttStatus] = useState('');
  const [attPage, setAttPage] = useState(0);
  const [attendance, setAttendance] = useState<TeacherAttendanceRecord[]>([]);
  const [attTotal, setAttTotal] = useState(0);
  const [attLoading, setAttLoading] = useState(false);

  // Edit modal
  const [editModal, setEditModal] = useState<EditModal | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Leave
  const [leaveTeacherId, setLeaveTeacherId] = useState('');
  const [leaveStatus, setLeaveStatus] = useState('PENDING');
  const [leavePage, setLeavePage] = useState(0);
  const [leaves, setLeaves] = useState<TeacherLeaveRecord[]>([]);
  const [leaveTotal, setLeaveTotal] = useState(0);
  const [leaveLoading, setLeaveLoading] = useState(false);

  // Reject modal
  const [rejectModal, setRejectModal] = useState<RejectModal | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);

  // Summary
  const [summaryTeacherId, setSummaryTeacherId] = useState('');
  const [summaryDateFrom, setSummaryDateFrom] = useState(firstDayOfMonth());
  const [summaryDateTo, setSummaryDateTo] = useState(todayStr());
  const [summary, setSummary] = useState<AttendanceSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Audit
  const [auditTeacherId, setAuditTeacherId] = useState('');
  const [auditPage, setAuditPage] = useState(0);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);

  // Today's snapshot (KPI cards)
  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({ PRESENT: 0, ABSENT: 0, HALF_DAY: 0, ON_LEAVE: 0 });
  const [pendingLeavesCount, setPendingLeavesCount] = useState(0);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // General feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Auto-dismiss feedback after 4s
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const loadSnapshot = useCallback(async () => {
    setSnapshotLoading(true);
    try {
      const today = todayStr();
      const [todayRes, pendingRes] = await Promise.all([
        teacherAttendanceApi.adminListAttendance({ date_from: today, date_to: today, limit: 500 }),
        teacherAttendanceApi.adminListLeaves({ status: 'PENDING', limit: 1 }),
      ]);
      const counts: Record<string, number> = { PRESENT: 0, ABSENT: 0, HALF_DAY: 0, ON_LEAVE: 0 };
      for (const r of todayRes.items) {
        if (counts[r.status] != null) counts[r.status] += 1;
      }
      setTodayCounts(counts);
      setPendingLeavesCount(pendingRes.total);
    } catch {
      // Snapshot is best-effort; primary data loads still run.
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  useEffect(() => { loadSnapshot(); }, [loadSnapshot]);

  const loadAttendance = useCallback(async () => {
    setAttLoading(true);
    try {
      const res = await teacherAttendanceApi.adminListAttendance({
        teacher_id: attTeacherId ? Number(attTeacherId) : undefined,
        date_from: attDateFrom || undefined,
        date_to: attDateTo || undefined,
        status: attStatus || undefined,
        skip: attPage * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setAttendance(res.items);
      setAttTotal(res.total);
    } finally {
      setAttLoading(false);
    }
  }, [attTeacherId, attDateFrom, attDateTo, attStatus, attPage]);

  const loadLeaves = useCallback(async () => {
    setLeaveLoading(true);
    try {
      const res = await teacherAttendanceApi.adminListLeaves({
        teacher_id: leaveTeacherId ? Number(leaveTeacherId) : undefined,
        status: leaveStatus || undefined,
        skip: leavePage * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setLeaves(res.items);
      setLeaveTotal(res.total);
    } finally {
      setLeaveLoading(false);
    }
  }, [leaveTeacherId, leaveStatus, leavePage]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const data = await teacherAttendanceApi.adminGetSummary({
        teacher_id: summaryTeacherId ? Number(summaryTeacherId) : undefined,
        date_from: summaryDateFrom || undefined,
        date_to: summaryDateTo || undefined,
      });
      setSummary(data);
    } finally {
      setSummaryLoading(false);
    }
  }, [summaryTeacherId, summaryDateFrom, summaryDateTo]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await teacherAttendanceApi.adminGetAuditLogs({
        teacher_id: auditTeacherId ? Number(auditTeacherId) : undefined,
        skip: auditPage * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setAuditLogs(res.items);
      setAuditTotal(res.total);
    } finally {
      setAuditLoading(false);
    }
  }, [auditTeacherId, auditPage]);

  useEffect(() => { if (tab === 'attendance') loadAttendance(); }, [tab, loadAttendance]);
  useEffect(() => { if (tab === 'leave') loadLeaves(); }, [tab, loadLeaves]);
  useEffect(() => { if (tab === 'summary') loadSummary(); }, [tab, loadSummary]);
  useEffect(() => { if (tab === 'audit') loadAudit(); }, [tab, loadAudit]);

  const handleEdit = async () => {
    if (!editModal) return;
    setEditLoading(true);
    setEditError(null);
    try {
      await teacherAttendanceApi.adminEditAttendance(editModal.teacherId, {
        date: editModal.date,
        status: editModal.status,
        check_in_time: editModal.check_in_time || undefined,
        check_out_time: editModal.check_out_time || undefined,
        remarks: editModal.remarks || undefined,
      });
      setEditModal(null);
      loadAttendance();
      loadSnapshot();
      setFeedback({ type: 'success', msg: 'Attendance updated successfully' });
    } catch (e: any) {
      setEditError(e?.response?.data?.detail || 'Update failed');
    } finally {
      setEditLoading(false);
    }
  };

  const handleApprove = async (leaveId: number) => {
    try {
      await teacherAttendanceApi.adminApproveLeave(leaveId);
      loadLeaves();
      loadSnapshot();
      setFeedback({ type: 'success', msg: 'Leave approved' });
    } catch (e: any) {
      setFeedback({ type: 'error', msg: e?.response?.data?.detail || 'Action failed' });
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setRejectLoading(true);
    try {
      await teacherAttendanceApi.adminRejectLeave(rejectModal.leaveId, rejectModal.reason || undefined);
      setRejectModal(null);
      loadLeaves();
      loadSnapshot();
      setFeedback({ type: 'success', msg: 'Leave rejected' });
    } catch (e: any) {
      setFeedback({ type: 'error', msg: e?.response?.data?.detail || 'Action failed' });
    } finally {
      setRejectLoading(false);
    }
  };

  const openEditModal = (row: TeacherAttendanceRecord) => {
    setEditModal({
      teacherId: row.teacher_id,
      teacherName: row.teacher_name,
      date: row.date,
      status: row.status,
      check_in_time: row.check_in_time || '',
      check_out_time: row.check_out_time || '',
      remarks: row.remarks || '',
    });
    setEditError(null);
  };

  const totalAttPages = Math.ceil(attTotal / PAGE_SIZE);
  const totalLeavePages = Math.ceil(leaveTotal / PAGE_SIZE);
  const totalAuditPages = Math.ceil(auditTotal / PAGE_SIZE);

  const totalStaff = teacherDirectory.length;
  const todayPresent = todayCounts.PRESENT + todayCounts.HALF_DAY;
  const todayAttendancePct = totalStaff > 0 ? Math.round((todayPresent / totalStaff) * 100) : 0;

  const exportAttendance = () => {
    downloadCSV(
      `staff-attendance-${attDateFrom}_${attDateTo}.csv`,
      ['Teacher', 'Date', 'Status', 'Check-In', 'Check-Out', 'Remarks', 'Edited'],
      attendance.map(r => [r.teacher_name, r.date, r.status, r.check_in_time, r.check_out_time, r.remarks, r.is_edited ? 'Yes' : 'No']),
    );
  };

  const exportLeaves = () => {
    downloadCSV(
      `staff-leaves-${leaveStatus || 'ALL'}.csv`,
      ['Teacher', 'Leave Type', 'Start', 'End', 'Days', 'Status', 'Reason', 'Approved By', 'Rejection Reason'],
      leaves.map(l => [l.teacher_name, l.leave_type, l.start_date, l.end_date, l.days_count, l.status, l.reason, l.approved_by_name, l.rejection_reason]),
    );
  };

  const exportSummary = () => {
    downloadCSV(
      `staff-summary-${summaryDateFrom}_${summaryDateTo}.csv`,
      ['Teacher', 'Present', 'Absent', 'Half Day', 'On Leave', 'Total Days', 'Attendance %'],
      summary.map(r => {
        const present = r.present + r.half_day * 0.5;
        const pct = r.total_days > 0 ? Math.round((present / r.total_days) * 100) : 0;
        return [r.teacher_name, r.present, r.absent, r.half_day, r.on_leave, r.total_days, pct];
      }),
    );
  };

  return (
    <div className="space-y-6 pb-20">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-primary text-[10px] font-black uppercase tracking-[0.4em] bg-primary/10 px-4 py-2 rounded-full w-fit">
            Staff Management
          </p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-foreground leading-none">
            Staff <span className="text-primary italic">Attendance</span>
          </h1>
          <p className="text-sm text-slate-400">Track check-ins, manage leave, and audit changes — all updating live.</p>
        </div>
        <button
          onClick={() => { loadSnapshot(); if (tab === 'attendance') loadAttendance(); if (tab === 'leave') loadLeaves(); if (tab === 'summary') loadSummary(); if (tab === 'audit') loadAudit(); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-xs font-black uppercase tracking-widest text-slate-300 hover:text-white hover:border-primary/40 transition-colors"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', snapshotLoading && 'animate-spin')} /> Refresh
        </button>
      </div>

      {/* ── KPI Snapshot ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          icon={Users}
          label="Total Staff"
          value={totalStaff}
          accent="text-slate-200"
          ring="border-white/10"
          tint="from-slate-700/10"
        />
        <KpiCard
          icon={UserCheck}
          label="Present Today"
          value={todayPresent}
          sub={totalStaff > 0 ? `${todayAttendancePct}% of staff` : undefined}
          accent="text-emerald-400"
          ring="border-emerald-500/20"
          tint="from-emerald-500/10"
          loading={snapshotLoading}
        />
        <KpiCard
          icon={UserX}
          label="Absent Today"
          value={todayCounts.ABSENT}
          accent="text-rose-400"
          ring="border-rose-500/20"
          tint="from-rose-500/10"
          loading={snapshotLoading}
        />
        <KpiCard
          icon={CalendarOff}
          label="On Leave Today"
          value={todayCounts.ON_LEAVE}
          accent="text-blue-400"
          ring="border-blue-500/20"
          tint="from-blue-500/10"
          loading={snapshotLoading}
        />
        <KpiCard
          icon={FileClock}
          label="Pending Leaves"
          value={pendingLeavesCount}
          accent="text-amber-400"
          ring="border-amber-500/20"
          tint="from-amber-500/10"
          highlight={pendingLeavesCount > 0}
          onClick={() => { setTab('leave'); setLeaveStatus('PENDING'); setLeavePage(0); }}
          loading={snapshotLoading}
        />
      </div>

      {/* ── Feedback ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={cn(
              "flex items-center gap-3 p-4 rounded-2xl border text-xs font-black uppercase tracking-widest",
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            )}
          >
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {feedback.msg}
            <button onClick={() => setFeedback(null)} className="ml-auto opacity-40 hover:opacity-100"><X className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-900/50 backdrop-blur-md rounded-2xl border border-white/5 shadow-2xl w-fit flex-wrap">
        <TabButton active={tab === 'attendance'} onClick={() => setTab('attendance')} icon={ClipboardList} label="Attendance" />
        <TabButton active={tab === 'leave'}      onClick={() => setTab('leave')}      icon={CalendarOff}    label="Leave"      badge={pendingLeavesCount} />
        <TabButton active={tab === 'summary'}    onClick={() => setTab('summary')}    icon={BarChart3}      label="Summary" />
        <TabButton active={tab === 'audit'}      onClick={() => setTab('audit')}      icon={History}        label="Audit Log" />
      </div>

      <AnimatePresence mode="wait">
        {/* ── Attendance Tab ──────────────────────────────────────────────── */}
        {tab === 'attendance' && (
          <motion.div key="attendance" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <FilterShell
              count={attTotal}
              onRefresh={loadAttendance}
              onExport={attendance.length ? exportAttendance : undefined}
              loading={attLoading}
            >
              <TeacherFilter
                value={attTeacherId}
                onChange={v => { setAttTeacherId(v); setAttPage(0); }}
                teachers={teacherDirectory as any}
              />
              <FilterSelect
                label="Status"
                value={attStatus}
                onChange={v => { setAttStatus(v); setAttPage(0); }}
                options={ATTENDANCE_STATUSES.map(s => ({ value: s, label: STATUS_META[s].label }))}
                placeholder="All Statuses"
              />
              <DateRangeFilter
                from={attDateFrom}
                to={attDateTo}
                onChange={(f, t) => { setAttDateFrom(f); setAttDateTo(t); setAttPage(0); }}
              />
            </FilterShell>

            {attLoading ? (
              <LoadingBlock />
            ) : attendance.length === 0 ? (
              <EmptyBlock
                icon={ClipboardList}
                title="No attendance records"
                message="Try widening the date range or clearing filters."
              />
            ) : (
              <>
                <div className="overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/60 backdrop-blur-md">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5 bg-slate-900/40">
                        {['Teacher', 'Date', 'Status', 'Check-in', 'Check-out', 'Remarks', 'Edited', ''].map(h => (
                          <th key={h} className="px-4 py-3.5 text-left font-black uppercase tracking-widest text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((row) => (
                        <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                          <td className="px-4 py-3 font-black text-slate-200">
                            <TeacherCell name={row.teacher_name} />
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">{row.date}</td>
                          <td className="px-4 py-3"><StatusPill status={row.status} meta={STATUS_META[row.status]} /></td>
                          <td className="px-4 py-3 font-mono text-slate-300">{row.check_in_time || '—'}</td>
                          <td className="px-4 py-3 font-mono text-slate-300">{row.check_out_time || '—'}</td>
                          <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{row.remarks || '—'}</td>
                          <td className="px-4 py-3">
                            {row.is_edited
                              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase tracking-widest"><Sparkles className="w-3 h-3" /> Yes</span>
                              : <span className="text-slate-500">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => openEditModal(row)}
                              className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-primary/50 hover:bg-primary/10 transition-colors"
                              title="Edit attendance"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={attPage} totalPages={totalAttPages} total={attTotal} pageSize={PAGE_SIZE} onPage={setAttPage} />
              </>
            )}
          </motion.div>
        )}

        {/* ── Leave Tab ───────────────────────────────────────────────────── */}
        {tab === 'leave' && (
          <motion.div key="leave" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <FilterShell
              count={leaveTotal}
              onRefresh={loadLeaves}
              onExport={leaves.length ? exportLeaves : undefined}
              loading={leaveLoading}
            >
              <TeacherFilter
                value={leaveTeacherId}
                onChange={v => { setLeaveTeacherId(v); setLeavePage(0); }}
                teachers={teacherDirectory as any}
              />
              <ChipGroup
                label="Status"
                value={leaveStatus}
                onChange={v => { setLeaveStatus(v); setLeavePage(0); }}
                options={[{ value: '', label: 'All' }, ...LEAVE_STATUSES.map(s => ({ value: s, label: LEAVE_STATUS_META[s].label }))]}
              />
            </FilterShell>

            {leaveLoading ? (
              <LoadingBlock />
            ) : leaves.length === 0 ? (
              <EmptyBlock
                icon={Inbox}
                title="No leave requests"
                message={leaveStatus ? `No ${LEAVE_STATUS_META[leaveStatus]?.label.toLowerCase()} requests right now.` : 'No leave records match the filters.'}
              />
            ) : (
              <>
                <div className="space-y-3">
                  {leaves.map((leave) => {
                    const meta = LEAVE_STATUS_META[leave.status];
                    return (
                      <motion.div
                        key={leave.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="group p-5 rounded-2xl bg-slate-900/60 border border-white/5 hover:border-white/15 transition-colors"
                      >
                        <div className="flex flex-col md:flex-row md:items-start gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <TeacherCell name={leave.teacher_name} dense />
                              <StatusPill status={leave.status} meta={meta} />
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest border border-white/10 rounded-full px-2 py-0.5">{leave.leave_type}</span>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap text-xs">
                              <span className="font-mono text-slate-300">{leave.start_date} → {leave.end_date}</span>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{leave.days_count} day{leave.days_count !== 1 ? 's' : ''}</span>
                            </div>
                            <p className="text-sm text-slate-300/90 leading-relaxed">{leave.reason}</p>
                            {leave.rejection_reason && (
                              <p className="text-xs text-rose-400 bg-rose-500/5 border border-rose-500/15 rounded-lg px-3 py-2">
                                <span className="font-black uppercase tracking-widest text-[10px] mr-2">Rejection</span>{leave.rejection_reason}
                              </p>
                            )}
                            {leave.approved_by_name && (
                              <p className="text-[10px] uppercase tracking-widest font-black text-slate-500">
                                {leave.status === 'APPROVED' ? 'Approved' : 'Reviewed'} by {leave.approved_by_name}
                              </p>
                            )}
                          </div>
                          {leave.status === 'PENDING' && (
                            <div className="flex gap-2 shrink-0">
                              <button
                                onClick={() => handleApprove(leave.id)}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                              </button>
                              <button
                                onClick={() => setRejectModal({ leaveId: leave.id, teacherName: leave.teacher_name, reason: '' })}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
                              >
                                <XCircle className="w-3.5 h-3.5" /> Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                <Pagination page={leavePage} totalPages={totalLeavePages} total={leaveTotal} pageSize={PAGE_SIZE} onPage={setLeavePage} />
              </>
            )}
          </motion.div>
        )}

        {/* ── Summary Tab ─────────────────────────────────────────────────── */}
        {tab === 'summary' && (
          <motion.div key="summary" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <FilterShell
              count={summary.length}
              onRefresh={loadSummary}
              onExport={summary.length ? exportSummary : undefined}
              loading={summaryLoading}
            >
              <TeacherFilter
                value={summaryTeacherId}
                onChange={setSummaryTeacherId}
                teachers={teacherDirectory as any}
              />
              <DateRangeFilter
                from={summaryDateFrom}
                to={summaryDateTo}
                onChange={(f, t) => { setSummaryDateFrom(f); setSummaryDateTo(t); }}
              />
            </FilterShell>

            {summaryLoading ? (
              <LoadingBlock />
            ) : summary.length === 0 ? (
              <EmptyBlock icon={BarChart3} title="No data in this range" message="Pick a different range or check that staff have logged attendance." />
            ) : (
              <div className="overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/60 backdrop-blur-md">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5 bg-slate-900/40">
                      {['Teacher', 'Present', 'Absent', 'Half Day', 'On Leave', 'Total', 'Attendance %'].map(h => (
                        <th key={h} className="px-4 py-3.5 text-left font-black uppercase tracking-widest text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row) => {
                      const present = row.present + row.half_day * 0.5;
                      const pct = row.total_days > 0 ? Math.round((present / row.total_days) * 100) : 0;
                      const barColor = pct >= 90 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-500' : 'bg-rose-500';
                      return (
                        <tr key={row.teacher_id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                          <td className="px-4 py-3 font-black text-slate-200"><TeacherCell name={row.teacher_name} /></td>
                          <td className="px-4 py-3 text-emerald-400 font-black">{row.present}</td>
                          <td className="px-4 py-3 text-rose-400 font-black">{row.absent}</td>
                          <td className="px-4 py-3 text-amber-400 font-black">{row.half_day}</td>
                          <td className="px-4 py-3 text-blue-400 font-black">{row.on_leave}</td>
                          <td className="px-4 py-3 text-slate-300 font-black">{row.total_days}</td>
                          <td className="px-4 py-3 min-w-[160px]">
                            <div className="flex items-center gap-2.5">
                              <div className="flex-1 h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
                                <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="font-mono font-black text-slate-200 w-9 text-right">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Audit Log Tab ───────────────────────────────────────────────── */}
        {tab === 'audit' && (
          <motion.div key="audit" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <FilterShell
              count={auditTotal}
              onRefresh={loadAudit}
              loading={auditLoading}
            >
              <TeacherFilter
                value={auditTeacherId}
                onChange={v => { setAuditTeacherId(v); setAuditPage(0); }}
                teachers={teacherDirectory as any}
              />
            </FilterShell>

            {auditLoading ? (
              <LoadingBlock />
            ) : auditLogs.length === 0 ? (
              <EmptyBlock icon={History} title="No audit history" message="Edits, check-ins, and leave actions will appear here." />
            ) : (
              <>
                <div className="overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/60 backdrop-blur-md">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5 bg-slate-900/40">
                        {['Date', 'Teacher', 'Action', 'Status', 'Check-In', 'Check-Out', 'Changed By'].map(h => (
                          <th key={h} className="px-4 py-3.5 text-left font-black uppercase tracking-widest text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupAuditLogsByDay(auditLogs).map((row) => {
                        const teacher = teacherDirectory.find((t: any) => t.id === row.teacher_id);
                        const status = row.status || (row.check_in_time ? 'PRESENT' : '');
                        const meta = STATUS_META[status];
                        return (
                          <tr key={row.key} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                            <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">
                              {row.date ? new Date(row.date).toLocaleDateString() : '—'}
                            </td>
                            <td className="px-4 py-3 font-black text-slate-200">
                              <TeacherCell name={teacher?.name || `Teacher #${row.teacher_id}`} />
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.03] text-[10px] font-black uppercase tracking-widest text-slate-300">
                                {formatActionLabel(row.lastAction)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {meta
                                ? <StatusPill status={status} meta={meta} />
                                : <span className="text-slate-500">—</span>}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">{formatAuditTime(row.check_in_time)}</td>
                            <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">{formatAuditTime(row.check_out_time)}</td>
                            <td className="px-4 py-3 text-slate-400">{row.lastChangedBy || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination page={auditPage} totalPages={totalAuditPages} total={auditTotal} pageSize={PAGE_SIZE} onPage={setAuditPage} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Edit Attendance Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {editModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-lg p-8 rounded-3xl bg-slate-900 border border-white/10 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black">Edit Attendance</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="font-black text-slate-200">{editModal.teacherName}</span> · {editModal.date}
                  </p>
                </div>
                <button onClick={() => setEditModal(null)} className="opacity-40 hover:opacity-100"><X className="w-5 h-5" /></button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Status</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ATTENDANCE_STATUSES.map(s => {
                      const m = STATUS_META[s];
                      const Icon = m.icon;
                      const active = editModal.status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setEditModal(prev => prev ? { ...prev, status: s } : prev)}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest transition-all',
                            active ? m.ring + ' scale-[1.02]' : 'border-white/10 text-slate-400 hover:text-white hover:border-white/30'
                          )}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Check-in</label>
                    <input
                      type="time"
                      value={editModal.check_in_time}
                      onChange={e => setEditModal(m => m ? { ...m, check_in_time: e.target.value } : null)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Check-out</label>
                    <input
                      type="time"
                      value={editModal.check_out_time}
                      onChange={e => setEditModal(m => m ? { ...m, check_out_time: e.target.value } : null)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Remarks</label>
                  <textarea
                    value={editModal.remarks}
                    onChange={e => setEditModal(m => m ? { ...m, remarks: e.target.value } : null)}
                    rows={2}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50 resize-none"
                    placeholder="Optional note…"
                  />
                </div>
                {editError && (
                  <div className="flex items-center gap-2 text-rose-400 text-xs font-black">
                    <AlertCircle className="w-4 h-4" /> {editError}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleEdit}
                  disabled={editLoading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-60"
                >
                  {editLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Save
                </button>
                <button onClick={() => setEditModal(null)} className="px-5 py-2.5 rounded-xl border border-white/10 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reject Leave Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {rejectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-md p-8 rounded-3xl bg-slate-900 border border-white/10 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black">Reject Leave</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{rejectModal.teacherName}</p>
                </div>
                <button onClick={() => setRejectModal(null)} className="opacity-40 hover:opacity-100"><X className="w-5 h-5" /></button>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Reason (optional)</label>
                <textarea
                  value={rejectModal.reason}
                  onChange={e => setRejectModal(m => m ? { ...m, reason: e.target.value } : null)}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50 resize-none"
                  placeholder="Provide a reason for rejection…"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleReject}
                  disabled={rejectLoading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-60"
                >
                  {rejectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Reject
                </button>
                <button onClick={() => setRejectModal(null)} className="px-5 py-2.5 rounded-xl border border-white/10 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, accent, ring, tint, loading, highlight, onClick,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  sub?: string;
  accent: string;
  ring: string;
  tint: string;
  loading?: boolean;
  highlight?: boolean;
  onClick?: () => void;
}) {
  const Wrapper: any = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-slate-900/60 backdrop-blur-md p-4 text-left transition-all',
        ring,
        onClick && 'hover:scale-[1.02] hover:border-white/20 cursor-pointer',
        highlight && 'ring-2 ring-amber-500/30 animate-pulse-slow',
      )}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-br to-transparent opacity-60 pointer-events-none', tint)} />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</p>
          <p className={cn('mt-1 text-3xl font-black tabular-nums', accent)}>
            {loading ? <span className="inline-block w-10 h-7 rounded bg-slate-700/40 animate-pulse" /> : value}
          </p>
          {sub && <p className="text-[10px] text-slate-500 mt-1 font-black uppercase tracking-widest">{sub}</p>}
        </div>
        <Icon className={cn('w-5 h-5 opacity-60', accent)} />
      </div>
    </Wrapper>
  );
}

function TabButton({
  active, onClick, icon: Icon, label, badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CheckCircle2;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300',
        active
          ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105'
          : 'text-slate-400 hover:text-white hover:bg-white/5'
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {badge != null && badge > 0 && (
        <span className={cn(
          'ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1.5 text-[9px] font-black',
          active ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-400'
        )}>{badge}</span>
      )}
    </button>
  );
}

function FilterShell({
  children, count, onRefresh, onExport, loading,
}: {
  children: React.ReactNode;
  count: number;
  onRefresh: () => void;
  onExport?: () => void;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 p-4 rounded-2xl bg-slate-900/60 border border-white/5">
      <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
        {children}
      </div>
      <div className="flex items-end gap-2">
        <div className="hidden sm:flex items-center gap-2 px-3 h-[42px] rounded-xl border border-white/10 bg-slate-800/60 text-[10px] font-black uppercase tracking-widest text-slate-400">
          <span className="text-slate-300 tabular-nums">{count.toLocaleString()}</span> results
        </div>
        <button
          onClick={onRefresh}
          title="Refresh"
          className="h-[42px] w-[42px] grid place-items-center rounded-xl border border-white/10 bg-slate-800/60 text-slate-300 hover:text-white hover:border-white/30 transition-colors"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </button>
        {onExport && (
          <button
            onClick={onExport}
            title="Download CSV"
            className="h-[42px] flex items-center gap-2 px-4 rounded-xl border border-white/10 bg-slate-800/60 text-slate-300 hover:text-white hover:border-white/30 transition-colors text-[10px] font-black uppercase tracking-widest"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-[42px] px-3 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50 min-w-[160px]"
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function TeacherFilter({
  value, onChange, teachers,
}: {
  value: string;
  onChange: (v: string) => void;
  teachers: { id: number; name: string }[];
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selected = useMemo(
    () => teachers.find(t => String(t.id) === value),
    [teachers, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teachers.slice(0, 20);
    return teachers.filter(t => t.name.toLowerCase().includes(q)).slice(0, 20);
  }, [teachers, query]);

  return (
    <div className="flex flex-col gap-1 relative" ref={ref}>
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Teacher</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="h-[42px] flex items-center justify-between gap-2 px-3 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50 min-w-[200px]"
      >
        <span className={cn('truncate', !selected && 'text-slate-400')}>
          {selected ? selected.name : 'All Teachers'}
        </span>
        {selected ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(''); setQuery(''); }}
            className="opacity-50 hover:opacity-100"
            title="Clear"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <Search className="w-3.5 h-3.5 opacity-50" />
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-full left-0 mt-1.5 w-full min-w-[260px] z-30 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-2 max-h-72 overflow-auto"
          >
            <input
              autoFocus
              placeholder="Search teacher…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50 mb-2"
            />
            <button
              onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-colors',
                value === '' ? 'bg-primary/15 text-primary' : 'text-slate-300 hover:bg-white/5'
              )}
            >
              All Teachers
            </button>
            {filtered.map(t => (
              <button
                key={t.id}
                onClick={() => { onChange(String(t.id)); setOpen(false); setQuery(''); }}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg text-xs transition-colors',
                  String(t.id) === value ? 'bg-primary/15 text-primary font-black' : 'text-slate-300 hover:bg-white/5'
                )}
              >
                {t.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-slate-500 text-center">No matches</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DateRangeFilter({
  from, to, onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const activePreset = matchPreset(from, to);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Date Range</label>
      <div className="flex flex-wrap items-center gap-1.5">
        {DATE_PRESETS.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.from(), p.to())}
            className={cn(
              'px-3 h-[42px] rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border',
              activePreset === p.key
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'bg-slate-800 border-white/10 text-slate-400 hover:text-white hover:border-white/30'
            )}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={e => onChange(e.target.value, to)}
            className="h-[42px] px-3 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
          />
          <span className="text-slate-500 text-[10px] font-black">→</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={e => onChange(from, e.target.value)}
            className="h-[42px] px-3 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>
    </div>
  );
}

function ChipGroup({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'px-3 h-[42px] rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border',
              value === o.value
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'bg-slate-800 border-white/10 text-slate-400 hover:text-white hover:border-white/30'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status, meta }: { status: string; meta?: StatusMeta }) {
  if (!meta) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-500/10 border-slate-500/20">
        {status || '—'}
      </span>
    );
  }
  const Icon = meta.icon;
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest',
      meta.ring
    )}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

function TeacherCell({ name, dense }: { name: string; dense?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map(s => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn(
        'rounded-full bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/20 grid place-items-center font-black text-primary',
        dense ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-[11px]'
      )}>
        {initials || '?'}
      </div>
      <span className="truncate">{name}</span>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex items-center justify-center gap-3 text-slate-400 p-10 rounded-3xl border border-white/5 bg-slate-900/40">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-xs font-black uppercase tracking-widest">Loading…</span>
    </div>
  );
}

function EmptyBlock({ icon: Icon, title, message }: { icon: typeof CheckCircle2; title: string; message: string }) {
  return (
    <div className="p-12 rounded-3xl border border-white/5 bg-slate-900/40 text-center space-y-3">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800/80 border border-white/10 grid place-items-center">
        <Icon className="w-6 h-6 text-slate-500" />
      </div>
      <h4 className="text-sm font-black text-slate-200 uppercase tracking-widest">{title}</h4>
      <p className="text-xs text-slate-500 max-w-sm mx-auto">{message}</p>
    </div>
  );
}

function Pagination({
  page, totalPages, total, pageSize, onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) {
    return total > 0 ? (
      <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
        Showing all {total.toLocaleString()} results
      </p>
    ) : null;
  }
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
        Showing <span className="text-slate-300 tabular-nums">{from.toLocaleString()}–{to.toLocaleString()}</span> of <span className="text-slate-300 tabular-nums">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 0}
          className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:hover:border-white/10 transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-black text-slate-300 px-2 tabular-nums">{page + 1} / {totalPages}</span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages - 1}
          className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:hover:border-white/10 transition-all"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
