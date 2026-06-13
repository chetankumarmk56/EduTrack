import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/shared/constants/Colors';

interface DobPickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  label?: string;
}

type Field = 'day' | 'month' | 'year';
interface Option {
  value: string;
  label: string;
}

// Mirrors the website's parent-login DOB selects (frontend Login.tsx): a
// Day/Month/Year dropdown trio. Far better UX than scrolling a calendar back
// 10+ years to a birth date.
const DAYS: Option[] = Array.from({ length: 31 }, (_, i) => {
  const v = String(i + 1).padStart(2, '0');
  return { value: v, label: v };
});
const MONTHS: Option[] = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' }, { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' }, { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' }, { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' }, { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS: Option[] = Array.from({ length: CURRENT_YEAR - 2000 + 1 }, (_, i) => {
  const v = String(CURRENT_YEAR - i);
  return { value: v, label: v };
});

const OPTIONS: Record<Field, Option[]> = { day: DAYS, month: MONTHS, year: YEARS };
const FIELD_TITLE: Record<Field, string> = { day: 'Select Day', month: 'Select Month', year: 'Select Year' };

export function DobPicker({ value, onChange, label }: DobPickerProps) {
  // Internal selection so a partial pick (e.g. day before month/year) isn't
  // lost — the parent `value` only becomes a Date once all three are chosen.
  const [day, setDay] = useState(value ? String(value.getDate()).padStart(2, '0') : '');
  const [month, setMonth] = useState(value ? String(value.getMonth() + 1).padStart(2, '0') : '');
  const [year, setYear] = useState(value ? String(value.getFullYear()) : '');
  const [open, setOpen] = useState<Field | null>(null);

  const current: Record<Field, string> = { day, month, year };

  const select = (field: Field, val: string) => {
    const next = { ...current, [field]: val };
    if (field === 'day') setDay(val);
    else if (field === 'month') setMonth(val);
    else setYear(val);
    setOpen(null);
    if (next.day && next.month && next.year) {
      // Local constructor — no UTC shift; useLogin reads local components.
      onChange(new Date(Number(next.year), Number(next.month) - 1, Number(next.day)));
    }
  };

  const labelFor = (field: Field): string => {
    const v = current[field];
    if (!v) return field === 'day' ? 'DD' : field === 'month' ? 'Month' : 'YYYY';
    return OPTIONS[field].find((o) => o.value === v)?.label ?? v;
  };

  // ── Web: real <select> elements, matching the website exactly ─────────────
  if (Platform.OS === 'web') {
    const selectStyle: React.CSSProperties = {
      flex: 1,
      border: `1px solid ${Colors.border}`,
      background: Colors.surface,
      color: Colors.text,
      fontSize: '15px',
      fontFamily: 'inherit',
      borderRadius: '12px',
      padding: '13px 10px',
      outline: 'none',
      cursor: 'pointer',
      appearance: 'auto',
    };
    return (
      <View style={styles.container}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View style={styles.row}>
          <select style={{ ...selectStyle, flex: 0.8 }} value={day} onChange={(e) => select('day', e.target.value)}>
            <option value="" disabled>Day</option>
            {DAYS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select style={selectStyle} value={month} onChange={(e) => select('month', e.target.value)}>
            <option value="" disabled>Month</option>
            {MONTHS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select style={selectStyle} value={year} onChange={(e) => select('year', e.target.value)}>
            <option value="" disabled>Year</option>
            {YEARS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </View>
      </View>
    );
  }

  // ── Native: three tappable fields + a bottom-sheet option list ────────────
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {(['day', 'month', 'year'] as Field[]).map((field) => (
          <TouchableOpacity
            key={field}
            style={[styles.field, field === 'day' && styles.dayField, field === 'year' && styles.yearField]}
            onPress={() => setOpen(field)}
            activeOpacity={0.7}
          >
            <Text style={[styles.fieldText, !current[field] && styles.fieldPlaceholder]} numberOfLines={1}>
              {labelFor(field)}
            </Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{open ? FIELD_TITLE[open] : ''}</Text>
            <FlatList
              data={open ? OPTIONS[open] : []}
              keyExtractor={(o) => o.value}
              initialNumToRender={20}
              style={styles.list}
              renderItem={({ item }) => {
                const selected = open ? current[open] === item.value : false;
                return (
                  <TouchableOpacity
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => open && select(open, item.value)}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{item.label}</Text>
                    {selected ? <Ionicons name="checkmark" size={18} color={Colors.primary} /> : null}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10 },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  dayField: { flex: 0.8 },
  yearField: { flex: 1.1 },
  fieldText: { fontSize: 15, color: Colors.text, fontWeight: '500' },
  fieldPlaceholder: { color: Colors.textMuted },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '60%',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  list: { paddingHorizontal: 12 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  optionSelected: { backgroundColor: Colors.surface },
  optionText: { fontSize: 16, color: Colors.text, fontWeight: '500' },
  optionTextSelected: { color: Colors.primary, fontWeight: '800' },
});
