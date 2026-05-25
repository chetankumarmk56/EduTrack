import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  CheckCircle2, ChevronRight, Download, ExternalLink,
  FileSearch, FileWarning, HelpCircle, Loader2, NotebookPen, Receipt,
  ShieldCheck, Sparkles, User, X, XCircle, CircleDollarSign,
} from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { manualPaymentsApi } from '../api';
import type { ManualPaymentRequest, ManualPaymentStatus } from '../types';
import { formatDateTime, formatINR } from '../lib/validation';
import StatusBadge from './StatusBadge';
import ScreenshotPreview from './ScreenshotPreview';

interface Props {
  request: ManualPaymentRequest | null;
  onClose: () => void;
  onUpdated: (req: ManualPaymentRequest) => void;
}

type DecisionKey = 'APPROVE' | 'PARTIAL' | 'NEED_VERIFICATION' | 'REJECT' | 'FAIL';

const DECISION_TO_STATUS: Record<DecisionKey, ManualPaymentStatus> = {
  APPROVE: 'APPROVED',
  PARTIAL: 'PARTIAL_PAYMENT',
  NEED_VERIFICATION: 'NEED_VERIFICATION',
  REJECT: 'REJECTED',
  FAIL: 'FAILED',
};

const DECISIONS: Array<{
  key: DecisionKey;
  label: string;
  description: string;
  icon: typeof CheckCircle2;
  tone: 'emerald' | 'sky' | 'indigo' | 'rose' | 'slate';
}> = [
  { key: 'APPROVE', label: 'Approve', description: 'Confirm full receipt and update dues.', icon: CheckCircle2, tone: 'emerald' },
  { key: 'PARTIAL', label: 'Partial Payment', description: 'Approve part of the amount.', icon: CircleDollarSign, tone: 'sky' },
  { key: 'NEED_VERIFICATION', label: 'Need Verification', description: 'Ask the parent for more info.', icon: HelpCircle, tone: 'indigo' },
  { key: 'REJECT', label: 'Reject', description: 'Not received / wrong account.', icon: XCircle, tone: 'rose' },
  { key: 'FAIL', label: 'Mark Failed', description: 'Bank/UPI reports the transaction failed.', icon: FileWarning, tone: 'slate' },
];

const toneClasses: Record<typeof DECISIONS[number]['tone'], string> = {
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
  indigo: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
  rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
  slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30',
};

