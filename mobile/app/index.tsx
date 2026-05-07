import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { LoadingScreen } from '../components/ui/Feedback';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

export default function LandingScreen() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  if (isLoading) return <LoadingScreen message="Starting EduTrack..." />;
  
  if (isAuthenticated) {
    return <Redirect href={user?.role === 'teacher' ? "/(teacher)/dashboard" : "/(parent)/dashboard"} />;
  }

  return (
    <View style={styles.container}>
      {/* Background Decor */}
      <View style={styles.bgCircle1} />
      <View style={styles.bgCircle2} />

      <View style={styles.content}>
        <Animated.View entering={FadeInUp.delay(200)} style={styles.header}>
          <View style={styles.logoBox}>
            <Text style={styles.logoEmoji}>🎓</Text>
          </View>
          <Text style={styles.appName}>EduTrack</Text>
          <Text style={styles.tagline}>The future of academic management</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400)} style={styles.selectionArea}>
          <Text style={styles.prompt}>Choose your portal to continue</Text>
          
          <TouchableOpacity 
            style={[styles.portalCard, styles.parentCard]}
            onPress={() => router.push({ pathname: '/login', params: { mode: 'student' } })}
            activeOpacity={0.9}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="people" size={32} color={Colors.primary} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.portalTitle}>Student / Parent</Text>
              <Text style={styles.portalSub}>View marks, attendance, and pay fees</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.portalCard, styles.teacherCard]}
            onPress={() => router.push({ pathname: '/login', params: { mode: 'teacher' } })}
            activeOpacity={0.9}
          >
            <View style={[styles.iconCircle, { backgroundColor: `${Colors.success}15` }]}>
              <Ionicons name="school" size={32} color={Colors.success} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.portalTitle}>Teacher Portal</Text>
              <Text style={styles.portalSub}>Manage classes, attendance, and grading</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={Colors.textMuted} />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(600)} style={styles.footer}>
          <Text style={styles.footerText}>Secure • Reliable • Smart</Text>
          <View style={styles.dot} />
          <Text style={styles.footerText}>v2.4.0</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, overflow: 'hidden' },
  bgCircle1: { position: 'absolute', top: -100, right: -100, width: 300, height: 300, borderRadius: 150, backgroundColor: `${Colors.primary}10` },
  bgCircle2: { position: 'absolute', bottom: -50, left: -50, width: 250, height: 250, borderRadius: 125, backgroundColor: `${Colors.success}08` },
  content: { flex: 1, padding: 30, justifyContent: 'space-between', paddingVertical: 80 },
  header: { alignItems: 'center' },
  logoBox: { width: 80, height: 80, borderRadius: 28, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: 15, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 5 },
  logoEmoji: { fontSize: 40 },
  appName: { fontSize: 36, fontWeight: '900', color: Colors.text, letterSpacing: -1.5 },
  tagline: { fontSize: 16, color: Colors.textSecondary, fontWeight: '600', marginTop: 5 },
  selectionArea: { gap: 20 },
  prompt: { fontSize: 14, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5, textAlign: 'center', marginBottom: 5 },
  portalCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, padding: 20, borderRadius: 28, borderWidth: 1, borderColor: Colors.border, gap: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  parentCard: { borderColor: `${Colors.primary}30` },
  teacherCard: { borderColor: `${Colors.success}30` },
  iconCircle: { width: 64, height: 64, borderRadius: 20, backgroundColor: `${Colors.primary}15`, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1 },
  portalTitle: { fontSize: 20, fontWeight: '900', color: Colors.text, letterSpacing: -0.5 },
  portalSub: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginTop: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  footerText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.border },
});
