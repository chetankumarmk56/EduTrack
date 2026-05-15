import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors } from '@/shared/constants/Colors';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <View style={styles.emptyContainer}>
      {icon && <View style={styles.emptyIcon}>{icon}</View>}
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </View>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.errorIcon}>⚠️</Text>
      <Text style={styles.emptyTitle}>Something went wrong</Text>
      <Text style={styles.emptySubtitle}>{message}</Text>
      {onRetry && (
        <Text style={styles.retryText} onPress={onRetry}>
          Tap to retry
        </Text>
      )}
    </View>
  );
}

interface ProgressBarProps {
  value: number; // 0-100
  color?: string;
  height?: number;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({
  value,
  color = Colors.primary,
  height = 8,
  backgroundColor = Colors.border,
  style,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <View style={[styles.progressBg, { height, backgroundColor, borderRadius: height / 2 }, style]}>
      <View
        style={[
          styles.progressFill,
          {
            width: `${clamped}%`,
            backgroundColor: color,
            height,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    gap: 16,
  },
  message: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyIcon: {
    marginBottom: 8,
    opacity: 0.6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  retryText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  progressBg: {
    width: '100%',
    overflow: 'hidden',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
