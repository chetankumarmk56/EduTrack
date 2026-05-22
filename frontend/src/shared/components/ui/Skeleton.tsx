import { cn } from '@/shared/lib/utils';

/**
 * Theme-aware shimmer skeleton primitives.
 *
 * Uses CSS variables so the same class set looks correct under the parent
 * `crystal-theme` (light) and the teacher/admin dark themes. Compose these
 * to match each page's real layout so the loading state mirrors the final
 * UI shape — no layout shift when data lands.
 */

const baseClasses =
  'relative overflow-hidden rounded-xl ' +
  // light theme: light grey with subtle inner edge
  'bg-slate-200/70 ' +
  // dark theme (admin / teacher): muted obsidian
  'dark:bg-white/[0.06] ' +
  // shimmer sweep
  "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.8s_infinite] " +
  "before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent " +
  "dark:before:via-white/[0.08]";

export interface SkeletonProps {
  className?: string;
  /** Rounded variant. Defaults to `xl`. */
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
}

export function Skeleton({ className, rounded = 'xl' }: SkeletonProps) {
  const roundedClass = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    '3xl': 'rounded-3xl',
    full: 'rounded-full',
  }[rounded];
  return <div className={cn(baseClasses, roundedClass, className)} />;
}

/** A stack of text-line skeletons. The last line is shorter for realism. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          rounded="md"
          className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

/** Header skeleton: oversized title + supporting line + chip. */
export function SkeletonHeader({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4', className)}>
      <Skeleton rounded="full" className="h-4 w-44" />
      <Skeleton rounded="2xl" className="h-12 w-3/4 max-w-xl" />
      <Skeleton rounded="md" className="h-4 w-1/2 max-w-md" />
    </div>
  );
}

/** A summary stat tile (number + label). */
export function SkeletonStat({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'crystal-glass dark:bg-white/[0.02] p-6 rounded-3xl space-y-3',
        className,
      )}
    >
      <Skeleton rounded="md" className="h-3 w-20" />
      <Skeleton rounded="lg" className="h-9 w-32" />
      <Skeleton rounded="md" className="h-2.5 w-24" />
    </div>
  );
}

/** A row of stat tiles. */
export function SkeletonStatGrid({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-4',
        count === 2
          ? 'grid-cols-1 sm:grid-cols-2'
          : count === 3
            ? 'grid-cols-1 sm:grid-cols-3'
            : 'grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStat key={i} />
      ))}
    </div>
  );
}

/** A generic content card with optional icon, title, body lines. */
export function SkeletonCard({
  showIcon = true,
  lines = 3,
  className,
}: {
  showIcon?: boolean;
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'crystal-glass dark:bg-white/[0.02] p-6 rounded-3xl space-y-4',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {showIcon && <Skeleton rounded="xl" className="h-10 w-10" />}
        <Skeleton rounded="md" className="h-4 flex-1 max-w-[60%]" />
      </div>
      <SkeletonText lines={lines} />
    </div>
  );
}

/** A grid of generic cards. */
export function SkeletonCardGrid({
  count = 6,
  cols = 'lg',
  className,
}: {
  count?: number;
  cols?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const colsClass = {
    sm: 'grid-cols-1 sm:grid-cols-2',
    md: 'grid-cols-1 md:grid-cols-2',
    lg: 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3',
    xl: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
  }[cols];
  return (
    <div className={cn('grid gap-6', colsClass, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** A row in a list (avatar + 2 lines + trailing chip). */
export function SkeletonListRow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 p-4 rounded-2xl crystal-glass dark:bg-white/[0.02]',
        className,
      )}
    >
      <Skeleton rounded="full" className="h-12 w-12 shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <Skeleton rounded="md" className="h-3.5 w-1/3" />
        <Skeleton rounded="md" className="h-3 w-2/3" />
      </div>
      <Skeleton rounded="lg" className="h-8 w-20 shrink-0" />
    </div>
  );
}

/** A vertical list of rows. */
export function SkeletonList({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonListRow key={i} />
      ))}
    </div>
  );
}

/** A table skeleton with header + body rows. */
export function SkeletonTable({
  rows = 6,
  cols = 5,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'crystal-glass dark:bg-white/[0.02] rounded-3xl p-4 space-y-3',
        className,
      )}
    >
      {/* Header */}
      <div
        className="grid gap-3 pb-3 border-b border-slate-200/60 dark:border-white/10"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} rounded="md" className="h-3 w-3/4" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-3 py-2"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              rounded="md"
              className={cn('h-4', c === 0 ? 'w-full' : 'w-5/6')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A full-page skeleton: header + stat grid + content list. Good default
 *  for "page is loading and I'm not ready to hand-craft a per-page layout." */
export function SkeletonPage({
  showStats = true,
  contentVariant = 'list',
  className,
}: {
  showStats?: boolean;
  contentVariant?: 'list' | 'cards' | 'table';
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      <SkeletonHeader />
      {showStats && <SkeletonStatGrid />}
      {contentVariant === 'list' && <SkeletonList />}
      {contentVariant === 'cards' && <SkeletonCardGrid />}
      {contentVariant === 'table' && <SkeletonTable />}
    </div>
  );
}
