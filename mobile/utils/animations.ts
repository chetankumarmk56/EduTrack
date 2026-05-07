import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated';

/**
 * Fade in animation hook with customizable duration and delay
 */
export function useFadeInAnimation(duration: number = 500, delay: number = 0) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
}

/**
 * Scale animation for items appearing from center
 */
export function useScaleAnimation(duration: number = 400, delay: number = 0) {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: duration * 0.8 });
    scale.value = withSpring(1, {
      damping: 12,
      mass: 1,
      stiffness: 100,
    });
  }, []);

  return useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
}

/**
 * Slide up animation from bottom
 */
export function useSlideUpAnimation(duration: number = 400, delay: number = 0) {
  const translateY = useSharedValue(40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: duration * 0.8 });
    translateY.value = withTiming(0, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  return useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));
}

/**
 * Bounce animation for interactive elements
 */
export function useBounceAnimation() {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.95, {
      damping: 10,
      mass: 0.8,
    });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, {
      damping: 10,
      mass: 0.8,
    });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return {
    animatedStyle,
    handlePressIn,
    handlePressOut,
  };
}

/**
 * Reanimated animation constants for common screen transitions
 */
export const ScreenAnimations = {
  fadeIn: FadeIn.duration(400),
  fadeOut: FadeOut.duration(300),
  slideInRight: SlideInRight.springify().damping(14),
  slideOutRight: SlideOutRight.springify().damping(14),
};

/**
 * Common easing functions
 */
export const EasingFunctions = {
  smooth: Easing.inOut(Easing.cubic),
  elastic: Easing.out(Easing.elastic(1.2)),
  bouncy: Easing.bounce,
};
