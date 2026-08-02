import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { api, GraphData } from '../api';
import { Colors, Radius, Spacing, Typography } from '../theme';

const NODE_COLORS: Record<string, string> = {
  transaction: Colors.accent,
  merchant: Colors.teal,
  category: Colors.purple,
  payment_method: Colors.warning,
  item: 'rgba(255,255,255,0.5)',
  beneficiary: Colors.error,
};

function NodeChip({ node }: { node: GraphData['nodes'][0] }) {
  const color = NODE_COLORS[node.type] ?? Colors.textSecondary;
  return (
    <View style={[styles.nodeChip, { borderColor: color + '55' }]}>
      <View style={[styles.nodeDot, { backgroundColor: color }]} />
      <Text style={[styles.nodeLabel, { color }]} numberOfLines={1}>
        {node.label}
      </Text>
      {node.value != null && (
        <Text style={styles.nodeValue}>₹{node.value.toLocaleString('en-IN')}</Text>
      )}
    </View>
  );
}

function LegendRow({ type, label }: { type: string; label: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: NODE_COLORS[type] ?? Colors.textMuted }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

export function GraphScreen() {
  const { width: W } = useWindowDimensions();
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GraphData['nodes'][0] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getGraph(120);
      setGraph(data);
    } catch {/* offline */}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={styles.center}>
        <LinearGradient colors={[Colors.bg, '#0D0D1A']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  const byType: Record<string, typeof nodes> = {};
  for (const n of nodes) {
    if (!byType[n.type]) byType[n.type] = [];
    byType[n.type].push(n);
  }

  const connectedEdges = selected
    ? edges.filter((e) => e.source === selected.id || e.target === selected.id)
    : [];

  const statCardWidth = (W - Spacing.md * 2 - Spacing.sm * 2) / 3;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.bg, '#0D0D1A', Colors.bg]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Knowledge Graph</Text>
        <Text style={styles.subtitle}>
          {nodes.length} nodes · {edges.length} edges
        </Text>

        {/* Stats summary — solid glass bg, no per-card BlurView */}
        <View style={styles.statsRow}>
          {Object.entries(byType).map(([type, arr]) => (
            <View
              key={type}
              style={[styles.statCard, { minWidth: statCardWidth }]}
            >
              <LinearGradient
                colors={[NODE_COLORS[type] + '22', 'transparent']}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <Text style={[styles.statCount, { color: NODE_COLORS[type] ?? Colors.textPrimary }]}>
                {arr.length}
              </Text>
              <Text style={styles.statLabel}>{type}</Text>
            </View>
          ))}
        </View>

        {/* Legend — solid glass bg */}
        <View style={styles.legendBlock}>
          <View style={styles.legendGrid}>
            {Object.entries(NODE_COLORS).map(([type]) => (
              <LegendRow key={type} type={type} label={type.replace('_', ' ')} />
            ))}
          </View>
        </View>

        {/* Node lists by type */}
        {Object.entries(byType).map(([type, arr]) => (
          <View key={type} style={styles.section}>
            <Text style={[styles.sectionHeader, { color: NODE_COLORS[type] ?? Colors.textSecondary }]}>
              {type.replace('_', ' ').toUpperCase()}
            </Text>
            <View style={styles.chipGrid}>
              {arr.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={() => setSelected(selected?.id === n.id ? null : n)}
                >
                  <NodeChip node={n} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {/* Selected node edges — solid glass bg */}
        {selected && (
          <View style={styles.edgePanel}>
            <LinearGradient
              colors={['rgba(108,142,255,0.12)', 'transparent']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Text style={styles.edgePanelTitle}>
              Connections for "{selected.label}"
            </Text>
            {connectedEdges.length === 0 ? (
              <Text style={styles.edgeNone}>No edges found</Text>
            ) : (
              connectedEdges.map((e, i) => (
                <View key={i} style={styles.edgeRow}>
                  <Text style={styles.edgeSource}>{e.source}</Text>
                  <Text style={styles.edgeRelation}> —{e.relation}→ </Text>
                  <Text style={styles.edgeTarget}>{e.target}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {nodes.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🕸️</Text>
            <Text style={styles.emptyText}>Graph is empty</Text>
            <Text style={styles.emptyHint}>Log some transactions to populate the graph</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 120 },

  title: {
    ...Typography.h1,
    color: Colors.textPrimary,
    paddingTop: Spacing.xl + 10,
    paddingHorizontal: Spacing.sm,
    marginBottom: 4,
  },
  subtitle: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.lg,
  },

  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.glassBase,
  },
  statCount: { ...Typography.displayMd, fontWeight: '700' },
  statLabel: { ...Typography.caption, color: Colors.textMuted, textTransform: 'capitalize' },

  legendBlock: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.glassBase,
  },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginRight: Spacing.md },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { ...Typography.caption, color: Colors.textSecondary, textTransform: 'capitalize' },

  section: { marginBottom: Spacing.lg },
  sectionHeader: {
    ...Typography.caption,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  nodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    backgroundColor: Colors.glassBase,
    gap: 6,
  },
  nodeDot: { width: 6, height: 6, borderRadius: 3 },
  nodeLabel: { ...Typography.bodySmall, fontWeight: '500', maxWidth: 120 },
  nodeValue: { ...Typography.caption, color: Colors.textMuted, marginLeft: 4 },

  edgePanel: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(108,142,255,0.30)',
    backgroundColor: Colors.glassBase,
  },
  edgePanelTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  edgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 4,
  },
  edgeSource: { ...Typography.bodySmall, color: Colors.accent },
  edgeRelation: { ...Typography.caption, color: Colors.textMuted, fontStyle: 'italic' },
  edgeTarget: { ...Typography.bodySmall, color: Colors.teal },
  edgeNone: { ...Typography.bodySmall, color: Colors.textMuted },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: Spacing.md },
  emptyText: { ...Typography.h2, color: Colors.textSecondary, marginBottom: 8 },
  emptyHint: { ...Typography.body, color: Colors.textMuted, textAlign: 'center' },
});
