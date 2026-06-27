// Long-press magnifier overlay for Discover photos. While the buyer
// holds and drags on a photo, a circular zoom lens appears above their
// finger showing a 2.5x crop of whatever pixel region is under the
// touch point (Amazon-style). Releasing the press hides the lens.
//
// Implementation:
//  - We render the underlying image normally inside a `View` that owns
//    the gesture.
//  - On long-press we mount a second copy of the image, scaled up
//    (transform: scale + translate), inside a circular masked view that
//    follows the touch position.
//  - The translation is computed so the pixel under the user's finger
//    stays under the lens center.
import React, { useRef, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  GestureResponderEvent,
} from 'react-native';
import SmartImage from './SmartImage';
import { Colors } from '../constants/colors';
import { useThemedStyles } from '../theme/useThemedStyles';

// expo-image rendered through Animated so we can drive the zoom translate
// with native-driven Animated.Values. SmartImage forwards the ref via
// React.forwardRef so this is safe.
const AnimatedSmartImage = Animated.createAnimatedComponent(SmartImage);

interface Props {
  uri: string;
  width: number;
  height: number;
  /** Lens diameter, defaults to 280 (was 160 — too small under the thumb). */
  lensSize?: number;
  /** Zoom factor, defaults to 3 (was 2.5). */
  zoom?: number;
  /** Forwarded onPress for short taps (long-press is handled internally). */
  onTap?: () => void;
  /** Notifies the parent whenever the magnifier engages/releases so it
   *  can disable carousel paging while the buyer is inspecting. */
  onZoomStateChange?: (active: boolean) => void;
  /** Stable identity hint passed to expo-image so FlatList cell
   *  recycling swaps the bitmap in place instead of re-decoding. */
  recyclingKey?: string;
}

export default function ZoomablePhoto({
  uri,
  width,
  height,
  lensSize = 280,
  zoom = 3,
  onTap,
  onZoomStateChange,
  recyclingKey,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const [active, setActive] = useState(false);
  // Touch position, in container coordinates.
  const touchX = useRef(new Animated.Value(0)).current;
  const touchY = useRef(new Animated.Value(0)).current;
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = useRef(false);
  const startedAt = useRef(0);

  const halfLens = lensSize / 2;

  const updateTouch = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    touchX.setValue(locationX);
    touchY.setValue(locationY);
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Once we've claimed the gesture, do NOT let an ancestor (the
        // horizontal carousel ScrollView) steal it back when the touch
        // moves sideways. Otherwise the buyer trying to pan the lens
        // ends up swiping the carousel page instead.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          moved.current = false;
          startedAt.current = Date.now();
          updateTouch(e);
          if (longPressTimer.current) clearTimeout(longPressTimer.current);
          // ~350ms hold to engage the lens. Less than that is just a tap.
          longPressTimer.current = setTimeout(() => {
            setActive(true);
            onZoomStateChange?.(true);
          }, 350);
        },
        onPanResponderMove: (e: GestureResponderEvent) => {
          moved.current = true;
          updateTouch(e);
        },
        onPanResponderRelease: () => {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
          // Short tap with no movement and the lens never engaged
          // → forward as onTap.
          const elapsed = Date.now() - startedAt.current;
          if (!active && !moved.current && elapsed < 350) {
            onTap?.();
          }
          setActive(false);
          onZoomStateChange?.(false);
        },
        onPanResponderTerminate: () => {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
          setActive(false);
          onZoomStateChange?.(false);
        },
      }),
    // active intentionally excluded — re-creating mid-gesture would
    // cancel the responder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Lens position: place the lens ABOVE the finger so the buyer can
  // actually see what they're zooming on (a thumb otherwise covers
  // most of the lens). Offset = halfLens above + a small visual gap.
  const LENS_LIFT = halfLens + 60;
  const lensLeft = Animated.subtract(touchX, halfLens);
  const lensTop = Animated.subtract(touchY, LENS_LIFT);

  // The zoomed image inside the lens. We render the full image scaled
  // by `zoom`, then translate so the touch point ends up at the lens
  // center: translate = -(touch * zoom) + halfLens.
  const innerTx = Animated.add(
    Animated.multiply(touchX, -zoom),
    halfLens,
  );
  const innerTy = Animated.add(
    Animated.multiply(touchY, -zoom),
    halfLens,
  );

  return (
    <View style={{ width, height }} {...responder.panHandlers}>
      <SmartImage
        uri={uri}
        style={{ width, height }}
        variant="feed"
        resizeMode="cover"
        recyclingKey={recyclingKey}
      />
      {active ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.lens,
            {
              width: lensSize,
              height: lensSize,
              borderRadius: halfLens,
              transform: [
                { translateX: lensLeft as any },
                { translateY: lensTop as any },
              ],
            },
          ]}
        >
          <AnimatedSmartImage
            uri={uri}
            // `lens` variant disables the fade transition so the zoomed
            // copy paints instantly using the bitmap already cached by
            // the base image above (expo-image dedupes by URL).
            variant="lens"
            resizeMode="cover"
            recyclingKey={recyclingKey}
            style={{
              width: width * zoom,
              height: height * zoom,
              transform: [
                { translateX: innerTx as any },
                { translateY: innerTy as any },
              ],
            }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    lens: {
      position: 'absolute',
      top: 0,
      left: 0,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: '#fff',
      backgroundColor: '#000',
      shadowColor: '#000',
      shadowOpacity: 0.5,
      shadowOffset: { width: 0, height: 3 },
      shadowRadius: 8,
      elevation: 8,
    },
  });
