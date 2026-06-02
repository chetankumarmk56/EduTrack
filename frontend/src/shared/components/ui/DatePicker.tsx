import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * DatePicker — a UI/UX-friendly replacement for the native `<input type="date">`.
 *
 * The native picker always opens on the *current* month, which makes picking a
 * birthdate (often 5–20 years back) painful — you click the back-arrow dozens of
 * times. This component adds day / month / year views with a quick year jump so
 * navigating far into the past is a couple of clicks.
 *
 * Values are plain `YYYY-MM-DD` strings (same contract as the native input), and
 * everything is parsed/formatted with *local* date components — never
 * `toISOString()`, which shifts the day across timezones.
 */

interface DatePickerProps {
  value: string | null | undefined;     // 'YYYY-MM-DD' or empty
  onChange: (value: string) => void;
  min?: string;                         // 'YYYY-MM-DD'
  max?: string;                         // 'YYYY-MM-DD'
  className?: string;                   // applied to the trigger so existing field styling carries over
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  /** When true the leading calendar icon is hidden (e.g. a field already renders its own). */
  hideIcon?: boolean;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function parseLocalDate(s?: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplay(s: string): string {
  const d = parseLocalDate(s);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildCells(year: number, month: number): (Date | null)[] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysCount = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysCount; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

const YEARS_PER_PAGE = 12;

type View = 'days' | 'months' | 'years';

export default function DatePicker({
  value, onChange, min, max, className, placeholder = 'Select date',
  disabled, id, hideIcon, ...rest
}: DatePickerProps) {
  const ariaLabel = rest['aria-label'];
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('days');

  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);
  const minD = useMemo(() => parseLocalDate(min), [min]);
  const maxD = useMemo(() => parseLocalDate(max), [max]);
  const selected = useMemo(() => parseLocalDate(value), [value]);

  const base = selected ?? maxD ?? today;
  const [viewYear, setViewYear] = useState(base.getFullYear());
  const [viewMonth, setViewMonth] = useState(base.getMonth());
  const [yearPageStart, setYearPageStart] = useState(
    base.getFullYear() - (base.getFullYear() % YEARS_PER_PAGE),
  );

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const openPicker = () => {
    if (disabled) return;
    const b = selected ?? maxD ?? today;
    setViewYear(b.getFullYear());
    setViewMonth(b.getMonth());
    setYearPageStart(b.getFullYear() - (b.getFullYear() % YEARS_PER_PAGE));
    setView('days');
    setOpen(true);
  };

  // Position the popover under (or above) the trigger, in fixed coords.
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const popH = popRef.current?.offsetHeight ?? 340;
      const below = window.innerHeight - r.bottom;
      const openUp = below < popH + 12 && r.top > below;
      setPos({
        top: openUp ? Math.max(8, r.top - popH - 8) : r.bottom + 8,
        left: Math.min(r.left, window.innerWidth - 320 - 8),
        width: r.width,
      });
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  // Dismiss on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isDayDisabled = (d: Date) =>
    (minD !== null && d < minD) || (maxD !== null && d > maxD);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const goMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setViewMonth(m); setViewYear(y);
  };

  const pickDay = (d: Date) => {
    if (isDayDisabled(d)) return;
    onChange(toDateStr(d));
    setOpen(false);
  };

  const cells = useMemo(() => buildCells(viewYear, viewMonth), [viewYear, viewMonth]);

  const headerBtn =
    'px-2.5 py-1 rounded-lg text-sm font-black hover:bg-white/5 transition-colors';
  const navBtn =
    'w-8 h-8 grid place-items-center rounded-lg border border-glass-border hover:bg-white/5 transition-colors disabled:opacity-30';

  const popover = (
    <AnimatePresence>
      {open && pos && (
        <motion.div
          ref={popRef}
          initial={{ opacity: 0, scale: 0.97, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -4 }}
          transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
          className="modal-panel z-[200] w-[300px] p-3"
          role="dialog"
        >
          {/* Header: month/year switchers + nav */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" className={navBtn} aria-label="Previous"
              onClick={() => {
                if (view === 'days') goMonth(-1);
                else if (view === 'years') setYearPageStart(s => s - YEARS_PER_PAGE);
                else setViewYear(y => y - 1);
              }}>
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1">
              {view === 'days' && (
                <button type="button" className={headerBtn} onClick={() => setView('months')}>
                  {MONTHS[viewMonth]}
                </button>
              )}
              <button type="button" className={headerBtn}
                onClick={() => setView(view === 'years' ? 'days' : 'years')}>
                {view === 'years'
                  ? `${yearPageStart} – ${yearPageStart + YEARS_PER_PAGE - 1}`
                  : viewYear}
              </button>
            </div>

            <button type="button" className={navBtn} aria-label="Next"
              onClick={() => {
                if (view === 'days') goMonth(1);
                else if (view === 'years') setYearPageStart(s => s + YEARS_PER_PAGE);
                else setViewYear(y => y + 1);
              }}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day view */}
          {view === 'days' && (
            <>
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map(w => (
                  <span key={w} className="text-center text-[10px] font-black uppercase tracking-wider text-text-secondary py-1">
                    {w}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((d, i) => {
                  if (!d) return <span key={`e${i}`} />;
                  const disabledDay = isDayDisabled(d);
                  const isSel = selected ? sameDay(d, selected) : false;
                  const isToday = sameDay(d, today);
                  return (
                    <button
                      key={toDateStr(d)}
                      type="button"
                      disabled={disabledDay}
                      onClick={() => pickDay(d)}
                      className={cn(
                        'h-9 rounded-lg text-sm font-bold transition-colors',
                        isSel
                          ? 'bg-brand-indigo text-white'
                          : 'hover:bg-white/5 text-foreground',
                        !isSel && isToday && 'ring-1 ring-brand-indigo/50',
                        disabledDay && 'opacity-25 cursor-not-allowed hover:bg-transparent',
                      )}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Month view */}
          {view === 'months' && (
            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS_SHORT.map((m, i) => {
                const isSel = selected && selected.getFullYear() === viewYear && selected.getMonth() === i;
                return (
                  <button key={m} type="button"
                    onClick={() => { setViewMonth(i); setView('days'); }}
                    className={cn(
                      'h-10 rounded-lg text-sm font-bold transition-colors',
                      isSel ? 'bg-brand-indigo text-white' : 'hover:bg-white/5 text-foreground',
                    )}>
                    {m}
                  </button>
                );
              })}
            </div>
          )}

          {/* Year view */}
          {view === 'years' && (
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearPageStart + i).map(y => {
                const isSel = selected && selected.getFullYear() === y;
                const outOfRange =
                  (minD !== null && y < minD.getFullYear()) ||
                  (maxD !== null && y > maxD.getFullYear());
                return (
                  <button key={y} type="button" disabled={outOfRange}
                    onClick={() => { setViewYear(y); setView('months'); }}
                    className={cn(
                      'h-10 rounded-lg text-sm font-bold transition-colors',
                      isSel ? 'bg-brand-indigo text-white' : 'hover:bg-white/5 text-foreground',
                      outOfRange && 'opacity-25 cursor-not-allowed hover:bg-transparent',
                    )}>
                    {y}
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={cn(
          'inline-flex items-center gap-2 text-left',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      >
        {!hideIcon && (
          <CalendarIcon className="w-4 h-4 shrink-0 text-text-secondary" />
        )}
        <span className={cn('truncate', !value && 'text-text-secondary opacity-70')}>
          {value ? formatDisplay(value) : placeholder}
        </span>
      </button>
      {typeof document !== 'undefined' ? createPortal(popover, document.body) : popover}
    </>
  );
}
