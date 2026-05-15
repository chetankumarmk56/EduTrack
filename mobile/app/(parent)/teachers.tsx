import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Alert,
  TextInput,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { directoryService, type Teacher } from '../../services';
import { Colors } from '@/shared/constants/Colors';
import { LoadingScreen, EmptyState, ErrorState } from '@/shared/components/ui/Feedback';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AVATAR_PALETTE = [
  '#2563eb', '#7c3aed', '#db2777', '#ea580c',
  '#0891b2', '#16a34a', '#ca8a04', '#dc2626',
  '#0d9488', '#9333ea', '#0369a1', '#65a30d',
];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function uniqueSubjects(t: Teacher): string[] {
  const set = new Set<string>();
  (t.assignments ?? []).forEach((a) => {
    const s = a.subject_ref?.name?.trim();
    if (s) set.add(s);
  });
  (t.subjects ?? []).forEach((s) => s && set.add(s));
  return Array.from(set);
}

function uniqueClasses(t: Teacher): string[] {
  const set = new Set<string>();
  (t.assignments ?? []).forEach((a) => {
    const c = a.school_class;
    if (!c) return;
    const label =
      c.display_name ??
      [c.grade?.name ?? (c.grade?.level ? `Grade ${c.grade.level}` : null), c.section?.name]
        .filter(Boolean)
        .join(' ');
    if (label) set.add(label);
  });
  return Array.from(set);
}

