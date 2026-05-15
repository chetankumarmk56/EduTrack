import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/shared/constants/Colors';

interface TeacherLoginFormProps {
  fields: any;
  loading: boolean;
  onLogin: () => void;
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface FieldInputProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  icon: IoniconName;
  keyboardType?: 'default' | 'email-address' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  secureTextEntry?: boolean;
  rightAction?: React.ReactNode;
}

function FieldInput({
  label, value, onChangeText, placeholder, icon,
  keyboardType = 'default', autoCapitalize, autoCorrect,
  secureTextEntry, rightAction,
}: FieldInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={fi.container}>
      <Text style={fi.label}>{label}</Text>
      <View style={[fi.wrapper, focused && fi.wrapperFocused]}>
        <View style={fi.iconBox}>
          <Ionicons
            name={icon}
            size={18}
            color={focused ? Colors.success : Colors.textMuted}
          />
        </View>
        <TextInput
          style={fi.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          secureTextEntry={secureTextEntry}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {rightAction}
      </View>
    </View>
  );
}

const fi = StyleSheet.create({
  container: { gap: 7 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  wrapperFocused: {
    borderColor: Colors.success,
    backgroundColor: `${Colors.success}06`,
  },
  iconBox: {
    width: 48,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: 54,
    paddingRight: 14,
    fontSize: 15,
    color: Colors.text,
    fontWeight: '500',
  },
});

export function TeacherLoginForm({ fields, loading, onLogin }: TeacherLoginFormProps) {
  return (
    <>
      {/* Teacher header badge */}
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="school" size={26} color={Colors.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Teacher Portal</Text>
          <Text style={styles.subtitle}>Sign in with your school credentials</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Fields */}
      <View style={styles.fields}>
        <FieldInput
          label="Institution Code"
          value={fields.teacherInstId}
          onChangeText={fields.setTeacherInstId}
          placeholder="e.g. 1"
          keyboardType="numeric"
          icon="business-outline"
        />
        <FieldInput
          label="Email Address"
          value={fields.email}
          onChangeText={fields.setEmail}
          placeholder="teacher@school.edu"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          icon="mail-outline"
        />
        <FieldInput
          label="Password"
          value={fields.password}
          onChangeText={fields.setPassword}
          placeholder="Enter your password"
          secureTextEntry={!fields.showPassword}
          icon="lock-closed-outline"
          rightAction={
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => fields.setShowPassword(!fields.showPassword)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={fields.showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={Colors.textMuted}
              />
            </TouchableOpacity>
          }
        />
      </View>

      {/* Forgot password */}
      <TouchableOpacity style={styles.forgotRow} activeOpacity={0.7}>
        <Text style={styles.forgotText}>Forgot password?</Text>
      </TouchableOpacity>

      {/* Submit button */}
      <TouchableOpacity
        style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
        onPress={onLogin}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Text style={styles.submitText}>Sign In</Text>
            <View style={styles.arrowBox}>
              <Ionicons name="arrow-forward" size={16} color={Colors.success} />
            </View>
          </>
        )}
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: `${Colors.success}15`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: `${Colors.success}35`,
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500', marginTop: 2 },

  divider: { height: 1, backgroundColor: Colors.border },

  fields: { gap: 14 },

  eyeBtn: { paddingHorizontal: 14, height: 54, justifyContent: 'center' },

  forgotRow: { alignSelf: 'flex-end', marginTop: -2 },
  forgotText: { fontSize: 13, fontWeight: '700', color: Colors.success },

  submitBtn: {
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 2,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  arrowBox: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
