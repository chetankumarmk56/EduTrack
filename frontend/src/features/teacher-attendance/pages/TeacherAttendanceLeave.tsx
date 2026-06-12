import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogIn, LogOut, Plus, X,
  CheckCircle2, AlertCircle, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { localDateStr, parseLocalDate } from '@/shared/lib/format';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import { teacherAttendanceApi, type TeacherAttendanceRecord, type TeacherLeaveRecord } from '@/features/teacher-attendance/api';
import { SkeletonStatGrid, SkeletonTable, SkeletonList } from '@/shared/components/ui/Skeleton';
import DatePicker from '@/shared/components/ui/DatePicker';
import { useToast } from '@/shared/components/ui/Toast';

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

type Tab = 'today' | 'history' | 'leave';

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

const LEAVE_TYPES = ['CASUAL', 'SICK', 'EARNED', 'MATERNITY', 'PATERNITY', 'OTHER'];

export default function TeacherAttendanceLeave() {
  const [tab, setTab] = useState<Tab>('today');
  const toast = useToast();

  // Today state
  const [todayRecord, setTodayRecord] = useState<TeacherAttendanceRecord | null | undefined>(undefined);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // History state — windowed view (last N days, Sundays excluded, gaps auto-filled)
  const [historyRecords, setHistoryRecords] = useState<TeacherAttendanceRecord[]>([]);
  const [historyLeaves, setHistoryLeaves] = useState<TeacherLeaveRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [rangeDays, setRangeDays] = useState<30 | 60 | 90>(30);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const PAGE_SIZE = 20;

  // Leave state
  const [leaves, setLeaves] = useState<TeacherLeaveRecord[]>([]);
  const [leavesTotal, setLeavesTotal] = useState(0);
  const [leavePage, setLeavePage] = useState(0);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: 'CASUAL',
    start_date: localDateStr(new Date()),
    end_date: localDateStr(new Date()),
    reason: '',
  });
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const loadToday = useCallback(async () => {
    try {
      const rec = await teacherAttendanceApi.getTodayStatus();
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
        teacherAttendanceApi.getMyHistory({ date_from, date_to, limit: 200 }),
        teacherAttendanceApi.getMyLeaves({ limit: 200 }),
      ]);
      setHistoryRecords(recs.items);
      setHistoryLeaves(lvs.items);
    } finally {
      setHistoryLoading(false);
    }
  }, [rangeDays]);

  const loadLeaves = useCallback(async () => {
    setLeaveLoading(true);
    try {
      const res = await teacherAttendanceApi.getMyLeaves({ skip: leavePage * PAGE_SIZE, limit: PAGE_SIZE });
      setLeaves(res.items);
      setLeavesTotal(res.total);
    } finally {
      setLeaveLoading(false);
    }
  }, [leavePage]);

  useEffect(() => { loadToday(); }, [loadToday]);
  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab, loadHistory]);
  useEffect(() => { if (tab === 'leave') loadLeaves(); }, [tab, loadLeaves]);

  const handleCheckIn = async () => {
    setIsActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const rec = await teacherAttendanceApi.checkIn();
      setTodayRecord(rec);
      setActionSuccess('Checked in successfully!');
    } catch (e) {
      setActionError(getErrorMessage(e).message || 'Check-in failed');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setIsActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const rec = await teacherAttendanceApi.checkOut();
      setTodayRecord(rec);
      setActionSuccess('Checked out successfully!');
    } catch (e) {
      setActionError(getErrorMessage(e).message || 'Check-out failed');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLeaveSubmit = async () => {
    if (!leaveForm.reason.trim()) {
      setLeaveError('Please provide a reason for the leave');
      return;
    }
    if (leaveForm.end_date < leaveForm.start_date) {
      setLeaveError('End date must be on or after start date');
      return;
    }
    setLeaveSubmitting(true);
    setLeaveError(null);
    try {
      await teacherAttendanceApi.applyLeave(leaveForm);
      setShowLeaveForm(false);
      setLeaveForm({ leave_type: 'CASUAL', start_date: localDateStr(new Date()), end_date: localDateStr(new Date()), reason: '' });
      loadLeaves();
    } catch (e) {
      setLeaveError(getErrorMessage(e).message || 'Failed to apply leave');
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const handleCancelLeave = async (id: number) => {
    try {
      await teacherAttendanceApi.cancelLeave(id);
      loadLeaves();
      toast.success('Leave cancelled');
    } catch (e) {
      toast.error('Could not cancel leave', getErrorMessage(e).message || 'Please try again.');
    }
  };

  const canCheckIn = todayRecord === null;
  const canCheckOut = todayRecord !== null && todayRecord !== undefined && !todayRecord.check_out_time;
  const totalLeavePages = Math.ceil(leavesTotal / PAGE_SIZE);

  // Build a continuous list of working days (Sundays excluded) for the window,
  // overlaying real records and falling back to auto-ABSENT or ON_LEAVE.
  const mergedHistory = useMemo<HistoryRow[]>(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const recordsByDate = new Map<string, TeacherAttendanceRecord>();
    historyRecords.forEach(r => recordsByDate.set(r.date, r));

    // Approved leaves expand into per-day coverage so we can show ON_LEAVE for
    // each day they cover when no attendance record exists.
    const leaveByDate = new Map<string, TeacherLeaveRecord>();
    historyLeaves
      .filter(l => l.status === 'APPROVED')
      .forEach(l => {
        const s = parseLocalDate(l.start_date);
        const e = parseLocalDate(l.end_date);
        for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
          leaveByDate.set(localDateStr(d), l);
        }
      });

    const rows: HistoryRow[] = [];
    const cursor = new Date(startOfToday);
    for (let i = 0; i < rangeDays; i++) {
      // Sunday = non-working day per the requirement; skip entirely.
      if (cursor.getDay() !== 0) {
        const ds = localDateStr(cursor);
        const rec = recordsByDate.get(ds);
        if (rec) {
          rows.push({
            date: ds,
            status: rec.status,
            check_in_time: rec.check_in_time,
            check_out_time: rec.check_out_time,
            remarks: rec.remarks,
            is_edited: !!rec.is_edited,
            source: 'recorded',
          });
        } else if (cursor < startOfToday) {
          // Past working day with no record — fill in.
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
        // For today with no record we deliberately skip — the day isn't over yet.
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return rows;
  }, [historyRecords, historyLeaves, rangeDays]);

  const historySummary = useMemo(() => ({
    workingDays: mergedHistory.length,
    present: mergedHistory.filter(r => r.status === 'PRESENT').length,
    absent: mergedHistory.filter(r => r.status === 'ABSENT').length,
    onLeave: mergedHistory.filter(r => r.status === 'ON_LEAVE').length,
    halfDay: mergedHistory.filter(r => r.status === 'HALF_DAY').length,
  }), [mergedHistory]);

  const filteredHistory = useMemo(
    () => statusFilter === 'ALL' ? mergedHistory : mergedHistory.filter(r => r.status === statusFilter),
    [mergedHistory, statusFilter],
  );

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="space-y-2">
        <p className="text-primary text-[10px] font-black uppercase tracking-[0.4em] bg-primary/10 px-4 py-2 rounded-full w-fit">
          My Work Record
        </p>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-foreground leading-none">
          Attendance <span className="text-primary italic">&amp; Leave</span>
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 sm:gap-2 p-1 sm:p-1.5 bg-slate-900/50 backdrop-blur-md rounded-2xl border border-white/5 shadow-2xl w-fit overflow-x-auto max-w-full">
        {(['today', 'history', 'leave'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300",
              tab === t
                ? "bg-primary text-white shadow-lg shadow-primary/20 scale-105"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            {t === 'today' ? "Today" : t === 'history' ? "History" : "Leave"}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'today' && (
          <motion.div key="today" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            {/* Status card */}
            <div className="p-5 sm:p-8 rounded-3xl bg-slate-900/60 border border-white/5 backdrop-blur-md">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Today's Status</h2>

              {todayRecord === undefined ? (
                <SkeletonStatGrid count={4} />
              ) : todayRecord === null ? (
                <p className="text-slate-400 text-sm">You haven't checked in yet today.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Stat label="Status" value={
                    <span className={cn("px-3 py-1 rounded-lg border text-xs font-black uppercase tracking-widest", STATUS_COLORS[todayRecord.status])}>
                      {todayRecord.status.replace('_', ' ')}
                    </span>
                  } />
                  <Stat label="Check-in" value={todayRecord.check_in_time || '—'} />
                  <Stat label="Check-out" value={todayRecord.check_out_time || '—'} />
                  <Stat label="Date" value={todayRecord.date} />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-4">
              <ActionButton
                icon={LogIn}
                label="Check In"
                disabled={!canCheckIn || isActionLoading}
                onClick={handleCheckIn}
                loading={isActionLoading && canCheckIn}
                color="emerald"
              />
              <ActionButton
                icon={LogOut}
                label="Check Out"
                disabled={!canCheckOut || isActionLoading}
                onClick={handleCheckOut}
                loading={isActionLoading && canCheckOut}
                color="amber"
              />
            </div>

            {/* Feedback banners */}
            <AnimatePresence>
              {actionSuccess && (
                <Banner type="success" message={actionSuccess} onClose={() => setActionSuccess(null)} />
              )}
              {actionError && (
                <Banner type="error" message={actionError} onClose={() => setActionError(null)} />
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {tab === 'history' && (
          <motion.div key="history" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            {/* Summary tiles */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryTile label="Working days" value={historySummary.workingDays} tone="slate" />
              <SummaryTile label="Present" value={historySummary.present} tone="emerald" />
              <SummaryTile label="Absent" value={historySummary.absent} tone="rose" />
              <SummaryTile label="On leave" value={historySummary.onLeave} tone="blue" />
              <SummaryTile label="Half day" value={historySummary.halfDay} tone="amber" />
            </div>

            {/* Range + status filters */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-2 p-1 bg-slate-900/50 border border-white/5 rounded-xl w-fit">
                {([30, 60, 90] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setRangeDays(n)}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                      rangeDays === n ? "bg-primary text-white" : "text-slate-400 hover:text-white hover:bg-white/5",
                    )}
                  >
                    Last {n} days
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(['ALL', 'PRESENT', 'ABSENT', 'ON_LEAVE', 'HALF_DAY'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all",
                      statusFilter === s
                        ? s === 'ABSENT'   ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                          : s === 'PRESENT'  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : s === 'ON_LEAVE' ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                          : s === 'HALF_DAY' ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          : 'bg-primary/15 border-primary/40 text-primary'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    {s === 'ALL' ? 'All' : s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Sundays are excluded. Past working days with no check-in are auto-marked absent unless covered by an approved leave.
            </p>

            {/* Table */}
            {historyLoading ? (
              <SkeletonTable rows={6} cols={5} />
            ) : filteredHistory.length === 0 ? (
              <div className="p-8 rounded-3xl bg-slate-900/60 border border-white/5 text-center text-slate-400">
                No matching records in the selected window.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/60 backdrop-blur-md">
                <table className="w-full min-w-[680px] text-xs">
                  <thead>
                    <tr className="border-b border-white/5">
                      {['Date', 'Status', 'Check-in', 'Check-out', 'Remarks', 'Source'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-black uppercase tracking-widest text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((row) => {
                      const d = parseLocalDate(row.date);
                      const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });
                      return (
                        <tr key={row.date} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 font-mono text-slate-300">
                            {row.date}
                            <span className="ml-2 text-[10px] text-slate-500 uppercase">{dayLabel}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn("px-2 py-0.5 rounded border font-black uppercase tracking-widest", STATUS_COLORS[row.status])}>
                              {row.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-300">{row.check_in_time || '—'}</td>
                          <td className="px-4 py-3 font-mono text-slate-300">{row.check_out_time || '—'}</td>
                          <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{row.remarks || '—'}</td>
                          <td className="px-4 py-3">
                            {row.source === 'recorded' ? (
                              row.is_edited
                                ? <span className="text-amber-400 text-[10px] font-black uppercase tracking-widest">Edited</span>
                                : <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Recorded</span>
                            ) : row.source === 'auto-absent' ? (
                              <span className="text-rose-400/80 text-[10px] font-black uppercase tracking-widest">Auto-marked</span>
                            ) : (
                              <span className="text-blue-400/80 text-[10px] font-black uppercase tracking-widest">From leave</span>
                            )}
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

        {tab === 'leave' && (
          <motion.div key="leave" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-slate-400 text-xs uppercase tracking-widest font-black">My Leave Requests</p>
              <button
                onClick={() => setShowLeaveForm(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" /> Apply Leave
              </button>
            </div>

            {/* Leave form modal */}
            <AnimatePresence>
              {showLeaveForm && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="p-5 sm:p-6 rounded-3xl bg-slate-900/80 border border-white/10 backdrop-blur-md space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest">Apply for Leave</h3>
                    <button onClick={() => { setShowLeaveForm(false); setLeaveError(null); }} className="opacity-40 hover:opacity-100">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Leave Type</label>
                      <select
                        value={leaveForm.leave_type}
                        onChange={e => setLeaveForm(f => ({ ...f, leave_type: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
                      >
                        {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="hidden md:block" />
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Start Date</label>
                      <DatePicker
                        value={leaveForm.start_date}
                        max={leaveForm.end_date || undefined}
                        placeholder="Start date"
                        onChange={v => setLeaveForm(f => ({ ...f, start_date: v }))}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">End Date</label>
                      <DatePicker
                        value={leaveForm.end_date}
                        min={leaveForm.start_date || undefined}
                        placeholder="End date"
                        onChange={v => setLeaveForm(f => ({ ...f, end_date: v }))}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Reason</label>
                      <textarea
                        value={leaveForm.reason}
                        onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50 resize-none"
                        placeholder="Provide a brief reason..."
                      />
                    </div>
                  </div>

                  {leaveError && (
                    <div className="flex items-center gap-2 text-rose-400 text-xs font-black">
                      <AlertCircle className="w-4 h-4 shrink-0" /> {leaveError}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleLeaveSubmit}
                      disabled={leaveSubmitting}
                      className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-60"
                    >
                      {leaveSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Submit
                    </button>
                    <button onClick={() => { setShowLeaveForm(false); setLeaveError(null); }} className="px-5 py-2.5 rounded-xl border border-white/10 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Leave list */}
            {leaveLoading ? (
              <SkeletonList rows={4} />
            ) : leaves.length === 0 ? (
              <div className="p-8 rounded-3xl bg-slate-900/60 border border-white/5 text-center text-slate-400">
                No leave requests found.
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {leaves.map((leave) => (
                    <div key={leave.id} className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className={cn("px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest", LEAVE_STATUS_COLORS[leave.status])}>
                            {leave.status}
                          </span>
                          <span className="text-xs font-black text-slate-300 uppercase tracking-widest">{leave.leave_type}</span>
                          <span className="text-xs text-slate-500 font-mono">{leave.start_date} → {leave.end_date}</span>
                          <span className="text-[10px] text-slate-500 font-black">{leave.days_count} day{leave.days_count !== 1 ? 's' : ''}</span>
                        </div>
                        <p className="text-sm text-slate-400">{leave.reason}</p>
                        {leave.rejection_reason && (
                          <p className="text-xs text-rose-400">Rejected: {leave.rejection_reason}</p>
                        )}
                      </div>
                      {leave.status === 'PENDING' && (
                        <button
                          onClick={() => handleCancelLeave(leave.id)}
                          className="shrink-0 px-4 py-2 rounded-xl border border-rose-500/30 text-rose-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/10 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <Pagination page={leavePage} totalPages={totalLeavePages} onPage={setLeavePage} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────

function SummaryTile({
  label, value, tone,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'emerald' | 'rose' | 'blue' | 'amber';
}) {
  const toneClasses = {
    slate: 'bg-slate-500/10 border-slate-500/20 text-slate-200',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
    rose: 'bg-rose-500/10 border-rose-500/20 text-rose-300',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
  }[tone];
  return (
    <div className={cn('p-4 rounded-2xl border backdrop-blur-md', toneClasses)}>
      <p className="text-2xl font-black tabular-nums leading-none">{value}</p>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mt-1.5">{label}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <div className="text-sm font-black text-slate-200">{value}</div>
    </div>
  );
}

function ActionButton({
  icon: Icon, label, disabled, onClick, loading, color,
}: {
  icon: React.ElementType;
  label: string;
  disabled: boolean;
  onClick: () => void;
  loading: boolean;
  color: 'emerald' | 'amber';
}) {
  const colorMap = {
    emerald: 'bg-emerald-600 shadow-emerald-500/20 hover:bg-emerald-500',
    amber: 'bg-amber-600 shadow-amber-500/20 hover:bg-amber-500',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2 px-8 py-3 rounded-2xl text-white text-xs font-black uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100",
        colorMap[color]
      )}
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
      {label}
    </button>
  );
}

function Banner({ type, message, onClose }: { type: 'success' | 'error'; message: string; onClose: () => void }) {
  const colors = type === 'success'
    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
    : 'bg-rose-500/10 border-rose-500/20 text-rose-400';
  const Icon = type === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn("flex items-center gap-3 p-4 rounded-2xl border text-xs font-black uppercase tracking-widest", colors)}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {message}
      <button onClick={onClose} className="ml-auto opacity-40 hover:opacity-100"><X className="w-4 h-4" /></button>
    </motion.div>
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
