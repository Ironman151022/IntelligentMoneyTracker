import React, { memo, useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { api, Evaluation } from '../api';
import { Colors, Radius, Spacing, Typography } from '../theme';

// ── Verdict config ────────────────────────────────────────────────────────────
// Values must match the DB CHECK constraint: 'ok' | 'not_ok' | 'pending'

const VERDICTS = ['ok', 'not_ok'] as const;
type Verdict = typeof VERDICTS[number];

const VERDICT_COLORS: Record<Verdict, string> = {
  ok: Colors.teal,
  not_ok: Colors.error,
};

const VERDICT_LABEL: Record<Verdict, string> = {
  ok: '✓ Correct',
  not_ok: '✗ Wrong',
};

// ── Eval card — memoized so FlatList only re-renders changed cards ─────────────

const EvalCard = memo(function EvalCard({ item }: { item: Evaluation }) {
  const [verdict, setVerdict] = useState<Verdict | null>(
    (item.verdict as Verdict | null) ?? null,
  );
  const [saving, setSaving] = useState(false);

  const handleVerdict = async (v: Verdict) => {
    if (saving) return;
    Haptics.selectionAsync();
    setSaving(true);
    try {
      await api.patchEvaluation(item.id, { verdict: v });
      setVerdict(v);
    } catch {/* ignore */}
    setSaving(false);
  };

  return (
    <View style={styles.card}>
      {/* Solid glass bg — no per-card BlurView */}
      <LinearGradient
        colors={['rgba(255,255,255,0.05)', 'rgba(0,0,0,0)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.cardContent}>
        <Text style={styles.userMsg} numberOfLines={3}>
          {item.user_message}
        </Text>
        <Text style={styles.agentResp} numberOfLines={4}>
          {item.agent_response}
        </Text>

        <View style={styles.verdictRow}>
          {VERDICTS.map((v) => (
            <Pressable
              key={v}
              style={[
                styles.verdictBtn,
                verdict === v && {
                  backgroundColor: VERDICT_COLORS[v] + '33',
                  borderColor: VERDICT_COLORS[v],
                },
              ]}
              onPress={() => handleVerdict(v)}
              disabled={saving}
            >
              <Text
                style={[
                  styles.verdictText,
                  { color: verdict === v ? VERDICT_COLORS[v] : Colors.textMuted },
                ]}
              >
                {VERDICT_LABEL[v]}
              </Text>
            </Pressable>
          ))}
          {saving && (
            <ActivityIndicator size="small" color={Colors.accent} style={{ marginLeft: 8 }} />
          )}
        </View>

        <Text style={styles.timestamp}>
          {new Date(item.created_at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  );
});

// ── Screen ────────────────────────────────────────────────────────────────────

export function HistoryScreen() {
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async (p: number) => {
    try {
      const data = await api.getEvaluations(p, 20);
      if (p === 1) setEvals(data);
      else setEvals((prev) => [...prev, ...data]);
      setHasMore(data.length === 20);
    } catch {/* offline */}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setPage(1);
      load(1);
    }, [load]),
  );

  const loadMore = useCallback(() => {
    if (!hasMore) return;
    const next = page + 1;
    setPage(next);
    load(next);
  }, [hasMore, page, load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <LinearGradient colors={[Colors.bg, '#0D0D1A']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.bg, '#0D0D1A', Colors.bg]}
        style={StyleSheet.absoluteFill}
      />

      <FlatList
        data={evals}
        keyExtractor={(e) => String(e.id)}
        renderItem={({ item }) => <EvalCard item={item} />}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={<Text style={styles.title}>Agent Evaluations</Text>}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No evaluations yet</Text>
          </View>
        }
        ListFooterComponent={
          !hasMore ? (
            <Text style={styles.endText}>— end —</Text>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        windowSize={8}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: Spacing.md, paddingBottom: 120 },

  title: {
    ...Typography.h1,
    color: Colors.textPrimary,
    paddingTop: Spacing.xl + 10,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.lg,
  },

  card: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.glassBase,
  },
  cardContent: { padding: Spacing.md },
  userMsg: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  agentResp: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  verdictRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
    marginBottom: Spacing.sm,
  },
  verdictBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  verdictText: { ...Typography.caption, fontWeight: '600' },
  timestamp: { ...Typography.caption, color: Colors.textMuted },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 36, marginBottom: Spacing.md },
  emptyText: { ...Typography.body, color: Colors.textMuted },
  endText: {
    ...Typography.caption,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
});
