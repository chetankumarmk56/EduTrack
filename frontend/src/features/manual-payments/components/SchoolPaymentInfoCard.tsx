import { useState } from 'react';
import {
  Copy, CheckCircle2, Landmark, QrCode, Smartphone, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/shared/lib/utils';
import type { SchoolPaymentInfo } from '../types';

interface Props {
  info: SchoolPaymentInfo;
  className?: string;
}

interface CopyRowProps {
  label: string;
  value?: string | null;
  icon?: React.ReactNode;
  mono?: boolean;
}

function CopyRow({ label, value, icon, mono }: CopyRowProps) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 sm:p-4 rounded-2xl bg-white/60 dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/10">
      {icon && (
        <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className={cn(
          'text-sm font-bold text-slate-900 dark:text-white truncate',
          mono && 'font-mono tracking-tight',
        )}>
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 p-2 rounded-xl hover:bg-primary/10 text-primary transition-colors"
        aria-label={`Copy ${label}`}
      >
        {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function SchoolPaymentInfoCard({ info, className }: Props) {
  const hasAnyDetail =
    Boolean(info.upi_id) ||
    Boolean(info.bank_account_number) ||
    Boolean(info.qr_image_url);

  return (
    <div
      className={cn(
        'rounded-3xl border border-slate-200/60 dark:border-white/10 shadow-xl bg-white/70 dark:bg-white/[0.03] backdrop-blur-md overflow-hidden',
        className,
      )}
    >
      <div className="p-5 sm:p-7 space-y-5">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-600">
              Pay directly to
            </p>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight truncate">
              {info.school_name}
            </h3>
          </div>
        </div>

        {!hasAnyDetail && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-xs font-bold">
              The school has not configured a UPI or bank account yet. Please contact
              the school office before paying.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <CopyRow
            label="UPI ID"
            value={info.upi_id}
            icon={<Smartphone className="w-4 h-4" />}
            mono
          />
          {info.upi_display_name && (
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 -mt-2 ml-12">
              Beneficiary: <span className="text-slate-900 dark:text-white">{info.upi_display_name}</span>
            </div>
          )}

          <CopyRow
            label="Bank Account"
            value={info.bank_account_number}
            icon={<Landmark className="w-4 h-4" />}
            mono
          />
          <CopyRow label="IFSC" value={info.bank_ifsc} mono />
          {info.bank_name && (
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 ml-3">
              {info.bank_name}
              {info.bank_account_holder && ` · A/c holder: ${info.bank_account_holder}`}
            </div>
          )}
        </div>

        {info.qr_image_url && (
          <div className="rounded-2xl bg-gradient-to-br from-emerald-500/5 to-primary/5 border border-emerald-500/20 p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4">
            <div className="h-48 w-48 sm:h-60 sm:w-60 rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-inner shrink-0 flex items-center justify-center p-2">
              <img
                src={info.qr_image_url}
                alt="Scan to pay"
                className="w-full h-full object-contain"
                loading="lazy"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <QrCode className="w-4 h-4 text-emerald-600" />
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                  Scan to pay
                </p>
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                Open any UPI app and scan to pay.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                After paying, enter the UTR/transaction ID below to submit for verification.
              </p>
            </div>
          </div>
        )}

        {info.payment_instructions && (
          <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs leading-relaxed whitespace-pre-line">
            {info.payment_instructions}
          </div>
        )}
      </div>
    </div>
  );
}
