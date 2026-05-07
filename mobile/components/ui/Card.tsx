import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TouchableOpacity, StyleProp } from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import { Colors } from '../../constants/Colors';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  index?: number;
}

export const Card = ({ children, style, onPress, index = 0 }: CardProps) => {
  const Container = onPress ? TouchableOpacity : View;
  
  return (
    <Animated.View 
      entering={FadeInDown.delay(index * 100).springify().damping(12)}
      layout={Layout.springify()}
      style={[styles.card, style]}
    >
      {/* @ts-ignore */}
      <Container style={styles.inner} activeOpacity={0.9} onPress={onPress}>
        {children}
      </Container>
    </Animated.View>
  );
};

export const SectionHeader = ({ title, subtitle, rightElement }: { title: string; subtitle?: string; rightElement?: React.ReactNode }) => (
  <View style={styles.sectionHeader}>
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
    {rightElement}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    // Soft shadow for light mode
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 16,
    overflow: 'visible',
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  inner: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 16,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.6,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
});
