/**
 * SupportAttachmentBar — the photo/video picker + preview strip shared by the
 * buyer's "New request" composer and the ticket reply box.
 *
 * Picks via expo-image-picker (images + video), size-checks against the backend
 * caps (image ≤10 MB, video ≤50 MB, ≤5/message), uploads each to S3 through the
 * two-step endpoint immediately, and keeps the picked local URI alongside the
 * returned S3 metadata for an instant local preview (no authed round-trip to
 * render what was just picked). The parent strips `localUri` before sending.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import supportService, { SupportAttachment } from '../../services/supportService';

export type LocalAttachment = SupportAttachment & { localUri?: string };

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

interface Props {
  attachments: LocalAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<LocalAttachment[]>>;
  disabled?: boolean;
}

/** Strip the preview-only field before the attachment goes to the backend. */
export const stripLocal = (list: LocalAttachment[]): SupportAttachment[] =>
  list.map(({ localUri, ...rest }) => rest);

export default function SupportAttachmentBar({ attachments, setAttachments, disabled }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [uploading, setUploading] = useState(false);

  const pick = async () => {
    const remaining = MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      Alert.alert('Limit reached', `Up to ${MAX_ATTACHMENTS} attachments per message.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach files.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.7,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.length) return;
    setUploading(true);
    try {
      for (const asset of result.assets as any[]) {
        if (!asset.uri) continue;
        const isVideo =
          (asset.type || '').toString().startsWith('video') || asset.mediaType === 'video';
        const size = asset.fileSize || 0;
        if (isVideo && size > MAX_VIDEO_BYTES) {
          Alert.alert('Too large', `${asset.fileName || 'Video'} is over 50 MB.`);
          continue;
        }
        if (!isVideo && size > MAX_IMAGE_BYTES) {
          Alert.alert('Too large', `${asset.fileName || 'Image'} is over 10 MB.`);
          continue;
        }
        const meta = await supportService.uploadAttachment({
          uri: asset.uri,
          fileName: asset.fileName,
          type: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
        });
        setAttachments((prev) => [...prev, { ...meta, localUri: asset.uri }]);
      }
    } catch (err: any) {
      Alert.alert('Upload failed', err?.response?.data?.message || 'Attachment upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const remove = (key: string) =>
    setAttachments((prev) => prev.filter((a) => a.key !== key));

  return (
    <View style={styles.wrap}>
      {attachments.length > 0 && (
        <View style={styles.grid}>
          {attachments.map((a) => (
            <View key={a.key} style={styles.chip}>
              {a.kind === 'image' && a.localUri ? (
                <Image source={{ uri: a.localUri }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.videoThumb]}>
                  <Ionicons name="videocam" size={18} color={Colors.white} />
                </View>
              )}
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => remove(a.key)}
                accessibilityLabel="Remove attachment"
              >
                <Ionicons name="close" size={12} color={Colors.white} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      <TouchableOpacity
        style={styles.attachBtn}
        onPress={pick}
        disabled={disabled || uploading}
        activeOpacity={0.7}
      >
        {uploading ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Ionicons name="attach" size={18} color={Colors.primary} />
        )}
        <Text style={styles.attachText}>{uploading ? 'Uploading…' : 'Attach photo / video'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { width: 56, height: 56 },
    thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: C.border },
    videoThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.textMuted },
    removeBtn: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: C.error,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
    attachText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', color: C.primary },
  });
