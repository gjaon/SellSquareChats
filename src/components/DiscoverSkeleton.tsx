import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

interface Props {
  height: number;
}

/**
 * Full-screen skeleton placeholder for the Discover feed. Mimics the
 * layout of a `DiscoverPostCard` (full-bleed media + bottom-left text
 * column + right-side action rail) with a soft pulsing animation so the
 * screen has perceived structure while the first page is loading.
 */
export default function DiscoverSkeleton({ height }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

  return (
    <View style={[styles.container, { height }]}>
      {/* Background "media" block */}
      <Animated.View style={[styles.media, { opacity }]} />

      {/* Right action rail */}
      <View style={styles.rail}>
        <Animated.View style={[styles.railDot, { opacity }]} />
        <Animated.View style={[styles.railDot, { opacity }]} />
        <Animated.View style={[styles.railDot, { opacity }]} />
        <Animated.View style={[styles.railDot, { opacity }]} />
      </View>

      {/* Bottom-left text column */}
      <View style={styles.textCol}>
        <Animated.View style={[styles.lineShort, { opacity }]} />
        <Animated.View style={[styles.lineLong, { opacity }]} />
        <Animated.View style={[styles.lineMid, { opacity }]} />
        <Animated.View style={[styles.cta, { opacity }]} />
      </View>
    </View>
  );
}

const SHIMMER = '#222';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  media: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SHIMMER,
  },
  rail: {
    position: 'absolute',
    right: 12,
    bottom: 140,
    alignItems: 'center',
    gap: 22,
  },
  railDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#333',
  },
  textCol: {
    position: 'absolute',
    left: 16,
    right: 80,
    bottom: 32,
    gap: 10,
  },
  lineShort: {
    width: '35%',
    height: 14,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  lineLong: {
    width: '85%',
    height: 18,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  lineMid: {
    width: '60%',
    height: 14,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  cta: {
    marginTop: 6,
    width: 140,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#333',
  },
});
