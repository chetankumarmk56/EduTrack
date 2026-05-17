import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { announcementService, directoryService, type Announcement } from '../../services';
import { Colors } from '@/shared/constants/Colors';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Feedback';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Treat any legacy HIGH as IMPORTANT so old cached/posted records render right. */
function isImportant(priority?: string): boolean {
  const k = (priority || '').toUpperCase();
  return k === 'IMPORTANT' || k === 'HIGH';
}

// ─── component ──────────────────────────────────────────────────────────────

export default function TeacherAnnouncements() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [important, setImportant] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [annData, profile] = await Promise.all([
        announcementService.getMyAnnouncements(),
        directoryService.getMyProfile(),
      ]);
      setAnnouncements(annData);

      const assignments = profile.assignments || [];
      const uniqueClasses = Array.from(new Set(assignments.map((a: any) => a.school_class_id)))
        .map((id) => assignments.find((a: any) => a.school_class_id === id)?.school_class)
        .filter((sc: any) => sc && sc.id); // drop nulls from unloaded relations
      setClasses(uniqueClasses);
    } catch (error) {
      console.error('Failed to load announcements:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async () => {
    if (!title || !content) {
      Alert.alert('Error', 'Please fill in title and content.');
      return;
    }

    // Resolve class_id: explicit selection wins; otherwise fall back to the
    // teacher's first assigned class. If they have *no* assignments, refuse
    // to submit — backend would 400 with "class_id is required".
    const resolvedClassId =
      selectedClassId ?? (classes.length > 0 ? classes[0].id : null);
    if (resolvedClassId == null) {
      Alert.alert(
        'No class selected',
        "You're not assigned to any class yet, so we can't post an announcement. Ask the admin to assign you to a class first.",
      );
      return;
    }

    setSubmitting(true);
    try {
      await announcementService.createAnnouncement({
        title,
        message: content,
        priority: important ? 'IMPORTANT' : 'NORMAL',
        class_id: resolvedClassId,
        type: 'CLASS',
      });

      Alert.alert('Success', 'Announcement posted!');
      setIsModalVisible(false);
      setTitle('');
      setContent('');
      setSelectedClassId(null);
      setImportant(false);
      loadData();
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail ||
        (Array.isArray(error?.response?.data?.detail) &&
          error.response.data.detail.map((e: any) => e.msg).join(', ')) ||
        error?.message ||
        'Failed to post announcement.';
      Alert.alert('Could not post announcement', String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingScreen message="Loading announcements..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor={Colors.success}
          />
        }
      >
        {/* ── header ── */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Broadcasts</Text>
            {announcements.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{announcements.length}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => setIsModalVisible(true)}
            activeOpacity={0.82}
          >
            <Ionicons name="megaphone-outline" size={16} color={Colors.white} />
            <Text style={styles.newBtnText}>New Post</Text>
          </TouchableOpacity>
        </View>

        {/* ── list ── */}
        {announcements.length === 0 ? (
          <EmptyState
            title="No Announcements"
            subtitle="You haven't posted any updates yet."
            icon={<Ionicons name="megaphone-outline" size={48} color={Colors.textMuted} />}
          />
        ) : (
          <View style={styles.list}>
            {announcements.map((ann, i) => {
              const isImp = isImportant(ann.priority);
              const accentColor = isImp ? Colors.danger : Colors.success;
              return (
                <Animated.View key={ann.id} entering={FadeInDown.delay(i * 80).springify()}>
                  <View style={[styles.card, isImp && styles.cardImportant]}>
                    {/* left accent border */}
                    <View style={[styles.cardAccent, { backgroundColor: accentColor }]} />

                    {/* card body */}
                    <View style={styles.cardBody}>
                      {/* top row: optional important badge + date */}
                      <View style={styles.cardTopRow}>
                        {isImp ? (
                          <View style={styles.importantBadge}>
                            <Ionicons name="alert-circle" size={11} color={Colors.danger} />
                            <Text style={styles.importantBadgeText}>IMPORTANT</Text>
                          </View>
                        ) : <View />}
                        <Text style={styles.dateText}>
                          {new Date(ann.created_at).toLocaleDateString(undefined, {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </Text>
                      </View>

                      {/* title */}
                      <Text style={styles.annTitle}>{ann.title}</Text>

                      {/* content preview */}
                      <Text style={styles.annContent} numberOfLines={3}>
                        {ann.message}
                      </Text>

                      {/* footer divider */}
                      <View style={styles.cardDivider} />

                      {/* bottom row: class chip */}
                      <View style={styles.cardBottomRow}>
                        <View style={styles.classChip}>
                          <Ionicons name="people" size={13} color={Colors.success} />
                          <Text style={styles.classChipText}>
                            {ann.school_class
                              ? `${ann.school_class.grade.name}-${ann.school_class.section.name}`
                              : 'General'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </Animated.View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── new announcement modal ── */}
      <Modal visible={isModalVisible} animationType="slide" transparent>
        {/* Plain View instead of Animated.View — the native Modal already
            slides the layer up from the bottom. Stacking a reanimated
            entering={SlideInUp.springify()} on top of that under the New
            Architecture freezes mid-animation and the sheet never paints. */}
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* handle bar */}
            <View style={styles.handleBar} />

            {/* modal title row */}
            <View style={styles.modalTitleRow}>
              <View style={styles.megaphoneCircle}>
                <Ionicons name="megaphone-outline" size={20} color={Colors.white} />
              </View>
              <Text style={styles.modalTitle}>New Broadcast</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setIsModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalForm}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* title input */}
              <Text style={styles.fieldLabel}>TITLE</Text>
              <TextInput
                style={styles.inputField}
                placeholder="Announcement headline..."
                placeholderTextColor={Colors.textMuted}
                value={title}
                onChangeText={setTitle}
              />

              {/* content input */}
              <Text style={styles.fieldLabel}>CONTENT</Text>
              <TextInput
                style={[styles.inputField, styles.textArea]}
                placeholder="Share important updates with your class..."
                placeholderTextColor={Colors.textMuted}
                value={content}
                onChangeText={setContent}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {/* target class */}
              <Text style={styles.fieldLabel}>TARGET CLASS</Text>
              <View style={styles.chipRow}>
                {classes
                  .filter((c: any) => c && c.id)
                  .map((c: any) => {
                    const isSelected = selectedClassId === c.id;
                    // Defensive: a missing grade or section relation used to
                    // throw `c.grade is undefined`, which crashed render of
                    // the modal mid-animation and looked like a hang.
                    const label =
                      c.display_name ||
                      [c.grade?.name, c.section?.name].filter(Boolean).join('-') ||
                      `Class #${c.id}`;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.classChipBtn, isSelected && styles.classChipBtnSelected]}
                        onPress={() => setSelectedClassId(c.id)}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            styles.classChipBtnText,
                            isSelected && styles.classChipBtnTextSelected,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>

              {/* importance — opt-in toggle (default normal) */}
              <Text style={styles.fieldLabel}>IMPORTANCE</Text>
              <TouchableOpacity
                accessibilityRole="switch"
                accessibilityState={{ checked: important }}
                onPress={() => setImportant((v) => !v)}
                activeOpacity={0.85}
                style={[styles.importantToggle, important && styles.importantToggleActive]}
              >
                <View style={[
                  styles.importantToggleIcon,
                  important ? styles.importantToggleIconActive : styles.importantToggleIconInactive,
                ]}>
                  <Ionicons
                    name="alert-circle"
                    size={18}
                    color={important ? Colors.danger : Colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[
                    styles.importantToggleLabel,
                    important && { color: Colors.danger },
                  ]}>
                    Mark as Important
                  </Text>
                  <Text style={styles.importantToggleHint}>
                    Highlighted in red for parents. Use sparingly.
                  </Text>
                </View>
                <View style={[
                  styles.switchTrack,
                  important ? styles.switchTrackOn : styles.switchTrackOff,
                ]}>
                  <View style={[
                    styles.switchThumb,
                    important ? styles.switchThumbOn : styles.switchThumbOff,
                  ]} />
                </View>
              </TouchableOpacity>

              {/* bottom spacer so submit btn clears keyboard */}
              <View style={{ height: 24 }} />
            </ScrollView>

            {/* submit button */}
            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleCreate}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {!submitting && (
                <Ionicons name="send" size={18} color={Colors.white} style={{ marginRight: 8 }} />
              )}
              <Text style={styles.submitText}>
                {submitting ? 'Posting...' : 'Post Announcement'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },

  // ── header ──
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  countBadge: {
    backgroundColor: Colors.success,
    borderRadius: 20,
    minWidth: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 7,
  },
  countBadgeText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '900',
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: Colors.success,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 50,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  newBtnText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // ── list ──
  list: {
    gap: 14,
  },

  // ── card ──
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardAccent: {
    width: 4,
    borderRadius: 0,
  },
  cardBody: {
    flex: 1,
    padding: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardImportant: {
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    backgroundColor: '#fef7f7',
  },
  importantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  importantBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: Colors.danger,
  },
  dateText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  annTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  annContent: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 21,
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  classChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16,185,129,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  classChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.success,
  },

  // ── modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    paddingHorizontal: 24,
    paddingBottom: 34,
    paddingTop: 12,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 4,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  megaphoneCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  modalTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalForm: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 8,
  },
  inputField: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    fontSize: 15,
    color: Colors.text,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  classChipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  classChipBtnSelected: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  classChipBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  classChipBtnTextSelected: {
    color: Colors.white,
  },
  importantToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  importantToggleActive: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.4)',
  },
  importantToggleIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importantToggleIconInactive: { backgroundColor: Colors.surfaceElevated },
  importantToggleIconActive: { backgroundColor: 'rgba(239,68,68,0.15)' },
  importantToggleLabel: { fontSize: 14, fontWeight: '900', color: Colors.text },
  importantToggleHint: { fontSize: 11, color: Colors.textMuted, marginTop: 2, fontWeight: '600' },
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  switchTrackOn:  { backgroundColor: Colors.danger },
  switchTrackOff: { backgroundColor: Colors.border },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  switchThumbOn:  { alignSelf: 'flex-end' },
  switchThumbOff: { alignSelf: 'flex-start' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    height: 56,
    borderRadius: 18,
    marginTop: 8,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 6,
  },
  submitBtnDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
});
