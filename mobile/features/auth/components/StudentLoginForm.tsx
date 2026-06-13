import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { DobPicker } from '@/shared/components/ui/DobPicker';
import { Colors } from '@/shared/constants/Colors';

interface StudentLoginFormProps {
  fields: any;
  loading: boolean;
  onLogin: () => void;
}

export function StudentLoginForm({ fields, loading, onLogin }: StudentLoginFormProps) {
  return (
    <>
      <Text style={styles.formTitle}>Parent Portal</Text>
      <Text style={styles.formSubtitle}>
        Sign in with the guardian phone you gave the school and your child&apos;s date of birth.
      </Text>

      <View style={styles.fields}>
        <Input
          label="Guardian Phone Number"
          value={fields.parentPhone}
          onChangeText={fields.setParentPhone}
          placeholder="e.g. 9876543210"
          keyboardType="phone-pad"
          autoCorrect={false}
          maxLength={20}
          leftIcon={<Text style={styles.inputIcon}>📞</Text>}
        />

        <View>
          <DobPicker
            label="Student Date of Birth"
            value={fields.dob}
            onChange={fields.setDob}
          />
          <Text style={styles.dobHint}>
            Used together with the guardian number to verify your identity.
          </Text>
        </View>
      </View>

      <Button
        label="Access Parent Portal"
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
  dobHint: { fontSize: 11, color: Colors.textMuted, marginTop: 8, fontWeight: '500' },
  submitBtn: { marginTop: 4 },
  inputIcon: { fontSize: 16 },
});
