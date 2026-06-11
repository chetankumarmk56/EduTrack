import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { directoryService } from '../../services';
import { authService } from '@/features/auth/services/authService';
import { Colors } from '@/shared/constants/Colors';
import { LoadingScreen } from '@/shared/components/ui/Feedback';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useRouter } from 'expo-router';
import { neonShadows } from '@/shared/styles/neonStyles';

// ── Helpers ───────────────────────────────────────────────────────────────────

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const SUBJECT_COLORS = [
  Colors.primary,
  Colors.success,
  Colors.warning,
  '#7c3aed', // purple
];

// ── Sub-components ────────────────────────────────────────────────────────────

function PasswordField({
  label,
  value,
  onChangeText,
  visible,
  onToggle,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.pwField}>
      <Text style={styles.pwFieldLabel}>{label}</Text>
      <View style={styles.pwInputRow}>
        <TextInput
          style={styles.pwInput}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          placeholder="••••••••"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={visible ? 'eye-off' : 'eye'} size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function TeacherProfile() {
  const { logout } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [showPwModal, setShowPwModal] = useState(false);
  const [currentPw, setCurrentPw]     = useState('');
  const [newPw, setNewPw]             = useState('');
  const [confirmPw, setConfirmPw]     = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwLoading, setPwLoading]     = useState(false);

  useEffect(() => {
    directoryService.getMyProfile()
      .then(setProfile)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingScreen message="Loading profile..." />;

  // ── derived data ──
  const assignments: any[] = profile?.assignments ?? [];
  const totalClasses  = assignments.length;
  const totalStudents = assignments.reduce((acc: number, a: any) => acc + (a.school_class?.student_count ?? 0), 0);

  // ── handlers ──
  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const dismissPwModal = () => {
    setShowPwModal(false);
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    setShowCurrent(false); setShowNew(false); setShowConfirm(false);
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      Alert.alert('Missing fields', 'Please fill in all password fields.');
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert('Mismatch', 'New passwords do not match.');
      return;
    }
    if (newPw.length < 6) {
      Alert.alert('Too short', 'Password must be at least 6 characters.');
      return;
    }
    try {
      setPwLoading(true);
      await authService.changePassword(currentPw, newPw);
      dismissPwModal();
      Alert.alert('Success', 'Password updated successfully!');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to change password.');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero Card ── */}
        <Animated.View
          entering={FadeInDown.delay(0).springify().damping(18)}
          style={styles.heroCard}
        >
          {/* Background blobs */}
          <View style={[styles.blob, { width: 200, height: 200, top: -80, right: -60 }]} />
          <View style={[styles.blob, { width: 130, height: 130, bottom: -40, left: -20 }]} />
          <View style={[styles.blob, { width: 70, height: 70, top: 30, left: '50%' }]} />

          {/* Avatar */}
          <View style={styles.avatarRing}>
            <View style={styles.avatarInner}>
              <Text style={styles.avatarText}>{initialsOf(profile?.name || 'T')}</Text>
            </View>
          </View>

          {/* Name + Role chip */}
          <Text style={styles.heroName}>{profile?.name}</Text>
          <View style={styles.roleChip}>
            <Ionicons name="school" size={12} color={Colors.success} />
            <Text style={styles.roleChipText}>Faculty Member</Text>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalClasses}</Text>
              <Text style={styles.statLabel}>Classes</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalStudents}</Text>
              <Text style={styles.statLabel}>Students</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Contact Info ── */}
        <Animated.View entering={FadeInDown.delay(80).springify().damping(18)} style={styles.section}>
          <Text style={styles.sectionLabel}>Contact Information</Text>
          <View style={styles.card}>
            {/* Email row */}
            <View style={styles.contactRow}>
              <View style={[styles.contactIconBox, { backgroundColor: `${Colors.primary}15` }]}>
                <Ionicons name="mail" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactLabel}>Email</Text>
                <Text style={styles.contactValue} numberOfLines={1}>
                  {profile?.email || 'N/A'}
                </Text>
              </View>
            </View>
            <View style={styles.rowDivider} />
            {/* Phone row */}
            <View style={styles.contactRow}>
              <View style={[styles.contactIconBox, { backgroundColor: `${Colors.success}15` }]}>
                <Ionicons name="call" size={18} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactLabel}>Phone</Text>
                <Text style={styles.contactValue}>{profile?.phone || 'N/A'}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* ── Teaching Load ── */}
        <Animated.View entering={FadeInDown.delay(160).springify().damping(18)} style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Teaching Load</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{totalClasses}</Text>
            </View>
          </View>

          <View style={styles.assignmentList}>
            {assignments.map((a: any, i: number) => {
              const accent = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
              const gradeName   = a.school_class?.grade?.name   ?? '';
              const sectionName = a.school_class?.section?.name ?? '';
              const classFull   = gradeName && sectionName ? `${gradeName} – ${sectionName}` : gradeName || sectionName;

              return (
                <Animated.View
                  key={i}
                  entering={FadeInUp.delay(160 + i * 50).springify().damping(18)}
                  style={styles.assignmentCard}
                >
                  {/* Colored subject icon */}
                  <View style={[styles.subjectIconBox, { backgroundColor: `${accent}15` }]}>
                    <Ionicons name="book" size={22} color={accent} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.subjectName}>{a.subject_ref?.name}</Text>
                    <Text style={styles.subjectClass}>{classFull}</Text>
                  </View>

                  {/* Grade pill */}
                  <View style={[styles.gradePill, { backgroundColor: `${accent}12`, borderColor: `${accent}30` }]}>
                    <Text style={[styles.gradePillText, { color: accent }]}>{classFull}</Text>
                  </View>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>

        {/* ── Account Actions ── */}
        <Animated.View entering={FadeInDown.delay(260).springify().damping(18)} style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.card}>

            {/* Change Password */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => setShowPwModal(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${Colors.primary}12` }]}>
                <Ionicons name="lock-closed" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionLabel}>Change Password</Text>
                <Text style={styles.actionSub}>Update your account password</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Sign Out */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${Colors.danger}12` }]}>
                <Ionicons name="log-out" size={18} color={Colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionLabel, { color: Colors.danger }]}>Sign Out</Text>
                <Text style={styles.actionSub}>Sign Out from Device</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Text style={styles.footer}>ArkenEdu · Faculty Portal</Text>
      </ScrollView>

      {/* ── Change Password Modal ── */}
      <Modal
        visible={showPwModal}
        animationType="slide"
        transparent
        onRequestClose={dismissPwModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={dismissPwModal} />
          <View style={styles.modalSheet}>
            <View style={styles.modalGrab} />

            <View style={styles.modalHeader}>
              <View style={[styles.modalIconBadge, { backgroundColor: `${Colors.primary}12` }]}>
                <Ionicons name="lock-closed" size={22} color={Colors.primary} />
              </View>
              <View>
                <Text style={styles.modalTitle}>Change Password</Text>
                <Text style={styles.modalSub}>Enter your current and new password</Text>
              </View>
            </View>

            <PasswordField
              label="Current Password"
              value={currentPw}
              onChangeText={setCurrentPw}
              visible={showCurrent}
              onToggle={() => setShowCurrent(v => !v)}
            />
            <PasswordField
              label="New Password"
              value={newPw}
              onChangeText={setNewPw}
              visible={showNew}
              onToggle={() => setShowNew(v => !v)}
            />
            <PasswordField
              label="Confirm New Password"
              value={confirmPw}
              onChangeText={setConfirmPw}
              visible={showConfirm}
              onToggle={() => setShowConfirm(v => !v)}
            />

            <TouchableOpacity
              style={[styles.pwSubmit, pwLoading && { opacity: 0.7 }]}
              onPress={handleChangePassword}
              disabled={pwLoading}
              activeOpacity={0.8}
            >
              {pwLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.pwSubmitText}>Update Password</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={dismissPwModal} style={styles.pwCancel}>
              <Text style={styles.pwCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 18, gap: 20, paddingBottom: 52 },

  // ── Hero ──
  heroCard: {
    backgroundColor: `${Colors.success}08`,
    borderColor: `${Colors.success}25`,
    borderWidth: 1,
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    overflow: 'hidden',
    ...neonShadows.emerald,
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: `${Colors.success}09`,
  },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: Colors.success,
    padding: 3,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    flex: 1,
    width: '100%',
    borderRadius: 24,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.white,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  heroName: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.8,
    textAlign: 'center',
    marginBottom: 8,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: `${Colors.success}15`,
    borderColor: `${Colors.success}35`,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 20,
  },
  roleChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.success,
    letterSpacing: 0.3,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    backgroundColor: `${Colors.success}10`,
    borderColor: `${Colors.success}20`,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, fontWeight: '900', color: Colors.success },
  statLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, height: 32, backgroundColor: `${Colors.success}25`, marginHorizontal: 4 },

  // ── Section ──
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingLeft: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: {
    backgroundColor: `${Colors.success}18`,
    borderColor: `${Colors.success}30`,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.success,
  },

  // ── Card ──
  card: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginLeft: 60,
  },

  // ── Contact ──
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  contactIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contactValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 1,
  },

  // ── Assignments ──
  assignmentList: { gap: 10 },
  assignmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  subjectIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  subjectClass: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 2,
  },
  gradePill: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  gradePillText: {
    fontSize: 11,
    fontWeight: '800',
  },

  // ── Action rows ──
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  actionSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 1,
    fontWeight: '500',
  },

  // ── Footer ──
  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
    paddingTop: 4,
  },

  // ── Modal ──
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
  },
  modalGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 4,
  },
  modalIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: Colors.text },
  modalSub:   { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginTop: 2 },

  // ── Password fields ──
  pwField: { gap: 6 },
  pwFieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginLeft: 2,
  },
  pwInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  pwInput: {
    flex: 1,
    height: 46,
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600',
  },
  pwSubmit: {
    backgroundColor: Colors.success,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  pwSubmitText: { fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 0.3 },
  pwCancel: { alignItems: 'center', paddingVertical: 6 },
  pwCancelText: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
});
