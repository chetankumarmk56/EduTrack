import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { DatePicker } from '@/shared/components/ui/DatePicker';
import { Colors } from '@/shared/constants/Colors';

interface StudentLoginFormProps {
  fields: any;
  loading: boolean;
  onLogin: () => void;
}

export function StudentLoginForm({ fields, loading, onLogin }: StudentLoginFormProps) {
  return (
    <>
      <Text style={styles.formTitle}>Student Portal</Text>
      <Text style={styles.formSubtitle}>
        Enter your child&apos;s school details to continue
      </Text>

      <View style={styles.fields}>
        <Input
          label="Institution Code"
          value={fields.institutionId}
          onChangeText={fields.setInstitutionId}
          placeholder="e.g. 1"
          keyboardType="numeric"
          leftIcon={<Text style={styles.inputIcon}>#</Text>}
        />
        <Input
          label="Student Name (exactly as registered)"
          value={fields.studentName}
          onChangeText={fields.setStudentName}
          placeholder="e.g. John Doe"
          autoCapitalize="words"
          leftIcon={<Text style={styles.inputIcon}>👤</Text>}
        />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Input
              label="Grade"
              value={fields.classLevel}
              onChangeText={fields.setClassLevel}
              placeholder="e.g. 10"
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Section"
              value={fields.section}
              onChangeText={(t) => fields.setSection(t.toUpperCase())}
              placeholder="e.g. A"
              autoCapitalize="characters"
              maxLength={2}
            />
          </View>
        </View>

        <View>
          <DatePicker
            label="Date of Birth (used as password)"
            value={fields.dob}
            onChange={fields.setDob}
            placeholder="Select Date of Birth"
          />
          <Text style={styles.dobHint}>
            This is used for verification during login.
          </Text>
        </View>
      </View>

      <Button
        label="Access Student Portal"
        onPress={onLogin}
        loading={loading}
        size="lg"
        style={styles.submitBtn}
      />
    </>
  );
}

const styles = StyleSheet.create({
  formTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  formSubtitle: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginTop: -8 },
  fields: { gap: 16, marginTop: 4 },
  row: { flexDirection: 'row', gap: 12 },
  dobHint: { fontSize: 11, color: Colors.textMuted, marginTop: 8, fontWeight: '500' },
  submitBtn: { marginTop: 4 },
  inputIcon: { fontSize: 16 },
});