export default function TeachersScreen() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchTeachers = useCallback(async () => {
    setError(null);
    try {
      const data = await directoryService.getTeachers();
      setTeachers(data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load faculty');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTeachers();
  }, [fetchTeachers]);

  const allSubjects = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => uniqueSubjects(t).forEach((s) => set.add(s)));
    return Array.from(set).sort();
  }, [teachers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teachers.filter((t) => {
      const subjects = uniqueSubjects(t);
      const classes = uniqueClasses(t);
      const matchesQ =
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.email || '').toLowerCase().includes(q) ||
        subjects.some((s) => s.toLowerCase().includes(q)) ||
        classes.some((c) => c.toLowerCase().includes(q));
      const matchesSubject = !subjectFilter || subjects.includes(subjectFilter);
      return matchesQ && matchesSubject;
    });
  }, [teachers, search, subjectFilter]);

  const totalChannels = useMemo(
    () =>
      teachers.reduce(
        (sum, t) => sum + (t.phone ? 1 : 0) + (t.whatsapp ? 1 : 0) + (t.email ? 1 : 0),
        0,
      ),
    [teachers],
  );

  const toggleExpand = (id: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Could not open dialer'));
  };
  const handleWhatsApp = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    Linking.openURL(`whatsapp://send?phone=${cleaned}`).catch(() =>
      Alert.alert('WhatsApp not available', 'Install WhatsApp to start a chat.'),
    );
  };
  const handleEmail = (email: string) => {
    Linking.openURL(`mailto:${email}`).catch(() => Alert.alert('Could not open mail app'));
  };

  if (loading) return <LoadingScreen message="Loading faculty..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeInUp.duration(400)} style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>My Teachers</Text>
            <Text style={styles.subtitle}>
              {teachers.length} faculty · {totalChannels} contact{totalChannels === 1 ? '' : 's'}
            </Text>
          </View>
        </Animated.View>

        {error && <ErrorState message={error} onRetry={fetchTeachers} />}

        {teachers.length > 0 && (
          <>
            {/* Search */}
            <Animated.View entering={FadeInDown.delay(80)} style={styles.searchBox}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name, subject or class"
                placeholderTextColor={Colors.textMuted}
                style={styles.searchInput}
                returnKeyType="search"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </Animated.View>

            {/* Subject pills */}
            {allSubjects.length > 0 && (
              <Animated.View entering={FadeInDown.delay(140)}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pillsRow}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setSubjectFilter(null)}
                    style={[styles.pill, !subjectFilter && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, !subjectFilter && styles.pillTextActive]}>All</Text>
                  </TouchableOpacity>
                  {allSubjects.map((s) => {
                    const active = subjectFilter === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        activeOpacity={0.85}
                        onPress={() => setSubjectFilter(active ? null : s)}
                        style={[styles.pill, active && styles.pillActive]}
                      >
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>{s}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </Animated.View>
            )}
          </>
        )}

        {/* List */}
        <View style={styles.list}>
          {teachers.length === 0 && !error ? (
            <View style={{ marginTop: 40 }}>
              <EmptyState
                icon={<Ionicons name="people-outline" size={48} color={Colors.textMuted} />}
                title="No teachers yet"
                subtitle="Your faculty list will appear here once classes are assigned."
              />
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ marginTop: 24 }}>
              <EmptyState
                icon={<Ionicons name="search-outline" size={36} color={Colors.textMuted} />}
                title="No matching teachers"
                subtitle="Try a different name, subject or class."
              />
            </View>
          ) : (
            filtered.map((teacher, idx) => {
              const subjects = uniqueSubjects(teacher);
              const classes = uniqueClasses(teacher);
              const accent = colorFor(teacher.name || 'T');
              const isOpen = expandedId === teacher.id;
              const hasPhone = !!teacher.phone;
              const hasWa = !!teacher.whatsapp;
              const hasEmail = !!teacher.email;

              return (
                <Animated.View
                  key={teacher.id}
                  entering={FadeInDown.delay(idx * 40)}
                  layout={LinearTransition.springify().damping(18)}
                  style={[styles.card, { borderLeftColor: accent }]}
                >
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => toggleExpand(teacher.id)}
                    style={styles.cardHeader}
                  >
                    {/* Avatar */}
                    <View style={[styles.avatar, { backgroundColor: accent }]}>
                      <Text style={styles.avatarText}>{initialsOf(teacher.name)}</Text>
                      {teacher.is_active !== false && <View style={styles.dot} />}
                    </View>

                    <View style={styles.cardInfo}>
                      <Text style={styles.name} numberOfLines={1}>
                        {teacher.name || 'Unknown'}
                      </Text>
                      {subjects.length > 0 ? (
                        <View style={styles.subjectRow}>
                          {subjects.slice(0, 3).map((s) => (
                            <View
                              key={s}
                              style={[styles.subjectChip, { backgroundColor: `${accent}15` }]}
                            >
                              <Text style={[styles.subjectChipText, { color: accent }]}>
                                {s}
                              </Text>
                            </View>
                          ))}
                          {subjects.length > 3 && (
                            <View style={styles.subjectChip}>
                              <Text style={[styles.subjectChipText, { color: Colors.textMuted }]}>
                                +{subjects.length - 3}
                              </Text>
                            </View>
                          )}
                        </View>
                      ) : (
                        <Text style={styles.subDim}>Faculty</Text>
                      )}
                    </View>

                    <Ionicons
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={Colors.textMuted}
                    />
                  </TouchableOpacity>

                  {/* Quick action row — always visible */}
                  <View style={styles.actionRow}>
                    <ActionBtn
                      enabled={hasPhone}
                      icon="call"
                      label="Call"
                      color={Colors.primary}
                      onPress={() => teacher.phone && handleCall(teacher.phone)}
                    />
                    <ActionBtn
                      enabled={hasWa}
                      icon="logo-whatsapp"
                      label="WhatsApp"
                      color="#16a34a"
                      onPress={() => teacher.whatsapp && handleWhatsApp(teacher.whatsapp)}
                    />
                    <ActionBtn
                      enabled={hasEmail}
                      icon="mail"
                      label="Email"
                      color="#7c3aed"
                      onPress={() => teacher.email && handleEmail(teacher.email)}
                    />
                  </View>

                  {/* Expanded detail panel */}
                  {isOpen && (
                    <View style={styles.detail}>
                      {classes.length > 0 && (
                        <View style={styles.detailBlock}>
                          <Text style={styles.detailLabel}>CLASSES</Text>
                          <View style={styles.tagRow}>
                            {classes.map((c) => (
                              <View key={c} style={styles.tag}>
                                <Ionicons name="school-outline" size={12} color={Colors.textSecondary} />
                                <Text style={styles.tagText}>{c}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {subjects.length > 0 && (
                        <View style={styles.detailBlock}>
                          <Text style={styles.detailLabel}>SUBJECTS TAUGHT</Text>
                          <View style={styles.tagRow}>
                            {subjects.map((s) => (
                              <View
                                key={s}
                                style={[styles.tag, { backgroundColor: `${accent}10`, borderColor: `${accent}30` }]}
                              >
                                <Ionicons name="book-outline" size={12} color={accent} />
                                <Text style={[styles.tagText, { color: accent }]}>{s}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      <View style={styles.detailBlock}>
                        <Text style={styles.detailLabel}>CONTACT</Text>
                        {hasEmail && (
                          <ContactRow
                            icon="mail-outline"
                            label={teacher.email!}
                            onPress={() => handleEmail(teacher.email!)}
                          />
                        )}
                        {hasPhone && (
                          <ContactRow
                            icon="call-outline"
                            label={teacher.phone!}
                            onPress={() => handleCall(teacher.phone!)}
                          />
                        )}
                        {hasWa && (
                          <ContactRow
                            icon="logo-whatsapp"
                            label={teacher.whatsapp!}
                            iconColor="#16a34a"
                            onPress={() => handleWhatsApp(teacher.whatsapp!)}
                          />
                        )}
                        {!hasEmail && !hasPhone && !hasWa && (
                          <Text style={styles.subDim}>No contact details on file</Text>
                        )}
                      </View>
                    </View>
                  )}
                </Animated.View>
              );
            })
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

interface ActionBtnProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  enabled: boolean;
  onPress: () => void;
}
function ActionBtn({ icon, label, color, enabled, onPress }: ActionBtnProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={!enabled}
      onPress={onPress}
      style={[
        styles.actionBtn,
        enabled
          ? { backgroundColor: `${color}10`, borderColor: `${color}30` }
          : styles.actionBtnDisabled,
      ]}
    >
      <Ionicons name={icon} size={16} color={enabled ? color : Colors.textMuted} />
      <Text
        style={[
          styles.actionBtnLabel,
          { color: enabled ? color : Colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface ContactRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  iconColor?: string;
  onPress: () => void;
}
function ContactRow({ icon, label, iconColor = Colors.textSecondary, onPress }: ContactRowProps) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.contactRow}>
      <View style={styles.contactIcon}>
        <Ionicons name={icon} size={15} color={iconColor} />
      </View>
      <Text style={styles.contactLabel} numberOfLines={1}>{label}</Text>
      <Ionicons name="open-outline" size={14} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 18, gap: 14 },

  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '900', color: Colors.text, letterSpacing: -1 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginTop: 2 },

  // Search
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    padding: 0,
  },

  // Pills
  pillsRow: { gap: 8, paddingVertical: 2, paddingRight: 12 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: 12, fontWeight: '800', color: Colors.text },
  pillTextActive: { color: Colors.white },

  // List
  list: { gap: 12, marginTop: 4 },

  card: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },

  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.white, fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  dot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.success,
    borderWidth: 3,
    borderColor: Colors.background,
  },

  cardInfo: { flex: 1, gap: 6 },
  name: { fontSize: 16, fontWeight: '900', color: Colors.text, letterSpacing: -0.4 },
  subDim: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },

  subjectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  subjectChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  subjectChipText: { fontSize: 11, fontWeight: '800' },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionBtnDisabled: {
    backgroundColor: Colors.surface,
    borderColor: Colors.divider,
  },
  actionBtnLabel: { fontSize: 12, fontWeight: '900' },

  // Detail
  detail: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    paddingTop: 4,
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  detailBlock: { gap: 8 },
  detailLabel: { fontSize: 10, fontWeight: '900', color: Colors.textMuted, letterSpacing: 1 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagText: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  contactIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  contactLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.text },
});
