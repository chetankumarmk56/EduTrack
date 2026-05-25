import { cn } from '@/shared/lib/utils';
import {
  CheckCircle2, Clock, AlertTriangle, XCircle, FileWarning, CircleDollarSign,
} from 'lucide-react';
import {
  STATUS_COLOR_CLASSES,
} from '../lib/validation';
import { STATUS_LABEL, type ManualPaymentStatus } from '../types';

const STATUS_ICON: Record<ManualPaymentStatus, typeof Clock> = {
  PENDING_VERIFICATION: Clock,
  APPROVED: CheckCircle2,
  NEED_VERIFICATION: AlertTriangle,
  PARTIAL_PAYMENT: CircleDollarSign,
  REJECTED: XCircle,
  FAILED: FileWarning,
};

interface Props {
  status: string;
  size?: 'sm' | 'md';
  className?: string;
}

export default function StatusBadge({ status, size = 'sm', className }: Props) {
  const known = (STATUS_LABEL as Record<string, string>)[status]
    ? (status as ManualPaymentStatus)
    : ('PENDING_VERIFICATION' as ManualPaymentStatus);
  const Icon = STATUS_ICON[known];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-widest',
        STATUS_COLOR_CLASSES[known],
        size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs',
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {STATUS_LABEL[known]}
    </span>
  );
}
