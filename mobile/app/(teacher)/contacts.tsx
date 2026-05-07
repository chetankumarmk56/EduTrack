import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { directoryService, type StudentProfile, type Teacher } from '../../services';
import { Colors } from '../../constants/Colors';
import { SectionHeader } from '../../components/ui/Card';
import { LoadingScreen, ErrorState } from '../../components/ui/Feedback';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

type DirectoryTab = 'FACULTY' | 'STUDENTS';

export default function TeacherContacts() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<DirectoryTab>('FACULTY');
  const [faculty, setFaculty] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [facData, stuData] = await Promise.all([
        directoryService.getTeachers(),
        directoryService.getTeacherStudents()
      ]);
      setFaculty(facData.sort((a, b) => a.name.localeCompare(b.name)));
      setStudents(stuData.sort((a, b) => a.name.localeCompare(b.name)));
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

  const handleCall = (phone: string | undefined) => {
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  const handleEmail = (email: string | undefined) => {
    if (email) Linking.openURL(`mailto:${email}`);
  };

  const handleWhatsApp = (phone: string | undefined) => {
    if (!phone) return;
    // Clean phone number (remove non-digits)
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
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'FACULTY' && styles.activeTab]} 
          onPress={() => setActiveTab('FACULTY')}
        >
          <Text style={[styles.tabText, activeTab === 'FACULTY' && styles.activeTabText]}>Faculty</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'STUDENTS' && styles.activeTab]} 
          onPress={() => setActiveTab('STUDENTS')}
        >
          <Text style={[styles.tabText, activeTab === 'STUDENTS' && styles.activeTabText]}>My Students</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.success} />}
      >
        <SectionHeader title={activeTab === 'FACULTY' ? 'Campus Directory' : 'Student Roster'} />
        
        {activeTab === 'FACULTY' ? (
          faculty.map((teacher, index) => (
            <Animated.View key={teacher.id} entering={FadeInDown.delay(index * 50)}>
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
        ) : (
          students.map((student, index) => (
            <Animated.View key={student.id} entering={FadeInDown.delay(index * 30)}>
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
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ContactCard({ name, sub, role, phone, email, rollNo, onCall, onEmail, onWhatsApp }: any) {
  return (
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.charAt(0)}</Text>
          {role === 'Student' && (
            <View style={styles.rollBadge}>
              <Text style={styles.rollBadgeText}>#{rollNo}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.sub}>{sub}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.actionBtn, !phone && styles.disabledBtn]} 
          onPress={onWhatsApp} 
          disabled={!phone}
        >
          <Ionicons name="logo-whatsapp" size={20} color={phone ? '#25D366' : Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionBtn, !phone && styles.disabledBtn]} 
          onPress={onCall} 
          disabled={!phone}
        >
          <Ionicons name="call-outline" size={20} color={phone ? Colors.success : Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionBtn, !email && styles.disabledBtn]} 
          onPress={onEmail} 
          disabled={!email}
        >
          <Ionicons name="mail-outline" size={20} color={email ? Colors.primary : Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  tabContainer: { flexDirection: 'row', padding: 20, gap: 12 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.surface, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  activeTab: { backgroundColor: Colors.success, borderColor: Colors.success },
  tabText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  activeTabText: { color: Colors.white },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, backgroundColor: Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: Colors.border },
  cardInfo: { flexDirection: 'row', alignItems: 'center', gap: 15, flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: `${Colors.success}15`, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.success, fontSize: 18, fontWeight: '900' },
  rollBadge: { position: 'absolute', top: -5, left: -5, backgroundColor: Colors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  rollBadgeText: { color: Colors.white, fontSize: 8, fontWeight: '900' },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text },
  sub: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  disabledBtn: { opacity: 0.4 },
});
