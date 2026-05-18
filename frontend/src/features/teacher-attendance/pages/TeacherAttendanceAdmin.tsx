import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, XCircle, AlertCircle, Loader2, Edit3, X,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { teacherAttendanceApi, type TeacherAttendanceRecord, type TeacherLeaveRecord, type AuditLogRecord, type AttendanceSummary } from '@/features/teacher-attendance/api';
import { useApp } from '@/shared/contexts/AppContext';

type Tab = 'attendance' | 'leave' | 'summary' | 'audit';

const STATUS_COLORS: Record<string, string> = {
  PRESENT: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  ABSENT: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  HALF_DAY: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  ON_LEAVE: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

const LEAVE_STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  APPROVED: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  REJECTED: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  CANCELLED: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
};

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE'];

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

// Audit snapshots are stored as JSON strings in old_value / new_value.
// The shape varies by action: CHECK_IN → { date, check_in_time }, EDIT → full
// attendance snapshot, LEAVE actions → { leave_type, start_date, end_date, … }.
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
  // Leave-related entries don't carry attendance status — surface the leave state.
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
  // Accept either "HH:MM[:SS]" or a full ISO timestamp.
  if (/^\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  const d = new Date(t);
  return Number.isNaN(d.getTime())
    ? t
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Each check-in/check-out/edit produces its own audit row in the DB. For the
// attendance view we want a single row per (teacher, date), merging the times
// and a single status so one full day = one line item.
interface GroupedAuditRow {
  key: string;
  teacher_id: number;
  date: string;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  latestAt: string | null;
}

function groupAuditLogsByDay(logs: AuditLogRecord[]): GroupedAuditRow[] {
  // Audit log API returns rows newest-first; we walk them in that order and
  // only fill empty fields, so the most-recent value wins per group.
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
  const [attDateTo, setAttDateTo] = useState(localDateStr(new Date()));
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
  const [summaryDateTo, setSummaryDateTo] = useState(localDateStr(new Date()));
  const [summary, setSummary] = useState<AttendanceSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Audit
  const [auditTeacherId, setAuditTeacherId] = useState('');
  const [auditPage, setAuditPage] = useState(0);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);

  // General feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

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

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="space-y-2">
        <p className="text-primary text-[10px] font-black uppercase tracking-[0.4em] bg-primary/10 px-4 py-2 rounded-full w-fit">
          Staff Management
        </p>
        <h1 className="text-5xl font-black tracking-tighter text-foreground leading-none">
          Teacher <span className="text-primary italic">Attendance</span>
        </h1>
      </div>

      {/* Feedback */}
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

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-900/50 backdrop-blur-md rounded-2xl border border-white/5 shadow-2xl w-fit flex-wrap">
        {(['attendance', 'leave', 'summary', 'audit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300",
              tab === t
                ? "bg-primary text-white shadow-lg shadow-primary/20 scale-105"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            {t === 'summary' ? 'Summary' : t === 'audit' ? 'Audit Log' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Attendance Tab ────────────────────────────────────────────────── */}
        {tab === 'attendance' && (
          <motion.div key="attendance" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 p-4 rounded-2xl bg-slate-900/60 border border-white/5">
              <FilterSelect
                label="Teacher"
                value={attTeacherId}
                onChange={v => { setAttTeacherId(v); setAttPage(0); }}
                options={teacherDirectory.map((t: any) => ({ value: String(t.id), label: t.name }))}
                placeholder="All Teachers"
              />
              <FilterSelect
                label="Status"
                value={attStatus}
                onChange={v => { setAttStatus(v); setAttPage(0); }}
                options={ATTENDANCE_STATUSES.map(s => ({ value: s, label: s.replace('_', ' ') }))}
                placeholder="All Statuses"
              />
              <DateFilter label="From" value={attDateFrom} onChange={v => { setAttDateFrom(v); setAttPage(0); }} />
              <DateFilter label="To" value={attDateTo} onChange={v => { setAttDateTo(v); setAttPage(0); }} />
              <button onClick={loadAttendance} className="self-end px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-widest hover:scale-105 transition-all">
                Apply
              </button>
            </div>

            {attLoading ? (
              <LoadingRow />
            ) : attendance.length === 0 ? (
              <EmptyRow message="No attendance records found" />
            ) : (
              <>
                <div className="overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/60 backdrop-blur-md">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5">
                        {['Teacher', 'Date', 'Status', 'Check-in', 'Check-out', 'Remarks', 'Edited', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left font-black uppercase tracking-widest text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((row) => (
                        <tr key={row.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 font-black text-slate-200">{row.teacher_name}</td>
                          <td className="px-4 py-3 font-mono text-slate-300">{row.date}</td>
                          <td className="px-4 py-3">
                            <span className={cn("px-2 py-0.5 rounded border font-black uppercase tracking-widest", STATUS_COLORS[row.status])}>
                              {row.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-300">{row.check_in_time || '—'}</td>
                          <td className="px-4 py-3 font-mono text-slate-300">{row.check_out_time || '—'}</td>
                          <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{row.remarks || '—'}</td>
                          <td className="px-4 py-3">
                            {row.is_edited ? <span className="text-amber-400 font-black uppercase">Yes</span> : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => openEditModal(row)}
                              className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-primary/50 transition-colors"
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
                <Pagination page={attPage} totalPages={totalAttPages} onPage={setAttPage} />
              </>
            )}
          </motion.div>
        )}

        {/* ── Leave Tab ─────────────────────────────────────────────────────── */}
        {tab === 'leave' && (
          <motion.div key="leave" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="flex flex-wrap gap-3 p-4 rounded-2xl bg-slate-900/60 border border-white/5">
              <FilterSelect
                label="Teacher"
                value={leaveTeacherId}
                onChange={v => { setLeaveTeacherId(v); setLeavePage(0); }}
                options={teacherDirectory.map((t: any) => ({ value: String(t.id), label: t.name }))}
                placeholder="All Teachers"
              />
              <FilterSelect
                label="Status"
                value={leaveStatus}
                onChange={v => { setLeaveStatus(v); setLeavePage(0); }}
                options={['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map(s => ({ value: s, label: s }))}
                placeholder="All Statuses"
              />
              <button onClick={loadLeaves} className="self-end px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-widest hover:scale-105 transition-all">
                Apply
              </button>
            </div>

            {leaveLoading ? (
              <LoadingRow />
            ) : leaves.length === 0 ? (
              <EmptyRow message="No leave requests found" />
            ) : (
              <>
                <div className="space-y-3">
                  {leaves.map((leave) => (
                    <div key={leave.id} className="p-5 rounded-2xl bg-slate-900/60 border border-white/5">
                      <div className="flex flex-col md:flex-row md:items-start gap-4">
                        <div className="flex-1 space-y-1.5">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-black text-slate-200">{leave.teacher_name}</span>
                            <span className={cn("px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest", LEAVE_STATUS_COLORS[leave.status])}>
                              {leave.status}
                            </span>
                            <span className="text-xs font-black text-slate-400 uppercase">{leave.leave_type}</span>
                          </div>
                          <p className="text-xs font-mono text-slate-400">{leave.start_date} → {leave.end_date} ({leave.days_count} day{leave.days_count !== 1 ? 's' : ''})</p>
                          <p className="text-sm text-slate-400">{leave.reason}</p>
                          {leave.rejection_reason && (
                            <p className="text-xs text-rose-400">Rejection: {leave.rejection_reason}</p>
                          )}
                          {leave.approved_by_name && (
                            <p className="text-xs text-slate-500">By: {leave.approved_by_name}</p>
                          )}
                        </div>
                        {leave.status === 'PENDING' && (
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => handleApprove(leave.id)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => setRejectModal({ leaveId: leave.id, teacherName: leave.teacher_name, reason: '' })}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination page={leavePage} totalPages={totalLeavePages} onPage={setLeavePage} />
              </>
            )}
          </motion.div>
        )}

        {/* ── Summary Tab ───────────────────────────────────────────────────── */}
        {tab === 'summary' && (
          <motion.div key="summary" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="flex flex-wrap gap-3 p-4 rounded-2xl bg-slate-900/60 border border-white/5">
              <FilterSelect
                label="Teacher"
                value={summaryTeacherId}
                onChange={setSummaryTeacherId}
                options={teacherDirectory.map((t: any) => ({ value: String(t.id), label: t.name }))}
                placeholder="All Teachers"
              />
              <DateFilter label="From" value={summaryDateFrom} onChange={setSummaryDateFrom} />
              <DateFilter label="To" value={summaryDateTo} onChange={setSummaryDateTo} />
              <button onClick={loadSummary} className="self-end px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-widest hover:scale-105 transition-all">
                Apply
              </button>
            </div>

            {summaryLoading ? (
              <LoadingRow />
            ) : summary.length === 0 ? (
              <EmptyRow message="No data in this range" />
            ) : (
              <div className="overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/60 backdrop-blur-md">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5">
                      {['Teacher', 'Present', 'Absent', 'Half Day', 'On Leave', 'Total Days'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-black uppercase tracking-widest text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row) => (
                      <tr key={row.teacher_id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-black text-slate-200">{row.teacher_name}</td>
                        <td className="px-4 py-3 text-emerald-400 font-black">{row.present}</td>
                        <td className="px-4 py-3 text-rose-400 font-black">{row.absent}</td>
                        <td className="px-4 py-3 text-amber-400 font-black">{row.half_day}</td>
                        <td className="px-4 py-3 text-blue-400 font-black">{row.on_leave}</td>
                        <td className="px-4 py-3 text-slate-300 font-black">{row.total_days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Audit Log Tab ─────────────────────────────────────────────────── */}
        {tab === 'audit' && (
          <motion.div key="audit" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="flex flex-wrap gap-3 p-4 rounded-2xl bg-slate-900/60 border border-white/5">
              <FilterSelect
                label="Teacher"
                value={auditTeacherId}
                onChange={v => { setAuditTeacherId(v); setAuditPage(0); }}
                options={teacherDirectory.map((t: any) => ({ value: String(t.id), label: t.name }))}
                placeholder="All Teachers"
              />
              <button onClick={loadAudit} className="self-end px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-widest hover:scale-105 transition-all">
                Apply
              </button>
            </div>

            {auditLoading ? (
              <LoadingRow />
            ) : auditLogs.length === 0 ? (
              <EmptyRow message="No audit logs found" />
            ) : (
              <>
                <div className="overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/60 backdrop-blur-md">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5">
                        {['Date', 'Teacher', 'Subject', 'Status', 'Check-In', 'Check-Out'].map(h => (
                          <th key={h} className="px-4 py-3 text-left font-black uppercase tracking-widest text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupAuditLogsByDay(auditLogs).map((row) => {
                        const teacher = teacherDirectory.find((t: any) => t.id === row.teacher_id);
                        const subjects = Array.from(
                          new Set(
                            (teacher?.assignments || [])
                              .map((a: any) => a.subject_ref?.name || a.subject)
                              .filter(Boolean) as string[],
                          ),
                        );
                        // A teacher who has checked in for the day is PRESENT, even if
                        // the only audit entry we have is the CHECK_IN itself.
                        const status =
                          row.status || (row.check_in_time ? 'PRESENT' : '');
                        const statusColor =
                          STATUS_COLORS[status] ||
                          'text-slate-400 bg-slate-500/10 border-slate-500/20';
                        return (
                          <tr key={row.key} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">
                              {row.date ? new Date(row.date).toLocaleDateString() : '—'}
                            </td>
                            <td className="px-4 py-3 font-black text-slate-200">
                              {teacher?.name || `Teacher #${row.teacher_id}`}
                            </td>
                            <td className="px-4 py-3 text-slate-300">
                              {subjects.length > 0 ? subjects.join(', ') : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {status ? (
                                <span className={cn('px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest', statusColor)}>
                                  {status.replace('_', ' ')}
                                </span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">
                              {formatAuditTime(row.check_in_time)}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">
                              {formatAuditTime(row.check_out_time)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination page={auditPage} totalPages={totalAuditPages} onPage={setAuditPage} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Edit Attendance Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {editModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg p-8 rounded-3xl bg-slate-900 border border-white/10 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black">Edit Attendance</h3>
                  <p className="text-xs text-slate-400">{editModal.teacherName} — {editModal.date}</p>
                </div>
                <button onClick={() => setEditModal(null)} className="opacity-40 hover:opacity-100"><X className="w-5 h-5" /></button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Status</label>
                  <select
                    value={editModal.status}
                    onChange={e => setEditModal(m => m ? { ...m, status: e.target.value } : null)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
                  >
                    {ATTENDANCE_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Check-in Time (HH:MM)</label>
                    <input
                      type="time"
                      value={editModal.check_in_time}
                      onChange={e => setEditModal(m => m ? { ...m, check_in_time: e.target.value } : null)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Check-out Time (HH:MM)</label>
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

      {/* ── Reject Leave Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {rejectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md p-8 rounded-3xl bg-slate-900 border border-white/10 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black">Reject Leave</h3>
                  <p className="text-xs text-slate-400">{rejectModal.teacherName}</p>
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
                  placeholder="Provide a reason for rejection..."
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

// ── Shared sub-components ──────────────────────────────────────────────────

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
        className="px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50 min-w-[140px]"
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</label>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
      />
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-3 text-slate-400 py-8">
      <Loader2 className="w-5 h-5 animate-spin" /> Loading...
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="p-8 rounded-3xl bg-slate-900/60 border border-white/5 text-center text-slate-400 text-sm">
      {message}
    </div>
  );
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center gap-3 justify-center pt-2">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/30 disabled:opacity-30 transition-all"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-xs font-black text-slate-400">Page {page + 1} / {totalPages}</span>
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages - 1}
        className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/30 disabled:opacity-30 transition-all"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
