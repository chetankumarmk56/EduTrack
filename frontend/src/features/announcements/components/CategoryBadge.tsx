import { cn } from '@/shared/lib/utils';
import { getCategoryMeta } from '../constants';

/**
 * Renders a small inline pill showing the announcement category.
 * Falls back to the NORMAL meta for unknown / missing values so old
 * announcement rows without a category still render cleanly.
 */
export function CategoryBadge({
  category,
  className,
}: {
  category?: string | null;
  className?: string;
}) {
  const meta = getCategoryMeta(category);
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-black uppercase tracking-widest',
        meta.chipClass,
        className,
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {meta.badge}
    </span>
  );
}
