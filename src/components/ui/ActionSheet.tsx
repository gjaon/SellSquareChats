import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';

// Themed bottom-sheet action picker. Mirrors the visual language of the
// `ConfirmDialog` so the app never falls back to OS-native Alert chrome.

export type ActionSheetKind = 'default' | 'destructive';

export interface ActionSheetOption {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  kind?: ActionSheetKind;
}

export interface ActionSheetOptions {
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  cancelLabel?: string;
}

type Resolver = (index: number | null) => void;

interface InternalState extends ActionSheetOptions {
  visible: boolean;
}

const ActionSheetContext = createContext<
  ((opts: ActionSheetOptions) => Promise<number | null>) | null
>(null);

export function ActionSheetProvider({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const [state, setState] = useState<InternalState>({
    visible: false,
    options: [],
  });
  const resolverRef = useRef<Resolver | null>(null);
  const translateY = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    translateY.setValue(40);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  const close = useCallback(
    (result: number | null) => {
      const resolve = resolverRef.current;
      resolverRef.current = null;
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 40,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setState((s) => ({ ...s, visible: false }));
        resolve?.(result);
      });
    },
    [opacity, translateY],
  );

  const showActionSheet = useCallback(
    (opts: ActionSheetOptions) => {
      return new Promise<number | null>((resolve) => {
        resolverRef.current = resolve;
        setState({ visible: true, ...opts });
        requestAnimationFrame(animateIn);
      });
    },
    [animateIn],
  );

  return (
    <ActionSheetContext.Provider value={showActionSheet}>
      {children}
      <Modal
        transparent
        visible={state.visible}
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => close(null)}
      >
        <Animated.View style={[styles.backdrop, { opacity }]}>
          <TouchableWithoutFeedback onPress={() => close(null)}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <Animated.View
            style={[
              styles.sheet,
              { transform: [{ translateY }] },
            ]}
          >
            <View style={styles.handle} />
            {!!state.title && <Text style={styles.title}>{state.title}</Text>}
            {!!state.message && <Text style={styles.message}>{state.message}</Text>}
            <View style={styles.optionsWrap}>
              {state.options.map((opt, idx) => {
                const destructive = opt.kind === 'destructive';
                return (
                  <TouchableOpacity
                    key={`${opt.label}-${idx}`}
                    style={[
                      styles.option,
                      idx > 0 && styles.optionDivider,
                    ]}
                    onPress={() => close(idx)}
                    activeOpacity={0.7}
                  >
                    {opt.icon && (
                      <Ionicons
                        name={opt.icon}
                        size={20}
                        color={destructive ? Colors.error : Colors.primary}
                        style={styles.optionIcon}
                      />
                    )}
                    <Text
                      style={[
                        styles.optionText,
                        destructive && { color: Colors.error },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={styles.cancel}
              onPress={() => close(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelText}>{state.cancelLabel ?? 'Cancel'}</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>
    </ActionSheetContext.Provider>
  );
}

export function useActionSheet() {
  const ctx = useContext(ActionSheetContext);
  if (!ctx) {
    throw new Error('useActionSheet must be used inside <ActionSheetProvider>.');
  }
  return ctx;
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: C.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingTop: 8,
      paddingBottom: 28,
      paddingHorizontal: 16,
      shadowColor: C.black,
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -4 },
      elevation: 12,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border,
      marginBottom: 14,
    },
    title: {
      fontSize: 16,
      fontFamily: 'Manrope_700Bold',
      color: C.text,
      textAlign: 'center',
      paddingHorizontal: 8,
    },
    message: {
      marginTop: 4,
      fontSize: 13,
      fontFamily: 'Manrope_400Regular',
      color: C.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 8,
    },
    optionsWrap: {
      marginTop: 14,
      backgroundColor: C.background,
      borderRadius: 14,
      overflow: 'hidden',
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    optionDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    optionIcon: {
      marginRight: 12,
    },
    optionText: {
      fontSize: 15,
      fontFamily: 'Manrope_600SemiBold',
      color: C.text,
    },
    cancel: {
      marginTop: 10,
      paddingVertical: 14,
      backgroundColor: C.background,
      borderRadius: 14,
      alignItems: 'center',
    },
    cancelText: {
      fontSize: 15,
      fontFamily: 'Manrope_700Bold',
      color: C.textSecondary,
    },
  });
