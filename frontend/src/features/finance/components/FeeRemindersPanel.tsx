import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, BellRing, Send, Eye, Loader2, AlertCircle, CheckCircle2,
  Phone, X, Clock, History, Settings as SettingsIcon, MailWarning, Save,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { cn } from '@/shared/lib/utils';
import { financeApi } from '@/features/finance/api';
import type {
  FeeReminderSettings, FeeReminderPreview, FeeReminderDispatchSummary,
  FeeReminderAutomationMode, FeeReminderSettingsUpdate,
} from '@/features/finance/api';
import { getErrorMessage } from '@/shared/lib/errorHandler';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Mon' }, { value: 1, label: 'Tue' }, { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' }, { value: 4, label: 'Fri' }, { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
];

const fmtINR = (n: number) =>
  `₹${(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

export default function FeeRemindersPanel() {
  const [settings, setSettings] = useState<FeeReminderSettings | null>(null);
  const [draft, setDraft] = useState<FeeReminderSettingsUpdate>({});
  const [preview, setPreview] = useState<FeeReminderPreview | null>(null);
  const [lastDispatch, setLastDispatch] = useState<FeeReminderDispatchSummary | null>(null);

  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  // null = closed; 'preview' = read-only eligible list; 'confirm' = send flow.
  const [modal, setModal] = useState<null | 'preview' | 'confirm'>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    setError(null);
    try {
      const s = await financeApi.getFeeReminderSettings();
      setSettings(s);
      setDraft({});
    } catch (err) {
      setError(getErrorMessage(err).message || 'Failed to load reminder settings.');
    } finally {
      setIsLoadingSettings(false);
    }
  }, []);

  const loadPreview = useCallback(async () => {
    setIsLoadingPreview(true);
    setError(null);
    try {
      const p = await financeApi.previewFeeReminders();
      setPreview(p);
    } catch (err) {
      setError(getErrorMessage(err).message || 'Failed to load eligible students.');
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadPreview();
  }, [loadSettings, loadPreview]);

  const merged: FeeReminderSettings | null = useMemo(() => {
    if (!settings) return null;
    return { ...settings, ...draft } as FeeReminderSettings;
  }, [settings, draft]);

  const dirty = useMemo(() => Object.keys(draft).length > 0, [draft]);

  const onSaveSettings = async () => {
    if (!dirty) return;
    setIsSavingSettings(true);
    setError(null);
    try {
      const updated = await financeApi.updateFeeReminderSettings(draft);
      setSettings(updated);
      setDraft({});
      toast.success('Reminder settings saved.');
    } catch (err) {
      const detail = getErrorMessage(err).message || 'Failed to save reminder settings.';
      setError(detail);
      toast.error(detail);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const openPreview = async () => {
    await loadPreview();
    setModal('preview');
  };

  const openConfirm = async () => {
    await loadPreview();
    setModal('confirm');
  };

  const onDispatch = async () => {
    setIsDispatching(true);
    setError(null);
    try {
      const summary = await financeApi.dispatchFeeReminders();
      setLastDispatch(summary);
      setModal(null);
      if (summary.triggered) {
        const reached = summary.notified_fee_ids.length;
        if (!summary.eligible_rows) {
          toast.success('No eligible students right now — nothing to send.');
        } else if (reached === 0) {
          toast.error(
            'Could not reach anyone — no push tokens or calls landed. No one was put under cooldown.',
          );
        } else {
          toast.success(`Reminders delivered for ${reached} fee${reached === 1 ? '' : 's'}.`);
        }
      } else {
        toast.error(summary.skipped_reason || 'Dispatch did not run.');
      }
      // Refresh both: preview (cooldown bumped) + settings (last_run_at).
      await Promise.all([loadPreview(), loadSettings()]);
    } catch (err) {
      const detail = getErrorMessage(err).message || 'Dispatch failed.';
      setError(detail);
      toast.error(detail);
    } finally {
      setIsDispatching(false);
    }
  };

  if (isLoadingSettings) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!merged) {
    return (
      <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-sm font-bold">
        {error || 'Failed to load reminder settings.'}
      </div>
    );
  }

  const mode = merged.automation_mode;
  const overdueCount = preview?.overdue_count ?? 0;
  const overdueStudents = preview?.overdue_unique_students ?? 0;
  const overdueTotal = preview?.overdue_total_due ?? 0;
  const eligible = preview?.eligible_count ?? 0;
  const uniqueStudents = preview?.unique_students ?? 0;
  const inCooldown = preview?.in_cooldown_count ?? 0;
  const noLogin = preview?.no_login_count ?? 0;

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Hero — primary CTA */}
      <div className="premium-glass rounded-2xl sm:rounded-[2rem] p-5 sm:p-8 border border-white/10 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shadow-inner">
              <BellRing className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                Send Fee Reminders
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium max-w-md">
                Pushes a notification (and optional voice call) to every parent
                whose ward has an overdue, unpaid fee. Cooldown protects
                against double-sends within {merged.effective_cooldown_days} days.
              </p>
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <button
              type="button"
              onClick={openPreview}
              disabled={isLoadingPreview}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/10 bg-white/5 text-xs font-black uppercase tracking-widest text-foreground hover:bg-white/10 transition-all disabled:opacity-50"
            >
              {isLoadingPreview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              Preview Eligible
            </button>
            <button
              type="button"
              onClick={openConfirm}
              disabled={isDispatching}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
            >
              {isDispatching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send Fee Reminders
            </button>
          </div>
        </div>

        {/* Live stats from preview — full overdue picture, then the
            subset that the next click would actually notify. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-7">
          <StatTile
            label="Overdue (Total)"
            value={String(overdueCount)}
            tone="rose"
            hint={overdueStudents
              ? `${overdueStudents} unique student${overdueStudents === 1 ? '' : 's'} · ${fmtINR(overdueTotal)} outstanding`
              : undefined}
          />
          <StatTile
            label="Ready to Notify"
            value={String(eligible)}
            tone="emerald"
            hint={uniqueStudents
              ? `${uniqueStudents} student${uniqueStudents === 1 ? '' : 's'} · ${fmtINR(preview?.total_due_amount ?? 0)}`
              : 'No one is notifiable right now'}
          />
          <StatTile
            label="In Cooldown"
            value={String(inCooldown)}
            tone={inCooldown > 0 ? 'amber' : 'emerald'}
            hint={inCooldown > 0
              ? `Recently notified — wait ${merged.effective_cooldown_days}d`
              : undefined}
          />
          <StatTile
            label="No Login Linked"
            value={String(noLogin)}
            tone={noLogin > 0 ? 'rose' : 'emerald'}
            hint={noLogin > 0
              ? 'Push cannot reach them — link a parent/student user'
              : undefined}
          />
        </div>

        {/* Last-run audit */}
        {settings?.last_run_at && (
          <div className="mt-6 flex items-center gap-2 text-xs font-bold text-muted-foreground">
            <History className="w-3.5 h-3.5" />
            Last dispatch: {fmtDateTime(settings.last_run_at)}
            {settings.last_run_triggered_by && (
              <span className={cn(
                'px-2 py-0.5 rounded-full uppercase tracking-widest text-[9px] font-black',
                settings.last_run_triggered_by === 'manual'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-emerald-500/10 text-emerald-600',
              )}>
                {settings.last_run_triggered_by}
              </span>
            )}
          </div>
        )}

        {lastDispatch && <DispatchResultBanner summary={lastDispatch} />}
      </div>

      {/* Automation panel */}
      <div className="premium-glass rounded-2xl sm:rounded-[2rem] p-5 sm:p-8 border border-white/10 shadow-xl">
        <div className="flex items-center gap-3 mb-5">
          <SettingsIcon className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-black uppercase tracking-widest text-foreground">
            Automation Settings
          </h3>
          <span className="text-[10px] font-bold text-muted-foreground italic">
            Default is disabled — admin click-to-send above is always available
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Automation Mode">
            <select
              value={mode}
              onChange={(e) => setDraft((d) => ({ ...d, automation_mode: e.target.value as FeeReminderAutomationMode }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="DISABLED">Disabled (manual only)</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="CUSTOM">Custom (admin-managed)</option>
            </select>
          </Field>

          {mode === 'WEEKLY' && (
            <Field label="Day of Week">
              <select
                value={merged.day_of_week ?? ''}
                onChange={(e) => setDraft((d) => ({
                  ...d,
                  day_of_week: e.target.value === '' ? null : Number(e.target.value),
                }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">— pick a day —</option>
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </Field>
          )}

          {mode === 'MONTHLY' && (
            <Field label="Day of Month (1–28)">
              <input
                type="number"
                min={1}
                max={28}
                value={merged.day_of_month ?? ''}
                onChange={(e) => setDraft((d) => ({
                  ...d,
                  day_of_month: e.target.value === '' ? null : Number(e.target.value),
                }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </Field>
          )}

          <Field label="Send Hour (0–23, institution TZ)">
            <input
              type="number"
              min={0}
              max={23}
              value={merged.send_hour}
              onChange={(e) => setDraft((d) => ({ ...d, send_hour: Number(e.target.value) }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>

          <Field label="Timezone (IANA)">
            <input
              type="text"
              value={merged.timezone}
              onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}
              placeholder="Asia/Kolkata"
              className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>

          <Field
            label={`Overdue Days (blank = default ${settings?.effective_overdue_days})`}
          >
            <input
              type="number"
              min={0}
              value={merged.overdue_days ?? ''}
              onChange={(e) => setDraft((d) => ({
                ...d,
                overdue_days: e.target.value === '' ? null : Number(e.target.value),
              }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>

          <Field
            label={`Cooldown Days (blank = default ${settings?.effective_cooldown_days})`}
          >
            <input
              type="number"
              min={0}
              value={merged.cooldown_days ?? ''}
              onChange={(e) => setDraft((d) => ({
                ...d,
                cooldown_days: e.target.value === '' ? null : Number(e.target.value),
              }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>

          <Field label="Voice Calls">
            <label className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-900/40 border border-white/10 text-sm font-semibold text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={merged.voice_calls_enabled}
                onChange={(e) => setDraft((d) => ({ ...d, voice_calls_enabled: e.target.checked }))}
                className="w-4 h-4"
              />
              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
              Place Twilio call alongside push
            </label>
          </Field>
        </div>

        {mode === 'CUSTOM' && (
          <div className="mt-5 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-bold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            CUSTOM mode is reserved and currently does NOT fire on its own. Use
            DISABLED + the manual button until a custom-schedule editor ships.
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-6">
          {dirty && (
            <button
              type="button"
              onClick={() => setDraft({})}
              className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              Discard
            </button>
          )}
          <button
            type="button"
            onClick={onSaveSettings}
            disabled={!dirty || isSavingSettings}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest shadow-md hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
          >
            {isSavingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>

      {/* Preview / confirmation modal */}
      <ConfirmDispatchModal
        open={modal !== null}
        mode={modal ?? 'confirm'}
        preview={preview}
        isLoadingPreview={isLoadingPreview}
        isDispatching={isDispatching}
        cooldownDays={merged.effective_cooldown_days}
        voiceEnabled={merged.voice_calls_enabled}
        onCancel={() => setModal(null)}
        onConfirm={onDispatch}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function StatTile({
  label, value, tone, hint,
}: { label: string; value: string; tone: 'amber' | 'indigo' | 'rose' | 'emerald'; hint?: string }) {
  const tonal = {
    amber: 'text-amber-600 bg-amber-500/10',
    indigo: 'text-indigo-600 bg-indigo-500/10',
    rose: 'text-rose-600 bg-rose-500/10',
    emerald: 'text-emerald-600 bg-emerald-500/10',
  }[tone];
  return (
    <div className="rounded-xl border border-white/10 p-4 bg-white/5">
      <div className={cn('inline-flex h-7 w-7 rounded-lg items-center justify-center mb-3', tonal)}>
        <Bell className="w-3.5 h-3.5" />
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-xl font-black', tonal.split(' ')[0])}>{value}</p>
      {hint && <p className="text-[10px] font-bold text-muted-foreground/80 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

function RowStatusBadge({ row }: { row: import('@/features/finance/api').FeeReminderEligibleRow }) {
  if (row.eligible_now) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
        <Send className="w-2.5 h-2.5" /> Will send
      </span>
    );
  }
  if (row.in_cooldown) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-600 border border-amber-500/20">
        <Clock className="w-2.5 h-2.5" /> Cooldown
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-600 border border-rose-500/20">
      <AlertCircle className="w-2.5 h-2.5" /> No login
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

interface ConfirmDispatchModalProps {
  open: boolean;
  mode: 'preview' | 'confirm';
  preview: FeeReminderPreview | null;
  isLoadingPreview: boolean;
  isDispatching: boolean;
  cooldownDays: number;
  voiceEnabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDispatchModal({
  open, mode, preview, isLoadingPreview, isDispatching, cooldownDays, voiceEnabled, onCancel, onConfirm,
}: ConfirmDispatchModalProps) {
  const isPreview = mode === 'preview';
  const rows = preview?.rows ?? [];
  const eligibleRows = rows.filter((r) => r.eligible_now);
  const totalDue = preview?.total_due_amount ?? 0;
  const eligibleCount = preview?.eligible_count ?? 0;
  const uniqueStudents = preview?.unique_students ?? 0;
  const overdueCount = preview?.overdue_count ?? 0;
  const inCooldown = preview?.in_cooldown_count ?? 0;
  const noLogin = preview?.no_login_count ?? 0;
  const withoutPhone = eligibleRows.filter((r) => !r.has_phone).length;

  const tree = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={isDispatching ? undefined : onCancel}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-white/10 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-start justify-between p-6 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'h-11 w-11 rounded-2xl flex items-center justify-center',
                  isPreview ? 'bg-indigo-500/10 text-indigo-600' : 'bg-amber-500/10 text-amber-600',
                )}>
                  {isPreview ? <Eye className="w-5 h-5" /> : <MailWarning className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="text-lg font-black text-foreground">
                    {isPreview ? 'Eligible students preview' : 'Send fee reminders?'}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {isPreview
                      ? `Who would be notified if you send now. Rows in cooldown or without a login are shown but skipped.`
                      : `Pushes notifications now. Cooldown blocks re-sends for the next ${cooldownDays} days.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={isDispatching}
                className="p-2 rounded-xl text-muted-foreground hover:bg-slate-100 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ConfirmStat label="Overdue" value={String(overdueCount)} />
                <ConfirmStat label="Will Notify" value={String(eligibleCount)} />
                <ConfirmStat label="Outstanding (eligible)" value={fmtINR(totalDue)} />
                <ConfirmStat label="Voice" value={voiceEnabled ? 'On' : 'Off'} />
              </div>

              {(inCooldown > 0 || noLogin > 0 || (withoutPhone > 0 && voiceEnabled)) && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-bold space-y-1">
                  {inCooldown > 0 && (
                    <p>
                      <Clock className="inline w-3 h-3 mr-1" />
                      {inCooldown} student{inCooldown === 1 ? '' : 's'} recently notified — still
                      in {cooldownDays}-day cooldown, will be skipped.
                    </p>
                  )}
                  {noLogin > 0 && (
                    <p>
                      <AlertCircle className="inline w-3 h-3 mr-1" />
                      {noLogin} student{noLogin === 1 ? '' : 's'} have no parent/student login —
                      no push possible until someone links a User to them.
                    </p>
                  )}
                  {withoutPhone > 0 && voiceEnabled && (
                    <p>
                      <Phone className="inline w-3 h-3 mr-1" />
                      {withoutPhone} of the {eligibleCount} eligible row
                      {withoutPhone === 1 ? '' : 's'} have no phone — voice call will be skipped
                      for them.
                    </p>
                  )}
                </div>
              )}

              {isLoadingPreview && rows.length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center gap-2 text-sm text-muted-foreground font-bold">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading eligible students…
                </div>
              ) : rows.length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-100 dark:bg-white/5 text-center text-sm text-muted-foreground font-bold">
                  No overdue, unpaid fees right now. Nothing to send.
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                  <div className="max-h-[320px] overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-white/5 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 font-black uppercase tracking-widest text-muted-foreground">Student</th>
                          <th className="px-3 py-2 font-black uppercase tracking-widest text-muted-foreground">Class</th>
                          <th className="px-3 py-2 font-black uppercase tracking-widest text-muted-foreground">Due</th>
                          <th className="px-3 py-2 font-black uppercase tracking-widest text-muted-foreground">Overdue</th>
                          <th className="px-3 py-2 font-black uppercase tracking-widest text-muted-foreground">Status</th>
                          <th className="px-3 py-2 font-black uppercase tracking-widest text-muted-foreground">Targets</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr
                            key={r.student_fee_id}
                            className={cn(
                              'border-t border-slate-100 dark:border-white/5',
                              !r.eligible_now && 'opacity-60',
                            )}
                          >
                            <td className="px-3 py-2 font-bold text-foreground">{r.student_name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.class_name || '—'}</td>
                            <td className="px-3 py-2 font-black text-rose-600">{fmtINR(r.due_amount)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.days_overdue}d</td>
                            <td className="px-3 py-2">
                              <RowStatusBadge row={r} />
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              <div className="flex flex-col gap-0.5">
                                {r.has_login_target && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold">
                                    <Send className="w-2.5 h-2.5 text-emerald-600" /> push
                                  </span>
                                )}
                                {r.has_phone && voiceEnabled && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-foreground" title="Number Twilio will dial">
                                    <Phone className="w-2.5 h-2.5 text-indigo-600" /> {r.parent_phone}
                                  </span>
                                )}
                                {!r.has_login_target && !(r.has_phone && voiceEnabled) && (
                                  <span className="text-[10px] opacity-60">—</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-200 dark:border-white/10 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={isDispatching}
                className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-foreground text-xs font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {isPreview ? 'Close' : 'Cancel'}
              </button>
              {!isPreview && (
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={isDispatching || eligibleCount === 0}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest shadow-md hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                >
                  {isDispatching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {eligibleCount === 0
                    ? 'Nothing to send'
                    : `Confirm — notify ${uniqueStudents} student${uniqueStudents === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return tree;
  return createPortal(tree, document.body);
}

function ConfirmStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-100 dark:bg-white/5 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
      <p className="text-base font-black text-foreground">{value}</p>
    </div>
  );
}

function DispatchResultBanner({ summary }: { summary: FeeReminderDispatchSummary }) {
  const pushSent = summary.push?.sent ?? 0;
  const pushFailed = summary.push?.failed ?? 0;
  const tokens = summary.push?.tokens ?? 0;
  const callsPlaced = summary.calls?.placed ?? 0;
  const callsFailed = summary.calls?.failed ?? 0;
  const callsSkipped = summary.calls?.skipped_no_phone ?? 0;
  const noTarget = summary.skipped_no_target ?? 0;
  const deliveryFailed = summary.delivery_failed ?? 0;
  const rowsNotified = summary.notified_fee_ids.length;

  const totalCallAttempts = callsPlaced + callsFailed + callsSkipped;
  const anyFailure = pushFailed > 0 || callsFailed > 0 || noTarget > 0 || deliveryFailed > 0;
  const nothingDelivered = pushSent === 0 && callsPlaced === 0;

  // Pick the headline tone: red if nothing landed, amber if partial, green if all good.
  const tone = nothingDelivered ? 'rose' : anyFailure ? 'amber' : 'emerald';
  const toneStyles = {
    rose: 'bg-rose-500/10 border-rose-500/20 text-rose-700',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-700',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700',
  }[tone];
  const ToneIcon = nothingDelivered ? AlertCircle : anyFailure ? AlertCircle : CheckCircle2;

  return (
    <div className={cn('mt-4 p-4 rounded-xl border space-y-2', toneStyles)}>
      <div className="flex items-start gap-2">
        <ToneIcon className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="text-xs font-bold flex-1 space-y-1">
          <p>
            Run finished — {rowsNotified} row{rowsNotified === 1 ? '' : 's'} marked notified (cooldown bumped).
          </p>
          <p className="font-normal">
            <span className="font-black">Push:</span>{' '}
            {pushSent} sent · {pushFailed} failed · {tokens} token{tokens === 1 ? '' : 's'} reached
            {tokens === 0 && (
              <span className="ml-1 italic opacity-80">— no parent had a registered push token</span>
            )}
          </p>
          <p className="font-normal">
            <span className="font-black">Calls:</span>{' '}
            {callsPlaced} placed · {callsFailed} failed · {callsSkipped} skipped (no phone)
            {totalCallAttempts === 0 && (
              <span className="ml-1 italic opacity-80">— voice calls disabled in settings</span>
            )}
          </p>
          {noTarget > 0 && (
            <p className="font-normal">
              <span className="font-black">{noTarget} student{noTarget === 1 ? '' : 's'} skipped:</span>{' '}
              no parent / student login linked — no push or call possible until you link a user.
            </p>
          )}
          {deliveryFailed > 0 && (
            <p className="font-normal">
              <span className="font-black">{deliveryFailed} student{deliveryFailed === 1 ? '' : 's'} not reached:</span>{' '}
              no push token landed and no call placed — left out of cooldown and will be retried on the next run.
            </p>
          )}
          {summary.first_call_error && (
            <p className="mt-2 px-3 py-2 rounded-lg bg-white/30 dark:bg-black/10 border border-current/20 text-[11px] font-mono">
              <span className="font-bold not-italic uppercase tracking-widest text-[9px]">Call vendor error: </span>
              {summary.first_call_error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
