import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Text, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { SectionHeader } from '../../components/ui/Card';
import { LoadingScreen, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/apiClient';

import { directoryService, type Teacher } from '../../services';

export default function TeachersScreen() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeachers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await directoryService.getTeachers();
      setTeachers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTeachers(); }, []);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={fetchTeachers} />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchTeachers} tintColor={Colors.primary} />}
      >
        <SectionHeader title="School Faculty" />
        
        {teachers.length === 0 ? (
          <EmptyState
            title="No Teachers Found"
            subtitle="Your class faculty list is currently being updated."
            icon={<Ionicons name="people-outline" size={40} color={Colors.textMuted} />}
          />
        ) : (
          teachers.map((teacher) => (
            <View key={teacher.id} style={styles.card}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{teacher.name.charAt(0)}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{teacher.name}</Text>
                <Text style={styles.role}>{teacher.subjects?.join(', ') || teacher.role || 'Faculty Member'}</Text>
                
                <TouchableOpacity 
                  style={styles.contactBtn} 
                  onPress={() => Linking.openURL(`mailto:${teacher.email}`)}
                >
                  <Ionicons name="mail-outline" size={16} color={Colors.primary} />
                  <Text style={styles.contactText}>{teacher.email}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40, gap: 16 },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.white,
    fontSize: 24,
    fontWeight: '900',
  },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 18, fontWeight: '800', color: Colors.text },
  role: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    backgroundColor: `${Colors.primary}10`,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  contactText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
});
