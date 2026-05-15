import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Platform,
  TextInput 
} from 'react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Colors } from '@/shared/constants/Colors';

interface DatePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  label?: string;
  placeholder?: string;
}

export function DatePicker({ value, onChange, label, placeholder = 'Select date' }: DatePickerProps) {
  const [isPickerVisible, setPickerVisibility] = useState(false);

  const showPicker = () => setPickerVisibility(true);
  const hidePicker = () => setPickerVisibility(false);

  const handleConfirm = (date: Date) => {
    onChange(date);
    hidePicker();
  };

  const formattedDate = value
    ? value.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : placeholder;

  // For Web, we can use a native HTML date input for better reliability
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        {label && <Text style={styles.label}>{label}</Text>}
        <View style={styles.webInputWrapper}>
          <Text style={styles.icon}>📅</Text>
          <input
            type="date"
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              color: Colors.text,
              fontSize: '15px',
              fontFamily: 'inherit',
              outline: 'none',
              padding: '12px 0',
              cursor: 'pointer',
              width: '100%'
            }}
            value={value ? value.toISOString().split('T')[0] : ''}
            onChange={(e) => {
              const date = new Date(e.target.value);
              if (!isNaN(date.getTime())) {
                onChange(date);
              }
            }}
            max={new Date().toISOString().split('T')[0]}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity 
        style={[styles.button, !value && styles.buttonEmpty]} 
        onPress={showPicker}
        activeOpacity={0.7}
      >
        <Text style={styles.icon}>📅</Text>
        <Text style={[styles.text, !value && styles.textPlaceholder]}>
          {formattedDate}
        </Text>
      </TouchableOpacity>
      
      <DateTimePickerModal
        isVisible={isPickerVisible}
        mode="date"
        onConfirm={handleConfirm}
        onCancel={hidePicker}
        maximumDate={new Date()}
        display={Platform.OS === 'ios' ? 'inline' : 'default'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  label: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: Colors.textSecondary, 
    marginBottom: 8 
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  buttonEmpty: {
    borderColor: Colors.border,
  },
  webInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  text: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '500',
  },
  textPlaceholder: {
    color: Colors.textMuted,
  },
  icon: { fontSize: 16 },
});
