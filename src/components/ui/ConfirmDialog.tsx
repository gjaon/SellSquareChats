import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TouchableWithoutFeedback,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';

// A themed, promise-based confirm/alert dialog that respects the in-app
// theme (light/dark) instead of falling back to the OS-native Alert.alert
// chrome. Mount the provider once near the root and call `confirm(...)`
// from anywhere via the `useConfirm()` hook.

export type ConfirmKind = 'default' | 'destructive' | 'success' | 'warning';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string | null; // pass `null` for an alert (single button)
  kind?: ConfirmKind;
  icon?: keyof typeof Ionicons.glyphMap;
}

type Resolver = (value: boolean) => void;

interface InternalState extends ConfirmOptions {
  visible: boolean;
}

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

const DEFAULTS: Required<Pick<ConfirmOptions, 'confirmText' | 'cancelText' | 'kind'>> = {
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  kind: 'default',
};

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const [state, setState] = useState<InternalState>({
    visible: false,
    title: '',
  });
  const resolverRef = useRef<Resolver | null>(null);
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    scale.setValue(0.92);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale]);

  const close = useCallback(
    (result: boolean) => {
      const resolve = resolverRef.current;
      resolverRef.current = null;
      Animated.timing(opacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start(() => {
        setState((s) => ({ ...s, visible: false }));
        resolve?.(result);
      });
    },
    [opacity],
  );

  const confirm = useCallback(
    (opts: ConfirmOptions) => {
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setState({ visible: true, ...opts });
        // Defer until the modal has mounted so the spring runs visibly.
        requestAnimationFrame(animateIn);
      });
    },
    [animateIn],
  );

  const kind: ConfirmKind = state.kind ?? DEFAULTS.kind;
  const confirmLabel = state.confirmText ?? DEFAULTS.confirmText;
  const cancelLabel = state.cancelText === undefined ? DEFAULTS.cancelText : state.cancelText;
  const showCancel = cancelLabel !== null;
  const accent = kindAccent(kind);
  const iconName: keyof typeof Ionicons.glyphMap =
    state.icon ?? defaultIcon(kind);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        transparent
        visible={state.visible}
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => close(false)}
      >
        <Animated.View style={[styles.backdrop, { opacity }]}>
          <TouchableWithoutFeedback onPress={() => showCancel && close(false)}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <Animated.View
            style={[
              styles.card,
              { transform: [{ scale }] },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: accent.tint }]}>
              <Ionicons name={iconName} size={26} color={accent.color} />
            </View>
            <Text style={styles.title}>{state.title}</Text>
            {!!state.message && <Text style={styles.message}>{state.message}</Text>}
            <View
              style={[
                styles.actions,
                !showCancel && styles.actionsSingle,
              ]}
            >
              {showCancel && (
                <TouchableOpacity
                  style={[styles.btn, styles.btnGhost]}
                  onPress={() => close(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnGhostText}>{cancelLabel}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.btn,
                  { backgroundColor: accent.color },
                  !showCancel && styles.btnFull,
                ]}
                onPress={() => close(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.btnPrimaryText}>{confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>.');
  }
  return ctx;
}

function defaultIcon(kind: ConfirmKind): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'destructive':
      return 'trash-outline';
    case 'success':
      return 'checkmark-circle-outline';
    case 'warning':
      return 'warning-outline';
    default:
      return 'help-circle-outline';
  }
}

function kindAccent(kind: ConfirmKind): { color: string; tint: string } {
  switch (kind) {
    case 'destructive':
      return { color: Colors.error, tint: Colors.errorLight };
    case 'success':
      return { color: Colors.success, tint: Colors.successLight };
    case 'warning':
      return { color: Colors.warning, tint: Colors.warningLight };
    default:
      return { color: Colors.primary, tint: hexAlpha(Colors.primary, 0.12) };
  }
}

// Cheap hex → rgba helper for the default accent tint. Falls back to a
// translucent black if the input isn't a 6-digit hex.
function hexAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(0,0,0,${alpha})`;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: C.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: C.surface,
      borderRadius: 20,
      paddingVertical: 24,
      paddingHorizontal: 22,
      alignItems: 'center',
      shadowColor: C.black,
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    title: {
      fontSize: 17,
      fontFamily: 'Manrope_700Bold',
      color: C.text,
      textAlign: 'center',
    },
    message: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: 'Manrope_400Regular',
      color: C.textSecondary,
      textAlign: 'center',
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 20,
      width: '100%',
    },
    actionsSingle: {
      justifyContent: 'center',
    },
    btn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnFull: {
      flex: 0,
      width: '100%',
    },
    btnGhost: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: C.border,
    },
    btnGhostText: {
      color: C.textSecondary,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 14,
    },
    btnPrimaryText: {
      color: C.white,
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
    },
  });
