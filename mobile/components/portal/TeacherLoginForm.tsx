import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Colors } from '../../constants/Colors';

interface TeacherLoginFormProps {
  fields: any;
  loading: boolean;
  onLogin: () => void;
}

export function TeacherLoginForm({ fields, loading, onLogin }: TeacherLoginFormProps) {
  return (
    <>
      <Text style={styles.formTitle}>Teacher Portal</Text>
      <Text style={styles.formSubtitle}>
        Sign in with your school email credentials
      </Text>

      <View style={styles.fields}>
        <Input
          label="Institution Code"
          value={fields.teacherInstId}
          onChangeText={fields.setTeacherInstId}
          placeholder="e.g. 1"
          keyboardType="numeric"
          leftIcon={<Text style={styles.inputIcon}>#</Text>}
        />
        <Input
          label="Email Address"
          value={fields.email}
          onChangeText={fields.setEmail}
          placeholder="teacher@school.edu"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          leftIcon={<Text style={styles.inputIcon}>✉️</Text>}
        />
        <Input
          label="Password"
          value={fields.password}
          onChangeText={fields.setPassword}
          placeholder="••••••••"
          secureTextEntry={!fields.showPassword}
          leftIcon={<Text style={styles.inputIcon}>🔒</Text>}
          rightIcon={
            <Text style={styles.eyeIcon}>{fields.showPassword ? '🙈' : '👁️'}</Text>
          }
          onRightIconPress={() => fields.setShowPassword(!fields.showPassword)}
        />
      </View>

      <Button
        label="Sign In to Teacher Portal"
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
  submitBtn: { marginTop: 4 },
  inputIcon: { fontSize: 16 },
  eyeIcon: { fontSize: 18 },
});
