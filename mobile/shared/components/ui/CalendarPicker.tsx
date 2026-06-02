import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Platform,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/shared/constants/Colors';

interface CalendarPickerProps {
  value: string | null;
  onChange: (date: string) => void;
  label?: string;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplay(s: string): string {
  const d = parseLocalDate(s);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildRows(year: number, month: number): (Date | null)[][] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysCount = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysCount; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export function CalendarPicker({
  value,
  onChange,
  label,
  placeholder = 'Select date',
  minDate,
  maxDate,
}: CalendarPickerProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() =>
    value ? parseLocalDate(value).getFullYear() : today.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(() =>
    value ? parseLocalDate(value).getMonth() : today.getMonth()
  );

  const minD = minDate ? parseLocalDate(minDate) : null;
  const maxD = maxDate ? parseLocalDate(maxDate) : null;
  const selectedD = value ? parseLocalDate(value) : null;

  const openPicker = () => {
    const base = value ? parseLocalDate(value) : today;
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setOpen(true);
  };

  const select = (d: Date) => {
    onChange(toDateStr(d));
    setOpen(false);
  };

  const goToPrev = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };

  const goToNext = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const isDisabled = (d: Date) =>
    (minD !== null && d < minD) || (maxD !== null && d > maxD);

  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  const rows = buildRows(viewYear, viewMonth);

  const CalendarBody = () => (
    <View style={styles.calBody}>
      {/* Month / year navigation */}
      <View style={styles.navRow}>
        <TouchableOpacity
          onPress={goToPrev}
          style={styles.navBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
        </TouchableOpacity>

        <View style={styles.navCenter}>
          <Text style={styles.navMonth}>{MONTHS[viewMonth]}</Text>
          <Text style={styles.navYear}>{viewYear}</Text>
        </View>

        <TouchableOpacity
          onPress={goToNext}
          style={styles.navBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-forward" size={20} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* Weekday header */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>{w}</Text>
        ))}
      </View>

      {/* Day grid — rows of 7 */}
      <View style={styles.grid}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.gridRow}>
            {row.map((day, ci) => {
              if (!day) return <View key={`e-${ci}`} style={styles.dayCell} />;
              const disabled = isDisabled(day);
              const selected = selectedD ? isSameDay(day, selectedD) : false;
              const isToday = isSameDay(day, today);
              return (
                <TouchableOpacity
                  key={`d-${ci}`}
                  onPress={() => !disabled && select(day)}
                  activeOpacity={disabled ? 1 : 0.7}
                  style={styles.dayCell}
                >
                  <View
                    style={[
                      styles.dayInner,
                      selected && styles.dayInnerSelected,
                      isToday && !selected && styles.dayInnerToday,
                      disabled && styles.dayInnerDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        selected && styles.dayTextSelected,
                        isToday && !selected && styles.dayTextToday,
                        disabled && styles.dayTextDisabled,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </View>
                  {isToday && !selected && <View style={styles.todayDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );

  const trigger = (
    <TouchableOpacity style={styles.trigger} onPress={openPicker} activeOpacity={0.75}>
      <Ionicons
        name="calendar-outline"
        size={18}
        color={value ? Colors.primary : Colors.textMuted}
      />
      <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]} numberOfLines={1}>
        {value ? formatDisplay(value) : placeholder}
      </Text>
      <Ionicons name="chevron-down" size={15} color={Colors.textMuted} />
    </TouchableOpacity>
  );

  // Web: inline dropdown below the trigger
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        {label && <Text style={styles.label}>{label}</Text>}
        {trigger}
        {open && (
          <View style={styles.inlineDropdown}>
            <View style={styles.inlineHeader}>
              <Text style={styles.inlineTitle}>{label || 'Select Date'}</Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <CalendarBody />
          </View>
        )}
      </View>
    );
  }

  // Mobile: centered modal overlay
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      {trigger}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Inner Pressable absorbs taps so backdrop doesn't close on content press */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label || 'Select Date'}</Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={26} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {value && (
              <View style={styles.selectedBanner}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                <Text style={styles.selectedBannerText}>{formatDisplay(value)}</Text>
              </View>
            )}

            <CalendarBody />

            <TouchableOpacity
              style={[styles.doneBtn, !value && styles.doneBtnDisabled]}
              onPress={() => setOpen(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.doneBtnText}>
                {value ? 'Confirm Date' : 'Close'}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },

  label: {
    fontSize: 10,
    fontWeight: '900',
    color: Colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },

  // Trigger button
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  triggerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  triggerPlaceholder: {
    color: Colors.textMuted,
    fontWeight: '500',
  },

  // Mobile modal
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: Colors.card,
    borderRadius: 28,
    padding: 22,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.18,
    shadowRadius: 48,
    elevation: 24,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.divider,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.4,
  },

  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${Colors.primary}10`,
    borderWidth: 1,
    borderColor: `${Colors.primary}25`,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  selectedBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },

  doneBtn: {
    marginTop: 20,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  doneBtnDisabled: {
    backgroundColor: Colors.surface,
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.white,
    letterSpacing: 0.3,
  },

  // Web inline dropdown
  inlineDropdown: {
    marginTop: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 10,
    zIndex: 999,
  },
  inlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  inlineTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.2,
  },

  // Calendar body
  calBody: { gap: 14 },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCenter: { alignItems: 'center' },
  navMonth: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  navYear: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    marginTop: 1,
  },

  weekRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    paddingBottom: 8,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '900',
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },

  grid: { gap: 4 },
  gridRow: { flexDirection: 'row' },

  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  dayInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayInnerSelected: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  dayInnerToday: {
    backgroundColor: `${Colors.primary}12`,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  dayInnerDisabled: {
    opacity: 0.3,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  dayTextSelected: {
    color: Colors.white,
    fontWeight: '900',
  },
  dayTextToday: {
    color: Colors.primary,
    fontWeight: '900',
  },
  dayTextDisabled: {
    color: Colors.textMuted,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginTop: 1,
  },
});
