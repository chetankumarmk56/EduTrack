/**
 * Central registry of announcement categories.
 *
 * Adding a new category here (e.g. CIRCULAR, EVENT, EXAM_NOTICE) should be
 * enough for the listings to render a badge and filter chip — no scattered
 * conditionals across pages. Pages opt in to category-specific UI by
 * checking `category === 'HOMEWORK'`.
 */
import {
  Megaphone,
  BookOpenCheck,
  type LucideIcon,
} from 'lucide-react';

export type AnnouncementCategory = 'NORMAL' | 'HOMEWORK';

export interface AnnouncementCategoryMeta {
  key: AnnouncementCategory;
  label: string;
  /** Short badge text (kept distinct from `label` to allow ALL-CAPS chips). */
  badge: string;
  icon: LucideIcon;
  /** Tailwind utility set for the badge chip — bg + border + text. */
  chipClass: string;
  /** Tailwind utility set for the icon tile background. */
  tileClass: string;
}

export const ANNOUNCEMENT_CATEGORIES: Record<AnnouncementCategory, AnnouncementCategoryMeta> = {
  NORMAL: {
    key: 'NORMAL',
    label: 'Announcement',
    badge: 'Update',
    icon: Megaphone,
    chipClass: 'bg-primary/10 text-primary border-primary/20',
    tileClass: 'bg-primary/10 text-primary',
  },
  HOMEWORK: {
    key: 'HOMEWORK',
    label: 'Homework',
    badge: 'Homework',
    icon: BookOpenCheck,
    chipClass: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    tileClass: 'bg-amber-500/10 text-amber-600',
  },
};

export const ANNOUNCEMENT_CATEGORY_LIST: AnnouncementCategoryMeta[] = Object.values(
  ANNOUNCEMENT_CATEGORIES,
);

/** Safe lookup that always returns a meta record, even for unknown values. */
export function getCategoryMeta(
  category?: string | null,
): AnnouncementCategoryMeta {
  if (category && category in ANNOUNCEMENT_CATEGORIES) {
    return ANNOUNCEMENT_CATEGORIES[category as AnnouncementCategory];
  }
  return ANNOUNCEMENT_CATEGORIES.NORMAL;
}
