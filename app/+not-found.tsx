import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Colors } from '../src/constants/colors';
import { useThemedStyles } from '../src/theme/useThemedStyles';

export default function NotFound() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>404</Text>
      <Text style={styles.sub}>This screen doesn't exist.</Text>
      <Link href="/" style={styles.link}>
        Go home
      </Link>
    </View>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 48, fontFamily: 'Manrope_700Bold', color: C.text },
  sub: { fontSize: 16, color: C.textSecondary, marginTop: 8 },
  link: { marginTop: 24, color: C.primary, fontSize: 16 },
});
