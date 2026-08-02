/**
 * LiquidGlassSheet
 *
 * A frosted-glass bottom sheet that animates in from the bottom with a spring.
 * Triggered by any gesture layer (swipe-up, long-press, shake).
 * Houses the primary text input for logging transactions.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import { Colors, Radius, Spacing, Typography } from '../theme';
import { api, Transaction } from '../api';
import { transactionLoggedBus } from '../utils/eventBus';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_H * 0.62;
const DISMISS_THRESHOLD = 80;

interface Props {
  visible: boolean;
  onClose: () => void;
  onTransactionLogged?: (transactions: Transaction[]) => void;
  chatId?: string;
}

const SUGGESTIONS = [
  'Bought coffee for ₹120',
  'Paid electricity bill ₹890',
  'Groceries at DMart ₹2,340',
  'Auto ride ₹85 via UPI',
  'Lunch with team ₹650 on card',
];

export function LiquidGlassSheet({
  visible,
  onClose,
  onTransactionLogged,
  chatId,
}: Props) {
  const translateY = useSharedValue(SHEET_HEIGHT);
  const opacity = useSharedValue(0);
  const dragOffset = useSharedValue(0);
  const scale = useSharedValue(0.96);

  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [activeChatId, setActiveChatId] = useState<string | undefined>(chatId);
  const inputRef = useRef<TextInput>(null);

  // Accumulate streaming tokens in a ref and flush to state at 100ms intervals
  // to avoid a full re-render per token from the LLM.
  const streamBufRef = useRef('');
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startStreamFlush = useCallback(() => {
    streamTimerRef.current = setInterval(() => {
      setStreamingText(streamBufRef.current);
    }, 100);
  }, []);

  const stopStreamFlush = useCallback(() => {
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    streamBufRef.current = '';
    setStreamingText('');
  }, []);

  // ── Open / close animation ──────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
      translateY.value = withSpring(0, {
        mass: 0.9,
        damping: 18,
        stiffness: 160,
        overshootClamping: false,
      });
      scale.value = withSpring(1, { damping: 20, stiffness: 200 });
      // Auto-focus after animation
      setTimeout(() => inputRef.current?.focus(), 320);
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      translateY.value = withSpring(SHEET_HEIGHT, { damping: 22, stiffness: 180 });
      scale.value = withTiming(0.96, { duration: 200 });
      setResult(null);
      setError(null);
      setText('');
      dragOffset.value = 0;
      stopStreamFlush();
    }
  }, [visible, stopStreamFlush]);

  // ── Drag-to-dismiss gesture ─────────────────────────────────────────────────
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        dragOffset.value = e.translationY;
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
        dragOffset.value = 0;
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!text.trim() || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    setResult(null);
    streamBufRef.current = '';
    startStreamFlush();
    try {
      const res = await api.logTransaction(
        text.trim(),
        activeChatId,
        (token) => { streamBufRef.current += token; },
      );
      stopStreamFlush();
      setActiveChatId(res.chat_id);

      const action = (res.agent_output as { action?: string } | null)?.action;
      if (action === 'log_transaction') {
        setResult('Logged ✓');
        onTransactionLogged?.(res.transactions);
        transactionLoggedBus.emit();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setText('');
        setTimeout(onClose, 1000);
      } else if (action === 'ask_clarification') {
        const q = (res.agent_output as { clarification_request?: string })?.clarification_request ?? '';
        setResult(`❓ ${q}`);
      } else {
        const reason = (res.agent_output as { reason?: string })?.reason ?? 'Unsupported request.';
        setResult(`ℹ️ ${reason}`);
      }
    } catch (err: unknown) {
      stopStreamFlush();
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [text, loading, activeChatId, onClose, onTransactionLogged, startStreamFlush, stopStreamFlush]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <View style={[StyleSheet.absoluteFill, styles.backdrop]} />
        </Pressable>
      </Animated.View>

      {/* Sheet */}
      <KeyboardAvoidingView
        style={styles.kavWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        pointerEvents="box-none"
      >
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.sheetContainer, sheetStyle]}>
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

            {/* Gradient gloss overlay */}
            <LinearGradient
              colors={['rgba(255,255,255,0.13)', 'rgba(255,255,255,0.03)', 'rgba(108,142,255,0.06)']}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Inner border glow */}
            <View style={styles.innerBorderTop} pointerEvents="none" />

            <View style={styles.sheetContent}>
              {/* Drag handle */}
              <View style={styles.handle} />

              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerDot} />
                <Text style={styles.headerTitle}>Log Transaction</Text>
                <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>

              {/* Input area */}
              <View style={styles.inputWrapper}>
                <BlurView intensity={40} tint="dark" style={styles.inputBlur} />
                <LinearGradient
                  colors={['rgba(108,142,255,0.12)', 'rgba(255,255,255,0.04)']}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  value={text}
                  onChangeText={setText}
                  placeholder="What did you spend or earn?"
                  placeholderTextColor={Colors.textHint}
                  multiline
                  maxLength={400}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={handleSubmit}
                  selectionColor={Colors.accent}
                />
              </View>

              {/* Suggestions */}
              {!text && !result && !error && (
                <View style={styles.suggestions}>
                  {SUGGESTIONS.slice(0, 3).map((s) => (
                    <Pressable
                      key={s}
                      style={styles.suggestionChip}
                      onPress={() => {
                        setText(s);
                        Haptics.selectionAsync();
                      }}
                    >
                      <Text style={styles.suggestionText}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Streaming preview */}
              {loading && streamingText.length > 0 && (
                <View style={styles.streamingRow}>
                  <Text style={styles.streamingText} numberOfLines={2}>
                    {streamingText}
                  </Text>
                </View>
              )}

              {/* Feedback */}
              {result && (
                <View style={styles.feedbackRow}>
                  <LinearGradient
                    colors={['rgba(0,212,170,0.18)', 'rgba(0,212,170,0.06)']}
                    style={StyleSheet.absoluteFill}
                  />
                  <Text style={styles.resultText}>{result}</Text>
                </View>
              )}
              {error && (
                <View style={[styles.feedbackRow, styles.feedbackError]}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* CTA */}
              <Pressable
                style={({ pressed }) => [
                  styles.submitBtn,
                  pressed && styles.submitBtnPressed,
                  (!text.trim() || loading) && styles.submitBtnDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!text.trim() || loading}
              >
                <LinearGradient
                  colors={Colors.gradientAccent}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: Radius.lg }]}
                />
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitText}>Log it →</Text>
                )}
              </Pressable>

              {/* Hint */}
              <Text style={styles.hint}>
                Powered by on-device Gemma · stays private
              </Text>
            </View>
          </Animated.View>
        </GestureDetector>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  kavWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    height: SHEET_HEIGHT,
    width: SCREEN_W,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: Colors.glassBorder,
  },
  innerBorderTop: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: Colors.glassHighlight,
    borderRadius: 1,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.glassBorder,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
    marginRight: Spacing.sm,
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.textPrimary,
    flex: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.glassBase,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  closeBtnText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  inputWrapper: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    minHeight: 100,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    marginBottom: Spacing.md,
  },
  inputBlur: {
    ...StyleSheet.absoluteFill,
  },
  input: {
    color: Colors.textPrimary,
    ...Typography.body,
    padding: Spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
    zIndex: 2,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  suggestionChip: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(108,142,255,0.30)',
  },
  suggestionText: {
    ...Typography.bodySmall,
    color: Colors.accent,
  },
  feedbackRow: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.25)',
  },
  feedbackError: {
    backgroundColor: 'rgba(255,95,126,0.12)',
    borderColor: 'rgba(255,95,126,0.30)',
  },
  resultText: {
    ...Typography.body,
    color: Colors.teal,
    fontWeight: '600',
  },
  errorText: {
    ...Typography.bodySmall,
    color: Colors.error,
  },
  submitBtn: {
    height: 52,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 'auto',
    marginBottom: Spacing.md,
  },
  submitBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitText: {
    ...Typography.h3,
    color: '#fff',
    fontWeight: '700',
  },
  hint: {
    ...Typography.caption,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  streamingRow: {
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.glassBase,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  streamingText: {
    ...Typography.mono,
    color: Colors.textMuted,
    fontSize: 11,
  },
});
