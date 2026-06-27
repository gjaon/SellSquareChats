// Draggable scrub bar overlaid on a Discover video. The buyer can drag
// the thumb (or tap anywhere along the track) to seek the underlying
// expo-video player. Auto-hides while the user is not interacting so it
// doesn't clutter the immersive viewing experience.
import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  LayoutChangeEvent,
  Text,
} from 'react-native';
import type { VideoPlayer } from 'expo-video';
import { Colors } from '../constants/colors';
import { useThemedStyles } from '../theme/useThemedStyles';

interface Props {
  player: VideoPlayer | null;
  visible: boolean;
  /** Notifies the parent while the buyer is dragging the thumb so the
   *  parent can lock its horizontal carousel from paging sideways. */
  onScrubStateChange?: (scrubbing: boolean) => void;
}

const formatTime = (sec: number): string => {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? `0${s}` : s}`;
};

export default function VideoScrubBar({ player, visible, onScrubStateChange }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [trackWidth, setTrackWidth] = useState(0);
  const [duration, setDuration] = useState(0);
  // currentTime is read from the player on a 250ms interval while the
  // user is not actively scrubbing. While scrubbing, the local
  // `dragTime` overrides it for snappy thumb feedback.
  const [currentTime, setCurrentTime] = useState(0);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const isScrubbingRef = useRef(false);

  // Poll the player for current/duration. expo-video doesn't expose
  // these as observable props in older versions, so polling is the
  // simplest cross-version approach.
  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      try {
        const d = Number((player as any).duration || 0);
        if (Number.isFinite(d) && d > 0 && d !== duration) setDuration(d);
        if (!isScrubbingRef.current) {
          const t = Number((player as any).currentTime || 0);
          if (Number.isFinite(t)) setCurrentTime(t);
        }
      } catch {
        // expo-video can throw if accessed before the player is ready
        // — just skip this tick.
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [player, duration]);

  const seekTo = (sec: number) => {
    if (!player) return;
    const clamped = Math.max(0, Math.min(sec, duration || sec));
    try {
      (player as any).currentTime = clamped;
    } catch {
      // Player not ready — ignore.
    }
  };

  // Track whether the video was playing when scrubbing started so we
  // can restore that state on release. While scrubbing we PAUSE the
  // player and only frame-seek as the buyer drags, so the video shows
  // exactly the moment under their thumb instead of continuing to
  // play forward.
  const wasPlayingRef = useRef(false);
  const pausePlayer = () => {
    if (!player) return;
    try {
      wasPlayingRef.current = !!(player as any).playing;
      (player as any).pause?.();
    } catch {
      // ignore
    }
  };
  const resumePlayer = () => {
    if (!player) return;
    try {
      if (wasPlayingRef.current) (player as any).play?.();
    } catch {
      // ignore
    }
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          if (!duration || trackWidth <= 0) return;
          isScrubbingRef.current = true;
          setIsScrubbing(true);
          onScrubStateChange?.(true);
          // Pause + jump immediately so the video shows the frame
          // under the buyer's thumb the moment they touch the track.
          pausePlayer();
          const x = e.nativeEvent.locationX;
          const pct = Math.max(0, Math.min(1, x / trackWidth));
          const t = pct * duration;
          setDragTime(t);
          seekTo(t);
        },
        onPanResponderMove: (
          e: GestureResponderEvent,
          _gesture: PanResponderGestureState,
        ) => {
          if (!duration || trackWidth <= 0) return;
          const x = Math.max(
            0,
            Math.min(trackWidth, (e.nativeEvent.locationX ?? 0)),
          );
          const pct = Math.max(0, Math.min(1, x / trackWidth));
          const t = pct * duration;
          setDragTime(t);
          // Live frame-seek so the video tracks the drag in realtime.
          seekTo(t);
        },
        onPanResponderRelease: () => {
          if (dragTime != null) seekTo(dragTime);
          isScrubbingRef.current = false;
          setIsScrubbing(false);
          setDragTime(null);
          onScrubStateChange?.(false);
          resumePlayer();
        },
        onPanResponderTerminate: () => {
          isScrubbingRef.current = false;
          setIsScrubbing(false);
          setDragTime(null);
          onScrubStateChange?.(false);
          resumePlayer();
        },
      }),
    // dragTime + duration intentionally NOT in deps — the responder
    // callbacks read the latest values via closures over state setters.
    // Re-creating the responder mid-gesture would interrupt scrubbing.
    [trackWidth, duration],
  );

  if (!visible || !player) return null;

  const displayTime = dragTime != null ? dragTime : currentTime;
  const pct = duration > 0 ? Math.max(0, Math.min(1, displayTime / duration)) : 0;
  const fillWidth = pct * trackWidth;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      {isScrubbing ? (
        <View style={styles.timeBubble} pointerEvents="none">
          <Text style={styles.timeText}>
            {formatTime(displayTime)} / {formatTime(duration)}
          </Text>
        </View>
      ) : null}
      <View
        style={styles.touchArea}
        onLayout={(e: LayoutChangeEvent) =>
          setTrackWidth(e.nativeEvent.layout.width)
        }
        {...responder.panHandlers}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: fillWidth }]} />
        </View>
        <View
          style={[
            styles.thumb,
            isScrubbing && styles.thumbActive,
            { left: Math.max(0, fillWidth - (isScrubbing ? 8 : 5)) },
          ]}
          pointerEvents="none"
        />
      </View>
    </View>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 12,
      // Sit above the bottom overlay scrim so the buyer can see the
      // current frame label while scrubbing.
      paddingBottom: 4,
    },
    touchArea: {
      // Generous vertical hit area so the thumb is easy to grab even
      // though the visual track is thin.
      height: 26,
      justifyContent: 'center',
    },
    track: {
      height: 3,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.35)',
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      backgroundColor: '#fff',
    },
    thumb: {
      position: 'absolute',
      top: '50%',
      marginTop: -5,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#fff',
    },
    thumbActive: {
      width: 16,
      height: 16,
      borderRadius: 8,
      marginTop: -8,
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 3,
    },
    timeBubble: {
      alignSelf: 'center',
      marginBottom: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.65)',
    },
    timeText: {
      color: '#fff',
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
    },
  });
