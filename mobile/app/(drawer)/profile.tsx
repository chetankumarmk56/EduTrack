import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

interface InfoRowProps {
  label: string;
  value: string;
}
function InfoRow({ label, value }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

interface MenuItemProps {
  emoji: string;
  label: string;
  sub?: string;
  onPress?: () => void;
  color?: string;
}
function MenuItem({ emoji, label, sub, onPress, color }: MenuItemProps) {
  return (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.menuEmoji, { backgroundColor: color ? `${color}22` : Colors.surfaceElevated }]}>
        <Text style={styles.menuEmojiText}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuLabel, color ? { color } : {}]}>{label}</Text>
        {sub && <Text style={styles.menuSub}>{sub}</Text>}
      </View>
      <Text style={styles.menuChevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/login');
          },
        },
      ],
    );
  };

  const displayName = user?.name || 'User';
  const roleLabel =
    user?.role === 'parent' ? 'Parent / Student'
    : user?.role === 'teacher' ? 'Teacher'
    : user?.role === 'admin' ? 'Administrator'
    : user?.role === 'super_admin' ? 'Super Admin'
    : 'User';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar & Name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{displayName[0]?.toUpperCase()}</Text>
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>{roleLabel}</Text>
          </View>
          {user?.institution_id && (
            <Text style={styles.institutionTag}>Institution #{user.institution_id}</Text>
          )}
        </View>

        {/* Account Info */}
        <Card style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Account Details</Text>
          <InfoRow label="Name" value={displayName} />
          {user?.email && <InfoRow label="Email" value={user.email} />}
          <InfoRow label="Role" value={roleLabel} />
          <InfoRow label="User ID" value={`#${user?.id || '—'}`} />
          {user?.institution_id && (
            <InfoRow label="Institution" value={`#${user.institution_id}`} />
          )}
          {(user?.class_level || user?.school_class?.grade?.level) && (
            <InfoRow
              label="Class"
              value={`Grade ${user?.school_class?.grade?.level || user?.class_level}${user?.section || user?.school_class?.section?.name || ''}`}
            />
          )}
        </Card>

        {/* Quick Navigation */}
        <Card style={styles.menuCard}>
          <Text style={styles.sectionTitle}>Quick Access</Text>
          <MenuItem
            emoji="🏠"
            label="Dashboard"
            sub="View your academic overview"
            onPress={() => router.push('/dashboard')}
          />
          <MenuItem
            emoji="📢"
            label="Announcements"
            sub="School & class updates"
            onPress={() => router.push('/announcements')}
          />
          <MenuItem
            emoji="💳"
            label="Fees & Payments"
            sub="Manage your dues"
            onPress={() => router.push('/payments')}
          />
          <MenuItem
            emoji="📚"
            label="Report Card"
            sub="View marks and performance"
            onPress={() => router.push('/academics')}
          />
          <MenuItem
            emoji="✨"
            label="AI Question Generator"
            sub="Practice with AI-generated questions"
            onPress={() => router.push('/ai-questions')}
            color={Colors.secondary}
          />
        </Card>

        {/* App Info */}
        <Card style={styles.menuCard}>
          <Text style={styles.sectionTitle}>App</Text>
          <MenuItem emoji="ℹ️" label="About EduTrack" sub="Version 1.0.0" />
          <MenuItem
            emoji="🔴"
            label="Sign Out"
            sub="Log out of your account"
            onPress={handleLogout}
            color={Colors.danger}
          />
        </Card>

        {/* Footer */}
        <Text style={styles.footerText}>EduTrack Mobile · Built with ❤️</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, gap: 20, paddingBottom: 40 },

  avatarSection: { alignItems: 'center', gap: 10, paddingVertical: 16 },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: `${Colors.primary}44`,
  },
  avatarText: { fontSize: 36, fontWeight: '900', color: Colors.white },
  displayName: { fontSize: 24, fontWeight: '900', color: Colors.text, letterSpacing: -0.5 },
  roleChip: {
    backgroundColor: Colors.overlay10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleChipText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  institutionTag: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },

  infoCard: { gap: 0 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  infoValue: { fontSize: 14, color: Colors.text, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },

  menuCard: { gap: 0 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuEmoji: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuEmojiText: { fontSize: 20 },
  menuLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
  menuSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontWeight: '500' },
  menuChevron: { fontSize: 20, color: Colors.textMuted, fontWeight: '300' },

  footerText: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
    paddingTop: 8,
  },
});
