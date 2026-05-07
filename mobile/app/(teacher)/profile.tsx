import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { directoryService } from '../../services';
import { Colors } from '../../constants/Colors';
import { Card, SectionHeader } from '../../components/ui/Card';
import { LoadingScreen } from '../../components/ui/Feedback';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useRouter } from 'expo-router';

export default function TeacherProfile() {
  const { logout } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    directoryService.getMyProfile()
      .then(setProfile)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingScreen message="Loading profile..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        
        {/* Profile Header */}
        <View style={styles.header}>
          <View style={styles.avatarBox}>
            <Text style={styles.avatarText}>{profile?.name?.charAt(0) || 'T'}</Text>
          </View>
          <Text style={styles.name}>{profile?.name}</Text>
          <Text style={styles.role}>Faculty Member • {profile?.id}</Text>
        </View>

        {/* Contact Info */}
        <SectionHeader title="Contact Information" />
        <Card style={styles.infoCard}>
          <InfoRow icon="mail-outline" label="Email" value={profile?.email || 'N/A'} />
          <View style={styles.divider} />
          <InfoRow icon="call-outline" label="Phone" value={profile?.phone || 'N/A'} />
        </Card>

        {/* Assignments */}
        <SectionHeader title="Assigned Classes & Subjects" />
        <View style={styles.list}>
          {profile?.assignments?.map((a: any, i: number) => (
            <Card key={i} style={styles.assignmentCard}>
              <View style={styles.assignmentIcon}>
                <Ionicons name="book-outline" size={24} color={Colors.primary} />
              </View>
              <View style={styles.assignmentDetails}>
                <Text style={styles.subjectName}>{a.subject_ref.name}</Text>
                <Text style={styles.className}>{a.school_class.grade.name} - {a.school_class.section.name}</Text>
              </View>
            </Card>
          ))}
        </View>

        {/* Danger Zone */}
        <TouchableOpacity style={styles.logoutBtn} onPress={() => { logout(); router.replace('/login'); }}>
          <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          <Text style={styles.logoutText}>Sign Out from Device</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: any, label: string, value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={20} color={Colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20 },
  header: { alignItems: 'center', marginBottom: 30, marginTop: 10 },
  avatarBox: { width: 100, height: 100, borderRadius: 35, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 15, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  avatarText: { color: Colors.white, fontSize: 42, fontWeight: '900' },
  name: { fontSize: 26, fontWeight: '900', color: Colors.text, letterSpacing: -1 },
  role: { fontSize: 13, color: Colors.textMuted, fontWeight: '700', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },
  infoCard: { padding: 0 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 15, padding: 16 },
  infoLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  infoValue: { fontSize: 15, fontWeight: '800', color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.divider, marginLeft: 50 },
  list: { gap: 12 },
  assignmentCard: { flexDirection: 'row', alignItems: 'center', gap: 15, padding: 15 },
  assignmentIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: `${Colors.primary}10`, alignItems: 'center', justifyContent: 'center' },
  assignmentDetails: { flex: 1 },
  subjectName: { fontSize: 16, fontWeight: '800', color: Colors.text },
  className: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 40, marginBottom: 40, padding: 18, borderRadius: 20, borderWidth: 2, borderColor: `${Colors.danger}20` },
  logoutText: { color: Colors.danger, fontWeight: '800', fontSize: 15 },
});
