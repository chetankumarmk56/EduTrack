import React, { useEffect, useState } from 'react';
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
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { directoryService } from '@/features/directory/services/directoryService';
import { authService } from '@/features/auth/services/authService';
import { Colors } from '@/shared/constants/Colors';

// ── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  '#2563eb', '#0891b2', '#7c3aed', '#db2777',
  '#16a34a', '#ea580c', '#0d9488', '#9333ea',
  '#e11d48', '#65a30d', '#4f46e5', '#0284c7',
];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatDOB(dob?: string): string {
  if (!dob) return '—';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return dob;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DetailRow({
  icon, iconColor, label, value, last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, last && { borderBottomWidth: 0 }]}>
      <View style={[styles.detailIconBox, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ContactRow({
  icon, iconColor, label, value, onPress, last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const isActive = !!onPress && value !== '—';
  return (
    <TouchableOpacity
      style={[styles.detailRow, last && { borderBottomWidth: 0 }]}
      onPress={onPress}
      activeOpacity={isActive ? 0.7 : 1}
      disabled={!isActive}
    >
      <View style={[styles.detailIconBox, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.contactValueRow}>
        <Text
          style={[styles.detailValue, isActive && { color: Colors.primary }]}
          numberOfLines={1}
        >
          {value}
        </Text>
        {isActive && <Ionicons name="open-outline" size={13} color={Colors.primary} />}
      </View>
    </TouchableOpacity>
  );
}

function PasswordField({
  label, value, onChangeText, visible, onToggle,
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

const QUICK_LINKS = [
  { icon: 'grid',      label: 'Dashboard',  color: '#2563eb', bg: '#eff6ff', route: '/(parent)/dashboard' },
  { icon: 'bar-chart', label: 'Marks',       color: '#7c3aed', bg: '#f5f3ff', route: '/(parent)/marks' },
  { icon: 'calendar',  label: 'Attendance',  color: '#16a34a', bg: '#f0fdf4', route: '/(parent)/attendance' },
  { icon: 'wallet',    label: 'Fees',         color: '#ea580c', bg: '#fff7ed', route: '/(parent)/fees' },
  { icon: 'megaphone', label: 'Notices',      color: '#db2777', bg: '#fdf2f8', route: '/(parent)/announcements' },
  { icon: 'people',    label: 'Teachers',     color: '#0891b2', bg: '#ecfeff', route: '/(parent)/teachers' },
] as const;

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);

  const [showPwModal, setShowPwModal] = useState(false);
  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [showCurrent, setShowCurrent]   = useState(false);
  const [showNew, setShowNew]           = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [pwLoading, setPwLoading]   = useState(false);

  const displayName  = user?.name || 'User';
  const avatarColor  = colorFor(displayName);
  const isTeacher    = user?.role === 'teacher';
  const roleLabel    = isTeacher ? 'Teacher' : 'Parent';

  useEffect(() => {
    directoryService.getMyProfile()
      .then(p => setProfile(p))
      .catch(() => {});
  }, []);

  // ── derived profile fields ──
  const classDisplay = (() => {
    if (profile?.school_class?.display_name) return profile.school_class.display_name;
    const grade   = profile?.school_class?.grade?.name   || profile?.class_level;
    const section = profile?.school_class?.section?.name || profile?.section;
    if (grade && section) return `${grade} – ${section}`;
    return grade || user?.school_class?.display_name || '—';
  })();

  const rollNo      = profile?.roll_no   ? String(profile.roll_no) : '—';
  const dob         = formatDOB(profile?.dob);
  const parentPhone = profile?.parent_phone || '—';
  const parentEmail = profile?.parent_email || '—';
  const whatsapp    = profile?.whatsapp;

  // ── handlers ──
  const handleLogout = () =>
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => { await logout(); router.replace('/login'); },
      },
    ]);

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
          style={[styles.heroCard, { backgroundColor: avatarColor }]}
        >
          <View style={[styles.bubble, { width: 180, height: 180, top: -70, right: -50 }]} />
          <View style={[styles.bubble, { width: 110, height: 110, bottom: -30, left: 10 }]} />
          <View style={[styles.bubble, { width: 60, height: 60, top: 20, left: '45%' }]} />

          <View style={styles.heroContent}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{initialsOf(displayName)}</Text>
            </View>

            <View style={styles.heroInfo}>
              <Text style={styles.heroName} numberOfLines={2}>{displayName}</Text>
              <View style={styles.heroBadgeRow}>
                <View style={styles.heroBadge}>
                  <Ionicons
                    name={isTeacher ? 'person' : 'people'}
                    size={11}
                    color="rgba(255,255,255,0.95)"
                  />
                  <Text style={styles.heroBadgeText}>{roleLabel}</Text>
                </View>
                {!isTeacher && classDisplay !== '—' && (
                  <View style={[styles.heroBadge, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                    <Ionicons name="school" size={11} color="rgba(255,255,255,0.95)" />
                    <Text style={styles.heroBadgeText}>{classDisplay}</Text>
                  </View>
                )}
              </View>
              {user?.email ? (
                <Text style={styles.heroEmail} numberOfLines={1}>{user.email}</Text>
              ) : null}
            </View>
          </View>
        </Animated.View>

        {/* ── Student Details ── */}
        {!isTeacher && (
          <Animated.View entering={FadeInDown.delay(80).springify().damping(18)} style={styles.section}>
            <Text style={styles.sectionLabel}>Student Details</Text>
            <View style={styles.card}>
              <DetailRow icon="bookmark"    iconColor="#2563eb" label="Roll No."      value={rollNo} />
              <DetailRow icon="school"      iconColor="#7c3aed" label="Class"         value={classDisplay} />
              <DetailRow icon="calendar"    iconColor="#16a34a" label="Date of Birth" value={dob}    last />
            </View>
          </Animated.View>
        )}

        {/* ── Parent Contact ── */}
        {!isTeacher && (
          <Animated.View entering={FadeInDown.delay(160).springify().damping(18)} style={styles.section}>
            <Text style={styles.sectionLabel}>Parent Contact</Text>
            <View style={styles.card}>
              <ContactRow
                icon="call"         iconColor="#16a34a"
                label="Phone"       value={parentPhone}
                onPress={parentPhone !== '—' ? () => Linking.openURL(`tel:${parentPhone}`) : undefined}
              />
              <ContactRow
                icon="mail"         iconColor="#2563eb"
                label="Email"       value={parentEmail}
                onPress={parentEmail !== '—' ? () => Linking.openURL(`mailto:${parentEmail}`) : undefined}
              />
              <ContactRow
                icon="logo-whatsapp" iconColor="#16a34a"
                label="WhatsApp"    value={whatsapp || '—'}
                onPress={whatsapp ? () => Linking.openURL(`https://wa.me/${whatsapp.replace(/\D/g, '')}`) : undefined}
                last
              />
            </View>
          </Animated.View>
        )}

        {/* ── Quick Access ── */}
        <Animated.View entering={FadeInDown.delay(240).springify().damping(18)} style={styles.section}>
          <Text style={styles.sectionLabel}>Quick Access</Text>
          <View style={styles.quickGrid}>
            {QUICK_LINKS.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={[styles.quickTile, { backgroundColor: item.bg }]}
                onPress={() => router.push(item.route as any)}
                activeOpacity={0.72}
              >
                <View style={[styles.quickIconBox, { backgroundColor: item.color + '22' }]}>
                  <Ionicons name={item.icon as any} size={22} color={item.color} />
                </View>
                <Text style={[styles.quickLabel, { color: item.color }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* ── Account Settings ── */}
        <Animated.View entering={FadeInDown.delay(320).springify().damping(18)} style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.card}>
            {isTeacher && (
              <>
                <TouchableOpacity style={styles.actionRow} onPress={() => setShowPwModal(true)} activeOpacity={0.7}>
                  <View style={[styles.actionIcon, { backgroundColor: '#eff6ff' }]}>
                    <Ionicons name="lock-closed" size={18} color="#2563eb" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionLabel}>Change Password</Text>
                    <Text style={styles.actionSub}>Update your account password</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
                <View style={styles.divider} />
              </>
            )}

            <TouchableOpacity style={styles.actionRow} onPress={handleLogout} activeOpacity={0.7}>
              <View style={[styles.actionIcon, { backgroundColor: '#fef2f2' }]}>
                <Ionicons name="log-out" size={18} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionLabel, { color: '#ef4444' }]}>Sign Out</Text>
                <Text style={styles.actionSub}>Log out of your account</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Text style={styles.footer}>EduTrack · v1.0.0</Text>
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
              <View style={[styles.modalIconBadge, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="lock-closed" size={22} color="#2563eb" />
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
  scroll: { padding: 18, gap: 18, paddingBottom: 48 },

  // Hero
  heroCard: {
    borderRadius: 24,
    padding: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  bubble: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  heroContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarCircle: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText:    { fontSize: 30, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  heroInfo:      { flex: 1, gap: 6 },
  heroName:      { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  heroBadgeRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.28)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  heroBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  heroEmail:     { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },

  // Section
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    paddingLeft: 2,
  },

  // Cards
  card: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  divider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: 16 },

  // Detail rows
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  detailIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    maxWidth: '45%',
    textAlign: 'right',
  },
  contactValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '45%',
  },

  // Quick grid
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickTile: {
    width: '30.5%',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  quickIconBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 12, fontWeight: '800', textAlign: 'center' },

  // Action rows
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
  actionLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
  actionSub:   { fontSize: 12, color: Colors.textMuted, marginTop: 1, fontWeight: '500' },

  // Footer
  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
    paddingTop: 4,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
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

  // Password fields
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
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  pwSubmitText: { fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 0.3 },
  pwCancel: { alignItems: 'center', paddingVertical: 6 },
  pwCancelText: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
});
