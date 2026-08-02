import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import type { Transaction } from '../api';
import { Colors, Radius, Spacing, Typography } from '../theme';
import { transactionLoggedBus } from '../utils/eventBus';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(n: number) {
  return `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning 👋';
  if (h < 17) return 'Good afternoon 👋';
  return 'Good evening 👋';
}

// ── Gesture tips ──────────────────────────────────────────────────────────────

const TIPS = [
  '↑ Swipe up anywhere to log fast',
  'Hold anywhere for 600ms to open logger',
  '📳 Shake device to log instantly',
];

const CATEGORY_ICON: Record<string, string> = {
  Food: '🍽️',
  Transport: '🚗',
  Utilities: '⚡',
  Shopping: '🛍️',
};

// ── Transaction row ───────────────────────────────────────────────────────────
// Memoized + uses Reanimated entering (native thread) instead of legacy Animated

const TxRow = memo(function TxRow({ item, index }: { item: Transaction; index: number }) {
  const isExpense = item.amount < 0;
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 40).springify().damping(15)}
      style={[
        styles.txRow,
        { backgroundColor: isExpense ? 'rgba(255,95,126,0.07)' : 'rgba(0,212,170,0.07)' },
      ]}
    >
      <View
        style={[
          styles.txIcon,
          { backgroundColor: isExpense ? 'rgba(255,95,126,0.18)' : 'rgba(0,212,170,0.18)' },
        ]}
      >
        <Text style={{ fontSize: 16 }}>
          {(item.category_name && CATEGORY_ICON[item.category_name]) ?? (isExpense ? '💸' : '💰')}
        </Text>
      </View>

      <View style={styles.txMeta}>
        <Text style={styles.txDesc} numberOfLines={1}>
          {item.description ?? item.merchant_name ?? 'Transaction'}
        </Text>
        <Text style={styles.txSub}>
          {[item.merchant_name, item.category_name, item.payment_method_name]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      <View style={styles.txRight}>
        <Text style={[styles.txAmount, { color: isExpense ? Colors.error : Colors.teal }]}>
          {isExpense ? '−' : '+'}{formatAmount(item.amount)}
        </Text>
        <Text style={styles.txTime}>{relativeTime(item.created_at)}</Text>
      </View>
    </Animated.View>
  );
});

// ── List sub-components (stable references) ───────────────────────────────────

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📭</Text>
      <Text style={styles.emptyTitle}>Nothing yet</Text>
      <Text style={styles.emptyHint}>Swipe up or shake to log your first transaction</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function HomeScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const greeting = useRef(getGreeting()).current;

  const loadRecent = useCallback(() => {
    try {
      setTransactions(api.getRecentTransactions(30));
    } catch {/* db not ready yet */}
  }, []);

  // Reload when this tab is focused
  useFocusEffect(
    useCallback(() => {
      loadRecent();
      const t = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 4000);
      return () => clearInterval(t);
    }, [loadRecent]),
  );

  // Also reload immediately when a transaction is logged from the sheet
  useEffect(() => transactionLoggedBus.on(loadRecent), [loadRecent]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRecent();
    setRefreshing(false);
  }, [loadRecent]);

  const totalExpenses = transactions
    .filter((t) => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const expenseCount = transactions.filter((t) => t.amount < 0).length;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.bg, '#0D0D1A', Colors.bg]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <FlatList
        data={transactions}
        keyExtractor={(tx) => String(tx.id)}
        renderItem={({ item, index }) => <TxRow item={item} index={index} />}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.headerBlock}>
              <Text style={styles.greeting}>{greeting}</Text>
              <Text style={styles.heroLabel}>Total Spent</Text>
              <Text style={styles.heroAmount}>{formatAmount(totalExpenses)}</Text>
              <Text style={styles.heroSub}>across {expenseCount} transactions</Text>
            </View>

            {/* Tip banner — solid bg, no BlurView */}
            <View style={styles.tipBanner}>
              <LinearGradient
                colors={['rgba(108,142,255,0.14)', 'rgba(155,109,255,0.07)']}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <Text style={styles.tipText}>{TIPS[tipIndex]}</Text>
            </View>

            <Text style={styles.sectionTitle}>Recent</Text>
          </>
        }
        ListEmptyComponent={<EmptyState />}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        windowSize={10}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scrollContent: { paddingBottom: 120 },

  headerBlock: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl + 10,
    paddingBottom: Spacing.xl,
  },
  greeting: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  heroLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  heroAmount: {
    ...Typography.displayLg,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  heroSub: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
  },

  tipBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: Colors.glassBase,
  },
  tipText: {
    ...Typography.bodySmall,
    color: Colors.accent,
    fontWeight: '500',
  },

  sectionTitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    fontSize: 11,
  },

  txRow: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm - 2,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md - 4,
  },
  txMeta: { flex: 1 },
  txDesc: { ...Typography.body, color: Colors.textPrimary, fontWeight: '500' },
  txSub: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  txRight: { alignItems: 'flex-end' },
  txAmount: { ...Typography.h3, fontWeight: '700' },
  txTime: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },

  emptyState: {
    alignItems: 'center',
    paddingTop: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: { fontSize: 40, marginBottom: Spacing.md },
  emptyTitle: { ...Typography.h2, color: Colors.textSecondary, marginBottom: Spacing.sm },
  emptyHint: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
