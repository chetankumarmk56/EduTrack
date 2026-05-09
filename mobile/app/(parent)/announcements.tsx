import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  RefreshControl,
  Linking,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { announcementService, type Announcement } from '../../services';
import { Colors } from '../../constants/Colors';
import { LoadingScreen, EmptyState, ErrorState } from '../../components/ui/Feedback';
import { API_BASE_URL } from '../../constants';

type FilterKey = 'all' | 'unread' | 'high' | 'class' | 'personal';

const PRIORITY_META = {
  high:   { color: Colors.danger,  bg: '#fef2f2', label: 'High',   icon: 'alert-circle' as const },
  medium: { color: Colors.warning, bg: '#fffbeb', label: 'Medium', icon: 'information-circle' as const },
  low:    { color: Colors.primary, bg: '#eff6ff', label: 'Low',    icon: 'megaphone' as const },
};

function priorityKey(p: string | undefined): keyof typeof PRIORITY_META {
  const k = (p || '').toLowerCase();
  if (k === 'high' || k === 'medium' || k === 'low') return k as keyof typeof PRIORITY_META;
  return 'low';
}

function isClassType(t: string | undefined) {
  return (t || '').toUpperCase() === 'CLASS';
}

function relativeTime(iso: string) {
  const now = new Date().getTime();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function bucketFor(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const date = new Date(d); date.setHours(0,0,0,0);
  const diff = Math.round((today.getTime() - date.getTime()) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return 'This Week';
  if (diff < 30) return 'This Month';
  return 'Earlier';
}

const BUCKET_ORDER = ['Today', 'Yesterday', 'This Week', 'This Month', 'Earlier'];

function formatFull(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function attachmentMeta(type: string | null) {
  switch (type) {
    case 'image': return { icon: 'image' as const,   color: '#7c3aed', label: 'View Image' };
    case 'pdf':   return { icon: 'document-text' as const, color: Colors.danger, label: 'Open PDF' };
    case 'video': return { icon: 'play-circle' as const,   color: '#0891b2', label: 'Play Video' };
    case 'doc':   return { icon: 'document' as const, color: Colors.primary, label: 'Open Document' };
    default:      return { icon: 'attach' as const,   color: Colors.textSecondary, label: 'Open Attachment' };
  }
}

interface CardProps {
  item: Announcement;
  onPress: () => void;
  delay: number;
}

function AnnouncementCard({ item, onPress, delay }: CardProps) {
  const pk = priorityKey(item.priority);
  const pm = PRIORITY_META[pk];
  const isClass = isClassType(item.type);
  const unread = !item.is_read;
  const attachType = item.attachment_url
    ? announcementService.getAttachmentType(item.attachment_url)
    : null;

  return (
    <Animated.View
      entering={FadeInDown.delay(delay)}
      layout={LinearTransition.springify().damping(18)}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        style={[
          styles.card,
          { borderLeftColor: pm.color },
          unread && { backgroundColor: '#fafbff' },
        ]}
      >
        <View style={[styles.cardIconBox, { backgroundColor: pm.bg }]}>
          <Ionicons name={isClass ? 'people' : 'person'} size={18} color={pm.color} />
        </View>

        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.cardTop}>
            <View style={[styles.priorityChip, { backgroundColor: pm.bg }]}>
              <Ionicons name={pm.icon} size={10} color={pm.color} />
              <Text style={[styles.priorityChipText, { color: pm.color }]}>
                {pm.label.toUpperCase()}
              </Text>
            </View>
            <View style={styles.audChip}>
              <Ionicons
                name={isClass ? 'school-outline' : 'person-outline'}
                size={10}
                color={Colors.textSecondary}
              />
              <Text style={styles.audChipText}>{isClass ? 'Class' : 'Personal'}</Text>
            </View>
            {unread && <View style={[styles.unreadDot, { backgroundColor: pm.color }]} />}
          </View>

          <Text
            style={[styles.cardTitle, unread && { fontWeight: '900' }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <Text style={styles.cardMessage} numberOfLines={2}>{item.message}</Text>

          <View style={styles.cardFooter}>
            <View style={styles.byline}>
              <View style={styles.byAvatar}>
                <Text style={styles.byAvatarText}>
                  {(item.teacher_name || 'F').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.byName} numberOfLines={1}>
                {item.teacher_name || 'Faculty'}
              </Text>
            </View>
            <View style={styles.footRight}>
              {attachType && (
                <View style={styles.attachChip}>
                  <Ionicons name={attachmentMeta(attachType).icon} size={11} color={Colors.textSecondary} />
                </View>
              )}
              <Text style={styles.cardTime}>{relativeTime(item.created_at)}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

interface DetailProps {
  item: Announcement | null;
  visible: boolean;
  onClose: () => void;
}

function DetailModal({ item, visible, onClose }: DetailProps) {
  if (!item) return null;
  const pk = priorityKey(item.priority);
  const pm = PRIORITY_META[pk];
  const isClass = isClassType(item.type);
  const attachType = item.attachment_url
    ? announcementService.getAttachmentType(item.attachment_url)
    : null;
  const attachUrl = item.attachment_url
    ? announcementService.getAttachmentUrl(item.attachment_url, API_BASE_URL)
    : null;
  const attachUI = attachType ? attachmentMeta(attachType) : null;

  const open = (url: string) =>
    Linking.openURL(url).catch(() => Alert.alert('Could not open attachment'));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalSafe} edges={['top']}>
        <View style={styles.modalGrabber} />

        <View style={styles.modalHeader}>
          <View style={[styles.modalIcon, { backgroundColor: pm.bg }]}>
            <Ionicons
              name={isClass ? 'people' : 'person'}
              size={24}
              color={pm.color}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.modalChips}>
              <View style={[styles.priorityChip, { backgroundColor: pm.bg }]}>
                <Ionicons name={pm.icon} size={11} color={pm.color} />
                <Text style={[styles.priorityChipText, { color: pm.color }]}>
                  {pm.label.toUpperCase()}
                </Text>
              </View>
              <View style={styles.audChip}>
                <Ionicons
                  name={isClass ? 'school-outline' : 'person-outline'}
                  size={11}
                  color={Colors.textSecondary}
                />
                <Text style={styles.audChipText}>{isClass ? 'Class' : 'Personal'}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.modalClose} hitSlop={8}>
            <Ionicons name="close" size={20} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.modalBody}
          contentContainerStyle={styles.modalContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.modalTitle}>{item.title}</Text>

          <View style={styles.modalByline}>
            <View style={[styles.byAvatar, { width: 36, height: 36, borderRadius: 12 }]}>
              <Text style={[styles.byAvatarText, { fontSize: 14 }]}>
                {(item.teacher_name || 'F').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalByName}>{item.teacher_name || 'Faculty'}</Text>
              <Text style={styles.modalByTime}>{formatFull(item.created_at)}</Text>
            </View>
          </View>

          <View style={[styles.divider, { marginVertical: 16 }]} />

          <Text style={styles.modalMessage}>{item.message}</Text>

          {attachUrl && attachUI && (
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.attachCard, { borderColor: `${attachUI.color}30` }]}
              onPress={() => open(attachUrl)}
            >
              <View style={[styles.attachIconBig, { backgroundColor: `${attachUI.color}15` }]}>
                <Ionicons name={attachUI.icon} size={24} color={attachUI.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.attachLabel}>{attachUI.label}</Text>
                <Text style={styles.attachSub}>Tap to open</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}

          {item.is_read && (
            <View style={styles.readRow}>
              <Ionicons name="checkmark-done" size={14} color={Colors.success} />
              <Text style={styles.readText}>Read</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function AnnouncementsScreen() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const data = await announcementService.getMyAnnouncements();
      setAnnouncements(data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load announcements');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetch();
  }, [fetch]);

  const handleOpen = (item: Announcement) => {
    setSelected(item);
    if (!item.is_read) {
      // optimistic local update
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, is_read: true } : a)),
      );
      announcementService.markAsRead(item.id);
    }
  };

  const handleMarkAllRead = () => {
    const unread = announcements.filter((a) => !a.is_read);
    if (unread.length === 0) return;
    setAnnouncements((prev) => prev.map((a) => ({ ...a, is_read: true })));
    unread.forEach((a) => announcementService.markAsRead(a.id));
  };

  const counts = useMemo(() => {
    let unread = 0, high = 0, classCount = 0, personal = 0;
    for (const a of announcements) {
      if (!a.is_read) unread++;
      if ((a.priority || '').toUpperCase() === 'HIGH') high++;
      if (isClassType(a.type)) classCount++;
      else personal++;
    }
    return { all: announcements.length, unread, high, class: classCount, personal };
  }, [announcements]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return announcements
      .filter((a) => {
        if (filter === 'unread' && a.is_read) return false;
        if (filter === 'high' && (a.priority || '').toUpperCase() !== 'HIGH') return false;
        if (filter === 'class' && !isClassType(a.type)) return false;
        if (filter === 'personal' && isClassType(a.type)) return false;
        if (q) {
          const hay = `${a.title} ${a.message} ${a.teacher_name || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime());
  }, [announcements, filter, search]);

  const grouped = useMemo(() => {
    const buckets: Record<string, Announcement[]> = {};
    for (const a of filtered) {
      const b = bucketFor(a.created_at);
      if (!buckets[b]) buckets[b] = [];
      buckets[b].push(a);
    }
    return BUCKET_ORDER.filter((b) => buckets[b]?.length).map((b) => ({
      label: b,
      items: buckets[b],
    }));
  }, [filtered]);

  if (loading) return <LoadingScreen message="Loading announcements..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={[]}
        keyExtractor={() => 'x'}
        renderItem={() => null}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListHeaderComponent={
          <View style={{ gap: 14 }}>
            {/* Header */}
            <Animated.View entering={FadeInUp.duration(400)} style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Announcements</Text>
                <Text style={styles.subtitle}>
                  {counts.all === 0
                    ? 'No messages yet'
                    : counts.unread > 0
                    ? `${counts.unread} unread of ${counts.all}`
                    : `All ${counts.all} caught up`}
                </Text>
              </View>
              {counts.unread > 0 && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleMarkAllRead}
                  style={styles.markAllBtn}
                >
                  <Ionicons name="checkmark-done" size={14} color={Colors.primary} />
                  <Text style={styles.markAllText}>Mark all read</Text>
                </TouchableOpacity>
              )}
            </Animated.View>

            {error && <ErrorState message={error} onRetry={fetch} />}

            {announcements.length > 0 && (
              <>
                {/* Search */}
                <Animated.View entering={FadeInDown.delay(80)} style={styles.searchBox}>
                  <Ionicons name="search" size={18} color={Colors.textMuted} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search announcements"
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

                {/* Filter pills */}
                <Animated.View entering={FadeInDown.delay(140)}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.pillRow}
                  >
                    <FilterPill
                      active={filter === 'all'}
                      onPress={() => setFilter('all')}
                      label="All"
                      count={counts.all}
                      color={Colors.primary}
                      icon="apps"
                    />
                    <FilterPill
                      active={filter === 'unread'}
                      onPress={() => setFilter('unread')}
                      label="Unread"
                      count={counts.unread}
                      color={Colors.primary}
                      icon="ellipse"
                    />
                    <FilterPill
                      active={filter === 'high'}
                      onPress={() => setFilter('high')}
                      label="High"
                      count={counts.high}
                      color={Colors.danger}
                      icon="alert-circle"
                    />
                    <FilterPill
                      active={filter === 'class'}
                      onPress={() => setFilter('class')}
                      label="Class"
                      count={counts.class}
                      color={Colors.info}
                      icon="people"
                    />
                    <FilterPill
                      active={filter === 'personal'}
                      onPress={() => setFilter('personal')}
                      label="Personal"
                      count={counts.personal}
                      color={Colors.success}
                      icon="person"
                    />
                  </ScrollView>
                </Animated.View>
              </>
            )}

            {/* List */}
            {announcements.length === 0 && !error ? (
              <View style={{ marginTop: 48 }}>
                <EmptyState
                  icon={<Ionicons name="megaphone-outline" size={48} color={Colors.textMuted} />}
                  title="No announcements yet"
                  subtitle="When your school or teachers post updates, they'll appear here."
                />
              </View>
            ) : grouped.length === 0 ? (
              <View style={{ marginTop: 24 }}>
                <EmptyState
                  icon={<Ionicons name="filter-outline" size={36} color={Colors.textMuted} />}
                  title="No matching announcements"
                  subtitle="Try a different filter or clear your search."
                />
              </View>
            ) : (
              <View style={{ gap: 18, marginTop: 4 }}>
                {grouped.map((g) => (
                  <View key={g.label} style={{ gap: 10 }}>
                    <View style={styles.bucketRow}>
                      <Text style={styles.bucketLabel}>{g.label.toUpperCase()}</Text>
                      <View style={styles.bucketCount}>
                        <Text style={styles.bucketCountText}>{g.items.length}</Text>
                      </View>
                    </View>
                    {g.items.map((a, i) => (
                      <AnnouncementCard
                        key={a.id}
                        item={a}
                        onPress={() => handleOpen(a)}
                        delay={i * 35}
                      />
                    ))}
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 32 }} />
          </View>
        }
      />

      <DetailModal
        item={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
      />
    </SafeAreaView>
  );
}

interface FilterPillProps {
  active: boolean;
  onPress: () => void;
  label: string;
  count: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}
function FilterPill({ active, onPress, label, count, color, icon }: FilterPillProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.pill,
        active && { backgroundColor: color, borderColor: color },
      ]}
    >
      <Ionicons name={icon} size={13} color={active ? Colors.white : color} />
      <Text style={[styles.pillLabel, { color: active ? Colors.white : Colors.text }]}>
        {label}
      </Text>
      <View
        style={[
          styles.pillCount,
          { backgroundColor: active ? 'rgba(255,255,255,0.25)' : `${color}15` },
        ]}
      >
        <Text style={[styles.pillCountText, { color: active ? Colors.white : color }]}>
          {count}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 18 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 28, fontWeight: '900', color: Colors.text, letterSpacing: -1 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginTop: 2 },

  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${Colors.primary}10`,
    borderColor: `${Colors.primary}30`,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  markAllText: { fontSize: 12, fontWeight: '900', color: Colors.primary },

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

  pillRow: { gap: 8, paddingVertical: 2, paddingRight: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  pillLabel: { fontSize: 13, fontWeight: '800' },
  pillCount: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 22,
    alignItems: 'center',
  },
  pillCountText: { fontSize: 11, fontWeight: '900' },

  bucketRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  bucketLabel: { fontSize: 11, fontWeight: '900', color: Colors.text, letterSpacing: 1 },
  bucketCount: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  bucketCountText: { fontSize: 10, fontWeight: '900', color: Colors.textSecondary },

  // CARD
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
  },
  cardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  priorityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  priorityChipText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  audChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  audChipText: { fontSize: 10, fontWeight: '800', color: Colors.textSecondary },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 'auto' },

  cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, lineHeight: 20, letterSpacing: -0.2 },
  cardMessage: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  byAvatar: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  byAvatarText: { fontSize: 11, fontWeight: '900', color: Colors.textSecondary },
  byName: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, flex: 1 },

  footRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attachChip: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTime: { fontSize: 11, fontWeight: '800', color: Colors.textMuted },

  // MODAL
  modalSafe: { flex: 1, backgroundColor: Colors.background },
  modalGrabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  modalIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalChips: { flexDirection: 'row', gap: 6 },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalBody: { flex: 1 },
  modalContent: { padding: 18, paddingBottom: 40, gap: 0 },
  modalTitle: { fontSize: 24, fontWeight: '900', color: Colors.text, letterSpacing: -0.6, lineHeight: 30 },

  modalByline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  modalByName: { fontSize: 14, fontWeight: '800', color: Colors.text },
  modalByTime: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginTop: 1 },

  divider: { height: 1, backgroundColor: Colors.divider },

  modalMessage: { fontSize: 15, color: Colors.text, lineHeight: 24, fontWeight: '500' },

  attachCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 22,
    padding: 14,
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
  },
  attachIconBig: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachLabel: { fontSize: 14, fontWeight: '900', color: Colors.text },
  attachSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontWeight: '600' },

  readRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 18 },
  readText: { fontSize: 12, fontWeight: '800', color: Colors.success },
});
