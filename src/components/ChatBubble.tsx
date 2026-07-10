import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Linking } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { Message, ProductCard } from '../store/slices/chatSlice';
import ImageMessage from './ImageMessage';
import ProductCardList from './ProductCardList';
import { colorForSender } from '../utils/participantColors';

interface ChatBubbleProps {
  message: Message;
  /**
   * Label rendered above messages sent by the merchant (the "Store" pill).
   * Falls back to "Store" when the parent doesn't yet know the business
   * name (e.g. while chat-meta is still loading).
   */
  agentLabel?: string;
  /**
   * The AI assistant's configured name (e.g. "Ada"). Shown above the
   * assistant's bubbles so the buyer sees a named person from the team
   * rather than a faceless "Store". Falls back to no label when the store
   * hasn't named its assistant yet.
   */
  aiLabel?: string;
  /**
   * Fired when the buyer swipes the bubble far enough horizontally to
   * trigger a "reply" gesture. The chat screen shows a quote preview
   * above the input bar and prepends the quote to the next outbound
   * message. When omitted, swipe-to-reply is disabled.
   */
  onSwipeReply?: (message: Message) => void;
  /**
   * Fired when the buyer taps the quote block at the top of a reply
   * bubble. The chat screen scrolls the FlatList to the original
   * message that the reply is referencing.
   */
  onJumpToOriginal?: (replyTo: NonNullable<Message['replyTo']>) => void;
  /**
   * Fired when the buyer hits "Ask about this" inside the product
   * detail sheet on an inline product card. The chat screen sends a
   * preset chat message back to the AI.
   */
  onAskAboutProduct?: (card: ProductCard) => void;
  /**
   * ISO-4217 currency code for this store. Inline product cards format their
   * prices in the store's own currency (no FX conversion). Defaults to NGN.
   */
  currency?: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Matches http(s) URLs in free text. Captured so that String.split keeps
// the URLs as their own segments and we can render them as tappable
// links inline (e.g. Flutterwave checkout links the AI sends in chat).
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function renderContentWithLinks(
  content: string,
  textColor: string,
  linkColor: string,
) {
  const parts = content.split(URL_REGEX);
  return parts.map((part, idx) => {
    if (URL_REGEX.test(part)) {
      // Reset regex state since we re-test each segment.
      URL_REGEX.lastIndex = 0;
      // Trim trailing punctuation that's almost never part of the URL.
      const trailingMatch = part.match(/[.,;:!?)\]]+$/);
      const trailing = trailingMatch ? trailingMatch[0] : '';
      const url = trailing ? part.slice(0, -trailing.length) : part;
      return (
        <Text
          key={idx}
          style={{ color: linkColor, textDecorationLine: 'underline' }}
          onPress={() => Linking.openURL(url).catch(() => {})}
        >
          {url}
          {trailing ? <Text style={{ color: textColor, textDecorationLine: 'none' }}>{trailing}</Text> : null}
        </Text>
      );
    }
    URL_REGEX.lastIndex = 0;
    return <Text key={idx} style={{ color: textColor }}>{part}</Text>;
  });
}

