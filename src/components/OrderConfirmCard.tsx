import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/colors';
import { useThemedStyles } from '../theme/useThemedStyles';

interface OrderConfirmCardProps {
  orderNumber: string;
}

export default function OrderConfirmCard({ orderNumber }: OrderConfirmCardProps) {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
        <View style={styles.info}>
          <Text style={styles.title}>Order {orderNumber} placed</Text>
          <Text style={styles.sub}>Awaiting business confirmation</Text>
        </View>
      </View>
      <TouchableOpacity onPress={() => router.push('/(main)/orders')} style={styles.btn}>
        <Text style={styles.btnText}>View All Orders</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  card: {
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: C.successLight,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.success + '40',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  info: { flex: 1 },
  title: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
    color: C.text,
  },
  sub: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: C.textSecondary,
    marginTop: 1,
  },
  btn: {
    backgroundColor: C.success,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnText: {
    color: C.white,
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
  },
});
