import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { directoryService, type StudentProfile, type Teacher } from '../../services';
import { Colors } from '@/shared/constants/Colors';
import { LoadingScreen } from '@/shared/components/ui/Feedback';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

type DirectoryTab = 'FACULTY' | 'STUDENTS';

const AVATAR_PALETTE = [
  Colors.primary,
  Colors.success,
  Colors.warning,
  '#8b5cf6',
  '#ec4899',
  Colors.info,
];

function getAvatarColor(name: string): string {
  return AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];
}

export default function TeacherContacts() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<DirectoryTab>('FACULTY');
  const [faculty, setFaculty] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [facData, stuData] = await Promise.all([
        directoryService.getTeachers(),
        directoryService.getTeacherStudents(),
      ]);
      setFaculty(facData.sort((a, b) => a.name.localeCompare(b.name)));
      const gradeNum = (name?: string) =>
        parseInt(name?.match(/\d+/)?.[0] ?? '0', 10) || 0;
      setStudents(stuData.sort((a, b) => {
        const gA = gradeNum(a.school_class?.grade?.name);
        const gB = gradeNum(b.school_class?.grade?.name);
        if (gB !== gA) return gB - gA;                          // 10 → 9 → 8
        const secA = a.school_class?.section?.name ?? '';
        const secB = b.school_class?.section?.name ?? '';
        if (secA !== secB) return secA.localeCompare(secB);     // A → B → C
        return a.name.localeCompare(b.name);
      }));
    } catch (error) {
      console.error('Failed to load directory:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCall = (phone: string | null | undefined) => {
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  const handleEmail = (email: string | null | undefined) => {
    if (email) Linking.openURL(`mailto:${email}`);
  };

  const handleWhatsApp = (phone: string | null | undefined) => {
    if (!phone) return;
    const cleaned = phone.replace(/\D/g, '');
    const url = `whatsapp://send?phone=${cleaned}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert('Error', 'WhatsApp is not installed on this device.');
      }
    });
  };

  if (loading) return <LoadingScreen message="Loading directory..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* ── Tab Bar ── */}
      <View style={styles.tabBarWrapper}>
        <View style={styles.tabBarContainer}>
          {(['FACULTY', 'STUDENTS'] as DirectoryTab[]).map(tab => {
            const isActive = activeTab === tab;
            const isFaculty = tab === 'FACULTY';
            const count = isFaculty ? faculty.length : students.length;
            const label = isFaculty ? 'Faculty' : 'Students';
            const icon: any = isFaculty ? 'school-outline' : 'people-outline';

            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={icon}
                  size={18}
                  color={isActive ? Colors.white : Colors.textMuted}
                />
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {label}
                </Text>
                <View style={[styles.countBadge, isActive ? styles.countBadgeActive : styles.countBadgeInactive]}>
                  <Text style={[styles.countBadgeText, isActive && styles.countBadgeTextActive]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Stats Bar ── */}
      <View style={styles.statsBar}>
        <Text style={styles.statItem}>
          <Text style={styles.statCount}>{faculty.length}</Text>
          {' Faculty'}
        </Text>
        <View style={styles.statDivider} />
        <Text style={styles.statItem}>
          <Text style={styles.statCount}>{students.length}</Text>
          {' Students'}
        </Text>
      </View>

      {/* ── List ── */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.success}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Section heading */}
        <View style={styles.sectionHeadingRow}>
          <View style={styles.sectionHeadingAccent} />
          <Text style={styles.sectionHeadingText}>
            {activeTab === 'FACULTY' ? 'Campus Directory' : 'Student Roster'}
          </Text>
        </View>

        {/* Search bar — students only */}
        {activeTab === 'STUDENTS' && (
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search students by name…"
              placeholderTextColor={Colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
              autoCapitalize="words"
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {activeTab === 'FACULTY'
          ? faculty.map((teacher, index) => (
              <Animated.View key={teacher.id} entering={FadeInDown.delay(index * 50)}>
                {index > 0 && <View style={styles.cardDivider} />}
                <ContactCard
                  name={teacher.name}
                  sub={teacher.email}
                  role="Teacher"
                  phone={teacher.whatsapp || teacher.phone}
                  email={teacher.email}
                  onCall={() => handleCall(teacher.phone)}
                  onEmail={() => handleEmail(teacher.email)}
                  onWhatsApp={() => handleWhatsApp(teacher.whatsapp || teacher.phone)}
                />
              </Animated.View>
            ))
          : students
              .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((student, index) => (
                <Animated.View key={student.id} entering={FadeInDown.delay(index * 30)}>
                  {index > 0 && <View style={styles.cardDivider} />}
                  <ContactCard
                    name={student.name}
                    sub={`${student.school_class?.grade?.name || 'Class'}-${student.school_class?.section?.name || ''}`}
                    role="Student"
                    phone={student.whatsapp || student.parent_phone}
                    email={student.parent_email}
                    rollNo={index + 1}
                    onCall={() => handleCall(student.parent_phone)}
                    onEmail={() => handleEmail(student.parent_email)}
                    onWhatsApp={() => handleWhatsApp(student.whatsapp || student.parent_phone)}
                  />
                </Animated.View>
              ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── ContactCard ──────────────────────────────────────────────────────────────

function ContactCard({
  name,
  sub,
  role,
  phone,
  email,
  rollNo,
  onCall,
  onEmail,
  onWhatsApp,
}: any) {
  const avatarColor = getAvatarColor(name);

  return (
    <View style={styles.card}>
      {/* Left: Avatar + Info */}
      <View style={styles.cardLeft}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>

        {/* Name / sub / role badge */}
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
          {role === 'Student' ? (
            <View style={styles.gradeBadge}>
              <Ionicons name="school-outline" size={10} color={Colors.primary} style={{ marginRight: 3 }} />
              <Text style={styles.gradeBadgeText}>{sub}</Text>
            </View>
          ) : (
            <View style={styles.facultyBadge}>
              <Text style={styles.facultyBadgeText}>Faculty</Text>
            </View>
          )}
          {role === 'Teacher' && (
            <Text style={styles.cardSub} numberOfLines={1}>{sub}</Text>
          )}
        </View>
      </View>

      {/* Right: Action Buttons */}
      <View style={styles.actions}>
        {/* WhatsApp */}
        <ActionButton
          icon="logo-whatsapp"
          color="#25D366"
          enabled={!!phone}
          onPress={onWhatsApp}
        />
        {/* Call */}
        <ActionButton
          icon="call-outline"
          color={Colors.success}
          enabled={!!phone}
          onPress={onCall}
        />
        {/* Email */}
        <ActionButton
          icon="mail-outline"
          color={Colors.primary}
          enabled={!!email}
          onPress={onEmail}
        />
      </View>
    </View>
  );
}

// ── ActionButton ─────────────────────────────────────────────────────────────

function ActionButton({
  icon,
  color,
  enabled,
  onPress,
}: {
  icon: any;
  color: string;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        { backgroundColor: enabled ? `${color}15` : Colors.surfaceElevated },
        !enabled && styles.disabledBtn,
      ]}
      onPress={onPress}
      disabled={!enabled}
      activeOpacity={0.7}
    >
      <Ionicons
        name={icon}
        size={18}
        color={enabled ? color : Colors.textMuted}
      />
    </TouchableOpacity>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Tab bar
  tabBarWrapper: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: Colors.success,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  tabLabelActive: {
    color: Colors.white,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  countBadgeInactive: {
    backgroundColor: Colors.surfaceElevated,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  countBadgeTextActive: {
    color: Colors.white,
  },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    gap: 12,
  },
  statItem: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  statCount: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '800',
  },
  statDivider: {
    width: 1,
    height: 12,
    backgroundColor: Colors.border,
  },

  // Scroll
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  // Section heading
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionHeadingAccent: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: Colors.success,
  },
  sectionHeadingText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 0.2,
  },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Colors.white,
    borderRadius: 20,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  cardDivider: {
    height: 10,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 13,
    marginRight: 10,
  },

  // Avatar
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '900',
  },

  // Card info
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 0.1,
  },
  cardSub: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },

  // Grade badge (students)
  gradeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: `${Colors.primary}12`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gradeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Faculty badge
  facultyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: `${Colors.info}15`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  facultyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.info,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: 7,
    flexShrink: 0,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    opacity: 0.45,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 8,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
    paddingVertical: 0,
  },
});
