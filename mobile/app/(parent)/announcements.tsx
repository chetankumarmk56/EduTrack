import React, { useEffect, useState, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { announcementService, type Announcement } from '../../services';
import { Colors } from '../../constants/Colors';
import { neonShadows } from '@/styles/neonStyles';
import { LoadingScreen, EmptyState, ErrorState } from '../../components/ui/Feedback';
import { API_BASE_URL, PRIORITY_CONFIG } from '../../constants';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AnnouncementCard({
  item,
  onPress,
}: {
  item: Announcement;
  onPress: () => void;
}) {
  const priorityKey = item.priority?.toLowerCase() as 'low' | 'medium' | 'high';
  const pc = PRIORITY_CONFIG[priorityKey] || PRIORITY_CONFIG.low;
  const isClassType = item.type?.toUpperCase() === 'CLASS';
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Priority accent bar */}
      <View style={[styles.priorityBar, { backgroundColor: pc.color }]} />
      <View style={styles.cardInner}>
        <View style={styles.cardTop}>
          <View style={[styles.typeChip, { backgroundColor: pc.bg }]}>
            <Text style={[styles.typeChipText, { color: pc.color }]}>
              {isClassType ? '🏫 Class' : '👤 Personal'} · {priorityKey}
            </Text>
          </View>
          {!item.is_read && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.cardMessage} numberOfLines={2}>{item.message}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardTeacher}>✨ {item.teacher_name || 'Faculty'}</Text>
          <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
        </View>
        {item.attachment_url && (
          <View style={styles.attachmentBadge}>
            <Text style={styles.attachmentBadgeText}>📎 Attachment</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function DetailModal({
  item,
  visible,
  onClose,
}: {
  item: Announcement | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!item) return null;
  const priorityKey = item.priority?.toLowerCase() as 'low' | 'medium' | 'high';
  const pc = PRIORITY_CONFIG[priorityKey] || PRIORITY_CONFIG.low;
  const isClassType = item.type?.toUpperCase() === 'CLASS';
  const attachType = item.attachment_url
    ? announcementService.getAttachmentType(item.attachment_url)
    : null;
  const attachUrl = item.attachment_url
    ? announcementService.getAttachmentUrl(item.attachment_url, API_BASE_URL)
    : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        {/* Modal Header */}
        <View style={[styles.modalHeader, { borderBottomColor: pc.color }]}>
          <View style={{ flex: 1 }}>
            <View style={[styles.typeChip, { backgroundColor: pc.bg, marginBottom: 8 }]}>
              <Text style={[styles.typeChipText, { color: pc.color }]}>
                {isClassType ? '🏫 Class Announcement' : '👤 Personal Message'} · {priorityKey}
              </Text>
            </View>
            <Text style={styles.modalTitle}>{item.title}</Text>
            <Text style={styles.modalMeta}>
              ✨ {item.teacher_name || 'Faculty'} · {formatDate(item.created_at)}
            </Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Modal Body */}
        <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
          <Text style={styles.modalMessage}>{item.message}</Text>

          {attachUrl && attachType && (
            <TouchableOpacity
              style={styles.attachmentRow}
              onPress={() => Linking.openURL(attachUrl)}
              activeOpacity={0.8}
            >
              <View style={styles.attachmentIcon}>
                <Text style={styles.attachmentIconText}>
                  {attachType === 'image' ? '🖼️' : attachType === 'pdf' ? '📄' : attachType === 'video' ? '🎬' : '📁'}
                </Text>
              </View>
              <View>
                <Text style={styles.attachmentLabel}>
                  {attachType === 'image' ? 'View Image' : attachType === 'pdf' ? 'Open PDF' : attachType === 'video' ? 'Play Video' : 'Open File'}
                </Text>
                <Text style={styles.attachmentSub}>Tap to open attachment</Text>
              </View>
            </TouchableOpacity>
          )}

          {item.is_read && (
            <View style={styles.readBadge}>
              <Text style={styles.readBadgeText}>✓ Read</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function AnnouncementsScreen() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'urgent'>('all');

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const data = await announcementService.getMyAnnouncements();
      setAnnouncements(data);
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
    // Mark as read optimistically
    setAnnouncements((prev) =>
      prev.map((a) => (a.id === item.id ? { ...a, is_read: true } : a)),
    );
  };

  const filtered = announcements.filter((a) => {
    if (filter === 'unread') return !a.is_read;
    if (filter === 'urgent') return a.priority?.toUpperCase() === 'HIGH';
    return true;
  });

  const unreadCount = announcements.filter((a) => !a.is_read).length;

  if (loading) return <LoadingScreen message="Loading announcements..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Screen Header */}
      <View style={styles.screenHeader}>
        <View>
          <Text style={styles.screenTitle}>Announcements</Text>
          <Text style={styles.screenSub}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </Text>
        </View>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
          </View>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['all', 'unread', 'urgent'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === 'all' ? 'All' : f === 'unread' ? `Unread (${unreadCount})` : 'Urgent 🔴'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <ErrorState message={error} onRetry={fetch} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Text style={{ fontSize: 40 }}>📢</Text>}
              title="No announcements"
              subtitle="Check back later for updates from your teachers"
            />
          }
          renderItem={({ item }) => (
            <AnnouncementCard item={item} onPress={() => handleOpen(item)} />
          )}
        />
      )}

      <DetailModal
        item={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  screenTitle: { fontSize: 26, fontWeight: '900', color: Colors.text, letterSpacing: -0.8 },
  screenSub: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginTop: 2 },
  unreadBadge: {
    backgroundColor: Colors.danger,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  unreadBadgeText: { color: Colors.accent, fontSize: 13, fontWeight: '800' },

  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  filterChipActive: {
    backgroundColor: Colors.surface,
    borderColor: Colors.accent,
  },
  filterChipText: { fontSize: 12, fontWeight: '700', color: Colors.text },
  filterChipTextActive: { color: Colors.accent, fontWeight: '800' },

  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },

  card: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.primary,
    overflow: 'hidden',
    ...neonShadows.blue,
  },
  priorityBar: { width: 5, borderRadius: 2 },
  cardInner: { flex: 1, padding: 16, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  typeChipText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, color: Colors.accent },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent, marginLeft: 'auto' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.accent, lineHeight: 20 },
  cardMessage: { fontSize: 13, color: Colors.text, lineHeight: 18, fontWeight: '500' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  cardTeacher: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  cardDate: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  attachmentBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  attachmentBadgeText: { fontSize: 11, color: Colors.success, fontWeight: '700' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row',
    padding: 24,
    paddingTop: 32,
    borderBottomWidth: 2,
    borderBottomColor: Colors.accent,
    gap: 12,
    backgroundColor: Colors.surface,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: Colors.accent, lineHeight: 26, marginBottom: 4 },
  modalMeta: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  closeBtnText: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  modalBody: { flex: 1, padding: 24 },
  modalMessage: { fontSize: 15, color: Colors.text, lineHeight: 24, fontWeight: '400' },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 24,
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.primary,
    ...neonShadows.blue,
  },
  attachmentIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  attachmentIconText: { fontSize: 24 },
  attachmentLabel: { fontSize: 15, fontWeight: '700', color: Colors.accent },
  attachmentSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  readBadge: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  readBadgeText: { fontSize: 13, color: Colors.success, fontWeight: '700' },
});
