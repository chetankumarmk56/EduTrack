import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/shared/constants/Colors';

/**
 * Bus Tracking — placeholder screen.
 *
 * The web admin/parent portals already have a live-map BusTracking page, but
 * the mobile leaflet/map stack hasn't been wired up yet. Until then we render
 * a friendly "coming soon" panel instead of leaving the route blank.
 */
export default function BusTrackingScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInUp.duration(500)} style={styles.heroWrap}>
          <View style={styles.iconCircle}>
            <Ionicons name="bus" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.title}>Bus Tracking</Text>
          <Text style={styles.subtitle}>Live route &amp; ETA on the move</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(500)} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.tag}>
              <View style={styles.tagDot} />
              <Text style={styles.tagText}>Coming soon</Text>
            </View>
          </View>

          <Text style={styles.cardTitle}>We&apos;re still wiring this up.</Text>
          <Text style={styles.cardBody}>
            Real-time bus tracking is being built for mobile. You&apos;ll soon be
            able to see your child&apos;s bus on a live map, its current stop,
            and the estimated arrival time at school — all from this screen.
          </Text>

          <View style={styles.bulletList}>
            <Bullet icon="location" text="Live position with GPS pings" />
            <Bullet icon="time" text="ETA to the next stop and to school" />
            <Bullet icon="notifications" text="Push alerts when the bus is nearby" />
            <Bullet icon="map" text="Full route map with all stops marked" />
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(300).duration(500)}
          style={styles.footerHint}
        >
          <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.footerText}>
            For now, you can view bus details on the school website.
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Bullet({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletIconBox}>
        <Ionicons name={icon} size={14} color={Colors.primary} />
      </View>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 22, gap: 18, paddingBottom: 60 },

  heroWrap: { alignItems: 'center', gap: 10, marginTop: 10 },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: `${Colors.primary}12`,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -1,
    marginTop: 6,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 22,
    gap: 14,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'flex-start' },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${Colors.warning}15`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${Colors.warning}40`,
  },
  tagDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.warning },
  tagText: {
    fontSize: 10,
    fontWeight: '900',
    color: Colors.warning,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.4,
  },
  cardBody: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 21,
    fontWeight: '500',
  },

  bulletList: { gap: 10, marginTop: 4 },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bulletIconBox: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: `${Colors.primary}10`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    fontWeight: '600',
  },

  footerHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  footerText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
});
