import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  ViewStyle,
  StyleProp,
  DimensionValue,
} from 'react-native';
import { Colors } from '@/shared/constants/Colors';

/**
 * Animated shimmer skeleton primitives for the mobile app.
 *
 * Compose these to mirror each screen's real layout so the loading state
 * doesn't cause a jump when data arrives. A single shared `Animated.Value`
 * drives every <Skeleton>'s opacity loop so we don't spin up N independent
 * loops per screen.
 */

const sharedOpacity = new Animated.Value(0.4);
let started = false;
function ensureLoop() {
  if (started) return;
  started = true;
  Animated.loop(
    Animated.sequence([
      Animated.timing(sharedOpacity, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.timing(sharedOpacity, {
        toValue: 0.4,
        duration: 900,
        useNativeDriver: true,
      }),
    ]),
  ).start();
}

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({
  width = '100%',
  height = 12,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  useEffect(() => {
    ensureLoop();
  }, []);
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: Colors.surfaceElevated,
          opacity: sharedOpacity,
        },
        style,
      ]}
    />
  );
}

/** Stack of text-line skeletons. Last line is shorter for realism. */
export function SkeletonText({
  lines = 3,
  style,
}: {
  lines?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.col, style]}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={10}
          width={i === lines - 1 ? '60%' : '100%'}
          borderRadius={6}
        />
      ))}
    </View>
  );
}

/** Header skeleton: title + supporting line. */
export function SkeletonHeader({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.col, style]}>
      <Skeleton height={28} width="60%" borderRadius={10} />
      <Skeleton height={14} width="80%" borderRadius={8} />
    </View>
  );
}

/** A single stat tile (label + value). */
export function SkeletonStat({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.statCard, style]}>
      <Skeleton height={10} width="50%" borderRadius={6} />
      <Skeleton height={28} width="70%" borderRadius={10} />
    </View>
  );
}

/** A row of stat tiles laid out horizontally. */
export function SkeletonStatRow({
  count = 3,
  style,
}: {
  count?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.statRow, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flex: 1 }}>
          <SkeletonStat />
        </View>
      ))}
    </View>
  );
}

/** A generic content card (avatar + title + lines). */
export function SkeletonCard({
  showIcon = true,
  lines = 2,
  style,
}: {
  showIcon?: boolean;
  lines?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardHeader}>
        {showIcon && <Skeleton width={44} height={44} borderRadius={14} />}
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton height={12} width="50%" borderRadius={6} />
          <Skeleton height={10} width="80%" borderRadius={6} />
        </View>
      </View>
      <SkeletonText lines={lines} />
    </View>
  );
}

/** A vertical list of generic cards. */
export function SkeletonList({
  rows = 5,
  style,
}: {
  rows?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.list, style]}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

/** A list of compact rows (avatar + 2 lines + trailing chip). */
export function SkeletonRowList({
  rows = 6,
  style,
}: {
  rows?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.list, style]}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.rowCard}>
          <Skeleton width={40} height={40} borderRadius={20} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton height={11} width="40%" borderRadius={6} />
            <Skeleton height={9} width="70%" borderRadius={6} />
          </View>
          <Skeleton width={70} height={28} borderRadius={10} />
        </View>
      ))}
    </View>
  );
}

/** Full-screen skeleton — header + stat row + list. */
export function SkeletonPage({
  showStats = true,
  rows = 5,
  style,
}: {
  showStats?: boolean;
  rows?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.page, style]}>
      <SkeletonHeader />
      {showStats && <SkeletonStatRow />}
      <SkeletonList rows={rows} />
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: 10 },
  list: { gap: 12 },
  page: { padding: 20, gap: 20, flex: 1, backgroundColor: Colors.background },
  statRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  card: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
