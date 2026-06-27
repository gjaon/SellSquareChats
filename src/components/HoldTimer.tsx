import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { useThemedStyles } from '../theme/useThemedStyles';

interface HoldTimerProps {
  holdsExpiresAt: string;
  onExpire: () => void;
}

export default function HoldTimer({ holdsExpiresAt, onExpire }: HoldTimerProps) {
  const styles = useThemedStyles(makeStyles);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const target = new Date(holdsExpiresAt).getTime();

    const tick = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      setSecondsLeft(diff);
      if (diff === 0 && !expired) {
        setExpired(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        onExpire();
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [holdsExpiresAt]);

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const isWarning = secondsLeft <= 60 && secondsLeft > 0;
  const color = expired
    ? Colors.holdTimerExpired
    : isWarning
    ? Colors.holdTimerWarning
    : Colors.holdTimerSafe;

  return (
    <View style={[styles.banner, { backgroundColor: color + '18', borderColor: color }]}>
      <Ionicons name="timer-outline" size={16} color={color} />
      <Text style={[styles.text, { color }]}>
        {expired
          ? 'Reservation expired — items released'
          : `Items reserved — ${minutes}:${secs.toString().padStart(2, '0')} remaining`}
      </Text>
    </View>
  );
}

const makeStyles = (_C: typeof Colors) => StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  text: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
  },
});
