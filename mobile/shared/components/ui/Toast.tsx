import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/shared/constants/Colors';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  /** Optional bold heading shown above the message. */
  title?: string;
  type?: ToastType;
  /** Visible duration in ms before auto-dismiss. Default 2800. */
  duration?: number;
}

type ShowFn = (opts: ToastOptions) => void;

// Module-level handle so non-component code (services, axios interceptors,
// utils) can fire a toast without being inside a React component — mirrors the
// ergonomics of `Alert.alert`. The provider wires this up on mount and tears it
// down on unmount. No-ops safely until the provider is mounted.
let _show: ShowFn | null = null;

export const toast = {
  show: (opts: ToastOptions) => _show?.(opts),
  success: (message: string, title?: string) => _show?.({ type: 'success', message, title }),
  error: (message: string, title?: string) => _show?.({ type: 'error', message, title }),
  info: (message: string, title?: string) => _show?.({ type: 'info', message, title }),
};

const ToastContext = createContext(toast);
/** Hook form — `const t = useToast(); t.success('Saved')`. Same API as the
 *  exported `toast` singleton, handy when you prefer going through context. */
export const useToast = () => useContext(ToastContext);

const TYPE_META: Record<ToastType, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  success: { icon: 'checkmark-circle', color: Colors.success },
  error: { icon: 'alert-circle', color: Colors.danger },
  info: { icon: 'information-circle', color: Colors.info },
};

// Avoid useSafeAreaInsets (the app has no SafeAreaProvider at the root); a
// status-bar-derived offset keeps the toast clear of the notch/status bar.
const TOP_OFFSET =
  Platform.select({
    ios: 56,
    android: (StatusBar.currentHeight ?? 24) + 12,
    default: 16,
  }) ?? 16;

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ToastOptions | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const hide = useCallback(() => {
    clearTimer();
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(translateY, { toValue: -20, duration: 160, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start(() => setCurrent(null));
  }, [opacity, translateY]);

  const show = useCallback<ShowFn>(
    (opts) => {
      clearTimer();
      setCurrent({ type: 'info', ...opts });
      opacity.setValue(0);
      translateY.setValue(-20);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.spring(translateY, { toValue: 0, friction: 8, tension: 80, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start();
      hideTimer.current = setTimeout(hide, opts.duration ?? 2800);
    },
    [opacity, translateY, hide],
  );

  useEffect(() => {
    _show = show;
    return () => {
      clearTimer();
      if (_show === show) _show = null;
    };
  }, [show]);

  const meta = current ? TYPE_META[current.type ?? 'info'] : null;

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {current && meta ? (
        <Animated.View
          // Let touches fall through everywhere except the toast card itself.
          pointerEvents="box-none"
          style={[styles.overlay, { top: TOP_OFFSET, opacity, transform: [{ translateY }] }]}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={hide}
            style={[styles.card, { borderLeftColor: meta.color }]}
          >
            <Ionicons name={meta.icon} size={22} color={meta.color} style={styles.icon} />
            <View style={styles.textWrap}>
              {current.title ? (
                <Text style={styles.title} numberOfLines={1}>
                  {current.title}
                </Text>
              ) : null}
              <Text style={styles.message} numberOfLines={4}>
                {current.message}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 9999,
    elevation: 9999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 520,
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderLeftWidth: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    // Soft elevation so it reads as floating above the screen.
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  icon: {
    marginTop: 1,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
