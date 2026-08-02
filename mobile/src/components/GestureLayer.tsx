/**
 * GestureLayer
 *
 * Wraps the entire app. Detects:
 *  1. Swipe-up  — pan gesture translating > 60px upward from bottom 120px
 *  2. Long-press — 600ms hold anywhere
 *  3. Shake      — accelerometer delta > threshold
 *
 * When any of these fire, it opens the LiquidGlassSheet.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { LiquidGlassSheet } from './LiquidGlassSheet';
import { useShakeDetector } from '../hooks/useShakeDetector';
import { Transaction } from '../api';

interface Props {
  children: React.ReactNode;
  onTransactionLogged?: (txs: Transaction[]) => void;
}

export function GestureLayer({ children, onTransactionLogged }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const cooldown = useRef(false);
  // Stable ref so openSheet identity doesn't cause shake re-subscription
  const sheetOpenRef = useRef(sheetOpen);
  useEffect(() => { sheetOpenRef.current = sheetOpen; }, [sheetOpen]);

  const openSheet = useCallback(() => {
    if (cooldown.current || sheetOpenRef.current) return;
    cooldown.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSheetOpen(true);
    setTimeout(() => { cooldown.current = false; }, 800);
  }, []);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const handleLogged = useCallback(
    (txs: Transaction[]) => {
      onTransactionLogged?.(txs);
    },
    [onTransactionLogged],
  );

  // ── Shake ────────────────────────────────────────────────────────────────────
  useShakeDetector({ onShake: openSheet });

  // ── Swipe-up from bottom edge ────────────────────────────────────────────────
  const swipeUpGesture = Gesture.Pan()
    .minDistance(40)
    .activeOffsetY([-999, -20])
    .onEnd((e) => {
      // Only trigger on fast upward swipe
      if (e.translationY < -60 && Math.abs(e.velocityY) > 200) {
        runOnJS(openSheet)();
      }
    });

  // ── Long-press anywhere ───────────────────────────────────────────────────────
  const longPressGesture = Gesture.LongPress()
    .minDuration(600)
    .maxDistance(20)
    .onStart(() => {
      runOnJS(openSheet)();
    });

  const composedGesture = Gesture.Simultaneous(swipeUpGesture, longPressGesture);

  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={composedGesture}>
        <View style={styles.root} collapsable={false}>
          {children}
        </View>
      </GestureDetector>

      <LiquidGlassSheet
        visible={sheetOpen}
        onClose={closeSheet}
        onTransactionLogged={handleLogged}
      />
    </GestureHandlerRootView>
  );
}


const styles = StyleSheet.create({
  root: { flex: 1 },
});
