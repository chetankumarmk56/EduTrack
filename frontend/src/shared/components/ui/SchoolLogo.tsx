import { useState, type ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface SchoolLogoProps {
  /** Resolved URL to the school logo. When null/undefined, the fallback renders. */
  src?: string | null;
  /** School name — used for alt text and for the initial-letter fallback. */
  name?: string | null;
  /** Pixel size (square). Defaults to 40px to match the sidebar avatar slot. */
  size?: number;
  /** Tailwind classes appended to the outer wrapper. */
  className?: string;
  /**
   * Visual style. `solid` is for filled tiles (sidebar). `ghost` skips the
   * tile background and just clips the image — useful when the parent
   * provides its own framing.
   */
  variant?: 'solid' | 'ghost';
  /**
   * Override the fallback content shown when there's no logo URL or the
   * image fails to load. Defaults to an initial letter (or the Building2
   * icon when no name is available).
   */
  fallback?: ReactNode;
  /** Forward an explicit rounded utility. Defaults to `rounded-xl`. */
  rounded?: string;
}

/**
 * Reusable display for the active institution's logo, with a graceful
 * fallback when no logo is uploaded yet (or when the resolved URL fails
 * to load — presigned S3 URLs can 403 mid-session).
 *
 * Kept presentation-only on purpose: callers pass the URL + name in
 * directly so we don't drag a context dependency into every page that
 * shows a school brand.
 */
export default function SchoolLogo({
  src,
  name,
  size = 40,
  className,
  variant = 'solid',
  fallback,
  rounded = 'rounded-xl',
}: SchoolLogoProps) {
  const [errored, setErrored] = useState(false);
  const hasImage = Boolean(src) && !errored;

  const dimension = { width: size, height: size };
  const initial = (name?.trim()?.[0] || '').toUpperCase();

  // The wrapper always gets the rounding + sizing so the fallback and the
  // image render in the same footprint, avoiding layout shift the moment
  // an S3 URL fails or succeeds.
  return (
    <div
      style={dimension}
      className={cn(
        'shrink-0 overflow-hidden flex items-center justify-center',
        rounded,
        variant === 'solid'
          ? 'bg-white/80 border border-black/5 shadow-sm'
          : 'bg-transparent',
        className,
      )}
    >
      {hasImage ? (
        <img
          src={src ?? ''}
          alt={name ? `${name} logo` : 'School logo'}
          loading="lazy"
          decoding="async"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        fallback ?? (
          initial ? (
            <span
              className="font-black text-primary tracking-tighter"
              style={{ fontSize: Math.round(size * 0.5) }}
            >
              {initial}
            </span>
          ) : (
            <Building2 className="text-primary" style={{ height: size * 0.55, width: size * 0.55 }} />
          )
        )
      )}
    </div>
  );
}
