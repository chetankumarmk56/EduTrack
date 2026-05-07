import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, RefreshControl, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { announcementService, directoryService, type Announcement } from '../../services';
import { Colors } from '../../constants/Colors';
import { Card, SectionHeader } from '../../components/ui/Card';
import { LoadingScreen, EmptyState } from '../../components/ui/Feedback';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, SlideInUp } from 'react-native-reanimated';

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
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [annData, profile] = await Promise.all([
        announcementService.getMyAnnouncements(),
        directoryService.getMyProfile()
      ]);
      setAnnouncements(annData);
      
      const assignments = profile.assignments || [];
      const uniqueClasses = Array.from(new Set(assignments.map((a: any) => a.school_class_id)))
        .map(id => assignments.find((a: any) => a.school_class_id === id).school_class);
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

    setSubmitting(true);
    try {
      await announcementService.createAnnouncement({
        title,
        message: content,
        priority: priority.toUpperCase(),
        class_id: selectedClassId || (classes.length > 0 ? classes[0].id : null),
        type: 'CLASS'
      });
      
      Alert.alert('Success', 'Announcement posted!');
      setIsModalVisible(false);
      setTitle('');
      setContent('');
      setSelectedClassId(null);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to post announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingScreen message="Loading announcements..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView 
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
      >
        <View style={styles.headerRow}>
          <SectionHeader title="My Broadcasts" />
          <TouchableOpacity style={styles.newBtn} onPress={() => setIsModalVisible(true)}>
            <Ionicons name="add-circle" size={20} color={Colors.white} />
            <Text style={styles.newBtnText}>New Post</Text>
          </TouchableOpacity>
        </View>

        {announcements.length === 0 ? (
          <EmptyState 
            title="No Announcements" 
            subtitle="You haven't posted any updates yet." 
            icon={<Ionicons name="megaphone-outline" size={48} color={Colors.textMuted} />} 
          />
        ) : (
          <View style={styles.list}>
            {announcements.map((ann, i) => (
              <Animated.View key={ann.id} entering={FadeInDown.delay(i * 100)}>
                <Card style={styles.annCard}>
                  <View style={styles.annHeader}>
                    <View style={[
                      styles.priorityBadge,
                      { backgroundColor: ann.priority?.toUpperCase() === 'HIGH' ? Colors.danger : ann.priority?.toUpperCase() === 'MEDIUM' ? Colors.warning : Colors.success }
                    ]}>
                      <Text style={styles.priorityText}>{ann.priority?.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.annDate}>{new Date(ann.created_at).toLocaleDateString()}</Text>
                  </View>
                  <Text style={styles.annTitle}>{ann.title}</Text>
                  <Text style={styles.annContent} numberOfLines={3}>{ann.message}</Text>
                  <View style={styles.annFooter}>
                    <View style={styles.targetBox}>
                      <Ionicons name="people" size={14} color={Colors.textMuted} />
                      <Text style={styles.targetText}>
                        {ann.school_class ? `${ann.school_class.grade.name}-${ann.school_class.section.name}` : 'General'}
                      </Text>
                    </View>
                  </View>
                </Card>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* New Announcement Modal */}
      <Modal visible={isModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <Animated.View entering={SlideInUp} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Broadcast</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <Ionicons name="close" size={28} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.label}>Title</Text>
              <TextInput style={styles.input} placeholder="Headline..." value={title} onChangeText={setTitle} />

              <Text style={styles.label}>Content</Text>
              <TextInput 
                style={[styles.input, styles.textArea]} 
                placeholder="Important updates..." 
                value={content} 
                onChangeText={setContent} 
                multiline 
                numberOfLines={4} 
              />

              <Text style={styles.label}>Target Class</Text>
              <View style={styles.chipRow}>
                {classes.map(c => (
                  <TouchableOpacity 
                    key={c.id} 
                    style={[styles.chip, selectedClassId === c.id && styles.selectedChip]} 
                    onPress={() => setSelectedClassId(c.id)}
                  >
                    <Text style={[styles.chipText, selectedClassId === c.id && styles.whiteText]}>{c.grade.name}-{c.section.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Priority</Text>
              <View style={styles.chipRow}>
                {(['low', 'medium', 'high'] as const).map(p => (
                  <TouchableOpacity 
                    key={p} 
                    style={[styles.chip, priority === p && styles.selectedChip]} 
                    onPress={() => setPriority(p)}
                  >
                    <Text style={[styles.chipText, priority === p && styles.whiteText]}>{p.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity style={[styles.submitBtn, submitting && styles.disabled]} onPress={handleCreate} disabled={submitting}>
              <Text style={styles.submitText}>{submitting ? 'Posting...' : 'Post Announcement'}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  newBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12, gap: 8 },
  newBtnText: { color: Colors.white, fontWeight: '800', fontSize: 12 },
  list: { gap: 15 },
  annCard: { padding: 20 },
  annHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  priorityText: { color: Colors.white, fontSize: 10, fontWeight: '900' },
  annDate: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  annTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, marginBottom: 8 },
  annContent: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  annFooter: { marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: Colors.border },
  targetBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  targetText: { fontSize: 12, color: Colors.textMuted, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.background, borderTopLeftRadius: 32, borderTopRightRadius: 32, height: '80%', padding: 25 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  modalTitle: { fontSize: 24, fontWeight: '900', color: Colors.text },
  modalForm: { flex: 1 },
  label: { fontSize: 14, fontWeight: '800', color: Colors.text, marginBottom: 8, marginTop: 15 },
  input: { backgroundColor: Colors.surface, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: Colors.border, fontSize: 16, color: Colors.text },
  textArea: { height: 120, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  selectedChip: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  whiteText: { color: Colors.white },
  submitBtn: { backgroundColor: Colors.primary, padding: 18, borderRadius: 20, alignItems: 'center', marginTop: 20 },
  disabled: { opacity: 0.6 },
  submitText: { color: Colors.white, fontSize: 18, fontWeight: '900' },
});