export default function AdminReviewDrawer({ request, onClose, onUpdated }: Props) {
  const [selectedDecision, setSelectedDecision] = useState<DecisionKey | null>(null);
  const [approvedAmount, setApprovedAmount] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [adminNote, setAdminNote] = useState<string>('');
  const [isDeciding, setIsDeciding] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (request) {
      setSelectedDecision(null);
      setApprovedAmount(String(request.amount ?? ''));
      setRejectionReason('');
      setAdminNote('');
      setNewNote('');
    }
  }, [request?.id]);

  if (!request) return null;

  const handleDecide = async () => {
    if (!selectedDecision) {
      toast.error('Pick a decision before submitting.');
      return;
    }
    const targetStatus = DECISION_TO_STATUS[selectedDecision];
    const payload: Parameters<typeof manualPaymentsApi.decide>[1] = {
      decision: targetStatus,
    };

    if (selectedDecision === 'APPROVE' || selectedDecision === 'PARTIAL') {
      const amt = Number(approvedAmount);
      if (!amt || amt <= 0) {
        toast.error('Enter a valid approved amount.');
        return;
      }
      if (selectedDecision === 'PARTIAL' && amt >= request.amount) {
        toast.error('Partial amount must be less than the submitted amount.');
        return;
      }
      payload.approved_amount = amt;
    }

    if (selectedDecision === 'REJECT' || selectedDecision === 'FAIL') {
      if (!rejectionReason.trim()) {
        toast.error('Add a reason so the parent knows what to do next.');
        return;
      }
      payload.rejection_reason = rejectionReason.trim();
    }

    if (adminNote.trim()) payload.admin_note = adminNote.trim();

    setIsDeciding(true);
    try {
      const updated = await manualPaymentsApi.decide(request.id, payload);
      onUpdated(updated);
      toast.success(`Marked as ${updated.status.replaceAll('_', ' ').toLowerCase()}.`);
    } catch {
      // toast already shown
    } finally {
      setIsDeciding(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setIsAddingNote(true);
    try {
      const updated = await manualPaymentsApi.addNote(request.id, newNote.trim());
      onUpdated(updated);
      setNewNote('');
      toast.success('Note added.');
    } catch {
      // toast already shown
    } finally {
      setIsAddingNote(false);
    }
  };

  const downloadReceipt = () => {
    const url = manualPaymentsApi.receiptUrl(request.id);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  const isFinalised = ['APPROVED', 'PARTIAL_PAYMENT'].includes(request.status);

  return (
    <>
      <AnimatePresence>
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.aside
          key="drawer"
          initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 280, damping: 30 }}
          className="fixed right-0 top-0 bottom-0 z-50 w-full sm:max-w-2xl bg-white dark:bg-slate-950 shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <FileSearch className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Review submission #{request.id}
              </p>
              <h3 className="text-base font-black text-foreground truncate">
                {request.student_name} · {request.class_name || '—'}
              </h3>
            </div>
            <StatusBadge status={request.status} size="md" />
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-muted-foreground"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6 custom-scrollbar">
            {/* Key facts */}
            <section className="rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 p-4 sm:p-5 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <KeyValue label="Amount submitted" value={formatINR(request.amount)} highlight />
                <KeyValue label="Approved amount" value={formatINR(request.approved_amount ?? null)} />
                <KeyValue label="Transaction ID / UTR" value={request.transaction_reference} mono />
                <KeyValue label="Transaction time" value={formatDateTime(request.transaction_at)} />
                <KeyValue label="Payer name" value={request.payer_name || '—'} />
                <KeyValue label="Payer UPI" value={request.payer_upi || '—'} mono />
                <KeyValue label="Fee type" value={request.fee_type || 'TUITION'} />
                <KeyValue label="Installment" value={request.installment_label || '—'} />
              </div>
              {request.screenshot_url && (
                <button
                  type="button"
                  onClick={() => setPreviewUrl(request.screenshot_url!)}
                  className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  View screenshot
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
              {request.parent_note && (
                <div className="rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/5 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Parent note
                  </p>
                  <p className="text-xs text-foreground whitespace-pre-line">{request.parent_note}</p>
                </div>
              )}
            </section>

            {/* Verification helper */}
            <section className="rounded-2xl bg-indigo-500/5 border border-indigo-500/20 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 mt-0.5 text-indigo-600" />
                <div className="text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
                  <p className="font-bold uppercase tracking-widest text-[10px] mb-1">
                    Manual verification checklist
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Open the school's UPI / bank app and find the UTR.</li>
                    <li>Match amount, payer name, and time to within a few minutes.</li>
                    <li>If anything is off — mark <strong>Need Verification</strong> or <strong>Reject</strong>.</li>
                    <li>The official receipt is generated only on Approve / Partial.</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Decision section */}
            {!isFinalised && (
              <section className="space-y-4">
                <h4 className="text-sm font-black uppercase tracking-widest text-foreground">
                  Make a decision
                </h4>
                <div className="grid sm:grid-cols-2 gap-2">
                  {DECISIONS.map((d) => {
                    const Icon = d.icon;
                    const isSelected = selectedDecision === d.key;
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setSelectedDecision(d.key)}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-2xl border-2 text-left transition-all',
                          toneClasses[d.tone],
                          isSelected ? 'ring-2 ring-offset-1 ring-current shadow-md scale-[1.01]' : 'opacity-80 hover:opacity-100',
                        )}
                      >
                        <Icon className="w-5 h-5 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-black">{d.label}</p>
                          <p className="text-[11px] font-bold opacity-80">{d.description}</p>
                        </div>
                        {isSelected && <ChevronRight className="ml-auto w-4 h-4 self-center" />}
                      </button>
                    );
                  })}
                </div>

                {(selectedDecision === 'APPROVE' || selectedDecision === 'PARTIAL') && (
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 block">
                      Approved amount (₹)
                    </label>
                    <input
                      type="number"
                      value={approvedAmount}
                      onChange={(e) => setApprovedAmount(e.target.value)}
                      min={1}
                      step="0.01"
                      max={selectedDecision === 'PARTIAL' ? request.amount - 0.01 : undefined}
                      className="w-full rounded-2xl border-2 border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.05] px-4 py-3 text-sm font-bold focus:outline-none focus:border-primary"
                    />
                    {selectedDecision === 'PARTIAL' && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Must be less than ₹{request.amount.toLocaleString('en-IN')}.
                      </p>
                    )}
                  </div>
                )}

                {(selectedDecision === 'REJECT' || selectedDecision === 'FAIL') && (
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 block">
                      Reason for {selectedDecision === 'REJECT' ? 'rejection' : 'failure'}
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={3}
                      maxLength={500}
                      placeholder="Visible to the parent. Be specific so they can fix and resubmit."
                      className="w-full rounded-2xl border-2 border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.05] px-4 py-3 text-sm font-bold focus:outline-none focus:border-primary resize-none"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 block">
                    Internal note (optional, admin-only)
                  </label>
                  <textarea
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    rows={2}
                    maxLength={2000}
                    placeholder="e.g. matched against UPI app screenshot at 10:22 IST"
                    className="w-full rounded-2xl border-2 border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.05] px-4 py-3 text-sm font-bold focus:outline-none focus:border-primary resize-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleDecide}
                  disabled={isDeciding || !selectedDecision}
                  className="w-full inline-flex items-center justify-center gap-3 px-5 py-3.5 rounded-2xl bg-primary text-primary-foreground font-black text-sm uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:scale-100 transition-all"
                >
                  {isDeciding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Confirm decision
                </button>
              </section>
            )}

            {isFinalised && (
              <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 sm:p-5 space-y-3">
                <div className="flex items-start gap-3 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-black uppercase tracking-widest text-[10px] mb-1">Finalised</p>
                    <p>
                      This payment was {request.status === 'APPROVED' ? 'approved' : 'marked partial'} on
                      {' '}{formatDateTime(request.reviewed_at)} by {request.reviewed_by_name || 'an admin'}.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={downloadReceipt}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest shadow-md"
                >
                  <Download className="w-4 h-4" />
                  Download receipt
                </button>
                {request.receipt_number && (
                  <p className="text-[11px] font-mono text-emerald-700/80 dark:text-emerald-300/80">
                    Receipt no. {request.receipt_number}
                  </p>
                )}
              </section>
            )}

            {/* Notes + audit */}
            <section className="space-y-3">
              <h4 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                <NotebookPen className="w-4 h-4 text-primary" />
                Admin notes
              </h4>
              {request.admin_note ? (
                <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-4 text-xs text-foreground whitespace-pre-line">
                  {request.admin_note}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No notes yet.</p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="Append an internal note"
                  className="flex-1 rounded-2xl border-2 border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.05] px-4 py-3 text-xs font-bold focus:outline-none focus:border-primary resize-none"
                />
                <button
                  type="button"
                  onClick={handleAddNote}
                  disabled={isAddingNote || !newNote.trim()}
                  className="px-4 py-3 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                >
                  {isAddingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                </button>
              </div>
            </section>

            <section className="space-y-2">
              <h4 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                Audit trail
              </h4>
              {request.audit_logs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No events yet.</p>
              ) : (
                <ul className="space-y-2">
                  {request.audit_logs.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-start gap-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-3"
                    >
                      <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black uppercase shrink-0">
                        {a.event.slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-foreground">
                          {a.event.replaceAll('_', ' ')}
                          {a.from_status && a.to_status && (
                            <span className="text-muted-foreground font-bold">
                              {' '}· {a.from_status} → {a.to_status}
                            </span>
                          )}
                        </p>
                        {a.message && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 whitespace-pre-line">
                            {a.message}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {a.actor_name || 'System'}
                          {a.actor_role && ` · ${a.actor_role}`} · {formatDateTime(a.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </motion.aside>
      </AnimatePresence>

      <ScreenshotPreview url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </>
  );
}

interface KeyValueProps {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}

function KeyValue({ label, value, highlight, mono }: KeyValueProps) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'text-sm font-bold text-foreground',
          highlight && 'text-base text-primary',
          mono && 'font-mono tracking-tight',
        )}
      >
        {value}
      </p>
    </div>
  );
}