export default function ChatBubble({
  message,
  agentLabel,
  aiLabel,
  onSwipeReply,
  onJumpToOriginal,
  onAskAboutProduct,
  currency,
}: ChatBubbleProps) {
  const styles = useThemedStyles(makeStyles);
  const swipeableRef = useRef<Swipeable>(null);
  const isUser = message.role === 'user';
  const isAgent = message.sentByBusiness;
  // Incoming assistant message that the AI produced (not a human takeover).
  const isAI = !isUser && !isAgent;

  // Per-sender colour: the AI gets its reserved colour; each human staff
  // member who takes over gets a stable colour derived from their name.
  const senderName = isAgent ? message.injectedByName || '' : '';
  const senderColor = isUser
    ? undefined
    : isAI
    ? colorForSender({ isAI: true })
    : message.injectedByName
    ? colorForSender({ name: senderName })
    : Colors.primary;
  // Name shown on the label row. Human takeovers read under the staffer's
  // name; AI bubbles under the assistant's configured name.
  const incomingLabel = isAgent
    ? message.injectedByName || agentLabel || 'Store'
    : aiLabel || '';

  const bubbleBg = isUser
    ? Colors.bubbleUser
    : isAgent
    ? Colors.bubbleAgent
    : Colors.bubbleAI;

  const textColor = isUser ? Colors.bubbleUserText : Colors.text;

  // Underlay icon that fades in as the buyer drags the bubble. Visual
  // affordance only — the swipe itself fires onSwipeReply.
  const renderUnderlay = (
    progress: Animated.AnimatedInterpolation<number>,
    side: 'left' | 'right',
  ) => {
    const opacity = progress.interpolate({
      inputRange: [0, 0.6, 1],
      outputRange: [0, 0.6, 1],
      extrapolate: 'clamp',
    });
    const scale = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.6, 1],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View
        style={[
          styles.replyUnderlay,
          side === 'left' ? styles.replyUnderlayLeft : styles.replyUnderlayRight,
          { opacity, transform: [{ scale }] },
        ]}
      >
        <Ionicons name="arrow-undo" size={20} color={Colors.primary} />
      </Animated.View>
    );
  };

  const inner = (
    <View style={[styles.row, isUser && styles.rowRight]}>
      <View style={[styles.bubble, { backgroundColor: bubbleBg }, isUser && styles.bubbleRight]}>
        {/* WhatsApp-style quote block when this message is a reply.
            Tappable so the buyer can jump back to the original. */}
        {message.replyTo && message.replyTo.snippet ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onJumpToOriginal && onJumpToOriginal(message.replyTo!)}
            style={[
              styles.quoteBlock,
              isUser ? styles.quoteBlockOnUser : styles.quoteBlockOnIncoming,
            ]}
          >
            <View
              style={[
                styles.quoteBar,
                isUser ? styles.quoteBarOnUser : styles.quoteBarOnIncoming,
              ]}
            />
            <View style={styles.quoteBody}>
              {message.replyTo.label ? (
                <Text
                  style={[
                    styles.quoteLabel,
                    isUser && styles.quoteLabelOnUser,
                  ]}
                  numberOfLines={1}
                >
                  {message.replyTo.label}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.quoteSnippet,
                  isUser && styles.quoteSnippetOnUser,
                ]}
                numberOfLines={2}
              >
                {message.replyTo.snippet}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}
        {!isUser && incomingLabel ? (
          <Text
            style={[
              styles.agentLabel,
              senderColor ? { color: senderColor } : undefined,
            ]}
          >
            {incomingLabel}
          </Text>
        ) : null}
        {message.mediaUrl && <ImageMessage uri={message.mediaUrl} />}
        {message.content && message.content !== '(image sent)' && (
          <Text style={[styles.content, { color: textColor }, message.mediaUrl ? styles.contentWithImage : undefined]}>
            {renderContentWithLinks(message.content, textColor, isUser ? Colors.white : Colors.primary)}
          </Text>
        )}
        {message.productCards && message.productCards.length > 0 ? (
          <ProductCardList
            cards={message.productCards}
            onAskAbout={onAskAboutProduct}
            currency={currency}
          />
        ) : null}
        <Text style={[styles.time, { color: isUser ? 'rgba(255,255,255,0.6)' : Colors.textMuted }]}>
          {formatTime(message.timestamp)}
        </Text>
      </View>
    </View>
  );

  if (!onSwipeReply) {
    return inner;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      // Incoming bubbles (left side) reveal on left swipe; outgoing
      // bubbles (right side) reveal on right swipe — mirrors WhatsApp.
      renderLeftActions={(progress) =>
        !isUser ? renderUnderlay(progress, 'left') : null
      }
      renderRightActions={(progress) =>
        isUser ? renderUnderlay(progress, 'right') : null
      }
      leftThreshold={50}
      rightThreshold={50}
      onSwipeableWillOpen={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSwipeReply(message);
        // Snap the row back so the underlay closes after the gesture
        // fires — the reply preview shows above the input bar instead.
        requestAnimationFrame(() => swipeableRef.current?.close());
      }}
    >
      {inner}
    </Swipeable>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  row: { marginVertical: 3, marginHorizontal: 14, alignItems: 'flex-start' },
  rowRight: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 12,
  },
  bubbleRight: { borderBottomRightRadius: 4 },
  agentLabel: {
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
    color: C.primary,
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  content: {
    fontSize: 15,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 22,
  },
  contentWithImage: {
    marginTop: 6,
  },
  time: {
    fontSize: 10,
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
    textAlign: 'right',
  },
  replyUnderlay: {
    width: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyUnderlayLeft: {
    paddingLeft: 14,
    alignItems: 'flex-start',
  },
  replyUnderlayRight: {
    paddingRight: 14,
    alignItems: 'flex-end',
  },
  // WhatsApp-style quoted message rendered at the top of a reply
  // bubble. The accent bar + tinted background visually separate it
  // from the bubble's main content; tapping scrolls to the original.
  // The min-width forces the parent bubble to expand even when the
  // reply text itself is short, so the quoted snippet always has
  // room for two readable lines instead of being squeezed into a
  // narrow column that truncates after a couple of words.
  quoteBlock: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 6,
    minWidth: 220,
    alignSelf: 'stretch',
  },
  quoteBlockOnIncoming: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  quoteBlockOnUser: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  quoteBar: {
    width: 3,
  },
  quoteBarOnIncoming: { backgroundColor: C.primary },
  quoteBarOnUser: { backgroundColor: C.white },
  quoteBody: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  quoteLabel: {
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
    color: C.primary,
    marginBottom: 2,
  },
  quoteLabelOnUser: {
    color: C.white,
  },
  quoteSnippet: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: C.textSecondary,
    lineHeight: 16,
    // Reserve two lines of height so a one-word reply with a long
    // quoted snippet still shows the full preview before truncating.
    minHeight: 32,
  },
  quoteSnippetOnUser: {
    color: 'rgba(255,255,255,0.85)',
  },
});
