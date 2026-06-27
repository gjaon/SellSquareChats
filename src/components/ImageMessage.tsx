import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, Modal, View, Dimensions } from 'react-native';
import SmartImage from './SmartImage';
import { Colors } from '../constants/colors';
import { useThemedStyles } from '../theme/useThemedStyles';

const { width } = Dimensions.get('window');

export default function ImageMessage({ uri }: { uri: string }) {
  const styles = useThemedStyles(makeStyles);
  const [enlarged, setEnlarged] = useState(false);

  return (
    <>
      <TouchableOpacity onPress={() => setEnlarged(true)}>
        <SmartImage uri={uri} style={styles.thumb} variant="thumb" resizeMode="cover" />
      </TouchableOpacity>
      <Modal visible={enlarged} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} onPress={() => setEnlarged(false)}>
          <SmartImage uri={uri} style={styles.full} variant="feed" resizeMode="contain" />
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  thumb: {
    width: 200,
    height: 150,
    borderRadius: 10,
    marginVertical: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: C.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  full: {
    width: width - 40,
    height: 400,
  },
});
