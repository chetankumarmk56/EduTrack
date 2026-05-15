import type { ComponentType } from 'react';
import { Mail, Building } from 'lucide-react';

interface AccountIdentityCardProps {
  name: string;
  subtitle: string;
  email?: string;
  institutionName?: string;
  Icon: ComponentType<{ className?: string }>;
  /** Tailwind classes for the avatar tile (background + text). */
  iconClassName?: string;
  /** Tailwind class for the small detail icons (Mail / Building). */
  detailIconClassName?: string;
}

export default function AccountIdentityCard({
  name,
  subtitle,
  email,
  institutionName,
  Icon,
  iconClassName = 'bg-primary/10 text-primary',
  detailIconClassName = 'text-primary',
}: AccountIdentityCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-4 mb-5">
        <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${iconClassName}`}>
          <Icon className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">{name}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Mail className={`w-4 h-4 ${detailIconClassName}`} />
          <span className="truncate">{email || '—'}</span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Building className={`w-4 h-4 ${detailIconClassName}`} />
          <span className="truncate">{institutionName || '—'}</span>
        </div>
      </div>
    </div>
  );
}
