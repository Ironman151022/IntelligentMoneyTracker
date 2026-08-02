/**
 * ModelSetupScreen — shown once until the Gemma 4 E2B model is on device.
 *
 * Two download options:
 *   1. Local Mac  — no token, no internet; requires `npm run serve-model` on Mac
 *   2. HuggingFace — needs a read token + Gemma 4 license accepted
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  getInfoAsync,
  makeDirectoryAsync,
  createDownloadResumable,
  DownloadResumable,
} from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { loadModel } from '../llm';
import {
  MODEL_PATH,
  MODEL_FILENAME,
  LOCAL_MODEL_URL,
  HF_MODEL_URL,
} from '../llm/config';
import { Colors, Radius, Spacing, Typography } from '../theme';
import { getDb } from '../db/database';

type Phase =
  | 'checking'
  | 'choose'        // pick local or HF
  | 'hf_token'      // HF token input screen
  | 'downloading'
  | 'loading_model'
  | 'error';

interface Props {
  onReady: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function ModelSetupScreen({ onReady }: Props) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [hfToken, setHfToken] = useState('');
  const [localUrl, setLocalUrl] = useState(LOCAL_MODEL_URL);
  const downloadRef = useRef<DownloadResumable | null>(null);
  const pulseAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  // ── On mount: check if already downloaded ──────────────────────────────────
  useEffect(() => { checkAndProceed(); }, []);

  const checkAndProceed = useCallback(async () => {
    setPhase('checking');
    try {
      const modelDir = MODEL_PATH.substring(0, MODEL_PATH.lastIndexOf('/'));
      await makeDirectoryAsync(modelDir, { intermediates: true });
      const info = await getInfoAsync(MODEL_PATH);
      if (info.exists && info.size && info.size > 100_000_000) {
        await loadModelAndProceed();
      } else {
        setPhase('choose');
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, []);

  const loadModelAndProceed = useCallback(async () => {
    setPhase('loading_model');
    try {
      getDb();
      await loadModel();
      onReady();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [onReady]);

  const runDownload = useCallback(async (url: string, headers: Record<string, string> = {}) => {
    setPhase('downloading');
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    try {
      const dl = createDownloadResumable(
        url,
        MODEL_PATH,
        { headers },
        (progress) => {
          const pct =
            progress.totalBytesExpectedToWrite > 0
              ? progress.totalBytesWritten / progress.totalBytesExpectedToWrite
              : 0;
          setDownloadProgress(pct);
          setDownloadedBytes(progress.totalBytesWritten);
          setTotalBytes(progress.totalBytesExpectedToWrite);
        },
      );
      downloadRef.current = dl;
      await dl.downloadAsync();
      downloadRef.current = null;
      await loadModelAndProceed();
    } catch (e: unknown) {
      downloadRef.current = null;
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [loadModelAndProceed]);

  const cancelDownload = useCallback(async () => {
    try { await downloadRef.current?.pauseAsync(); } catch {/* ignore */}
    downloadRef.current = null;
    setPhase('choose');
    setDownloadProgress(0);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#06060F', '#0A0A1A', '#06060F']} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.glow, { opacity: pulseAnim }]} pointerEvents="none" />

      <View style={styles.card}>
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(108,142,255,0.10)', 'rgba(0,0,0,0)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.innerBorder} pointerEvents="none" />

        <ScrollView
          contentContainerStyle={styles.cardContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconRing}>
            <Text style={styles.iconText}>🧠</Text>
          </View>
          <Text style={styles.title}>On-device AI</Text>
          <Text style={styles.subtitle}>
            Gemma 4 E2B runs entirely on your phone.{'\n'}
            Your money data never leaves this device.
          </Text>

          {/* ── Checking ── */}
          {phase === 'checking' && (
            <View style={styles.statusBlock}>
              <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />
              <Text style={styles.statusText}>Checking for model…</Text>
            </View>
          )}

          {/* ── Choose download source ── */}
          {phase === 'choose' && (
            <>
              <Text style={styles.sectionLabel}>How do you want to get the model?</Text>

              {/* Option A — local Mac */}
              <View style={styles.optionCard}>
                <LinearGradient
                  colors={['rgba(0,212,170,0.12)', 'rgba(0,0,0,0)']}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.optionHeader}>
                  <Text style={styles.optionIcon}>💻</Text>
                  <View style={styles.optionTextBlock}>
                    <Text style={styles.optionTitle}>From your Mac</Text>
                    <Text style={styles.optionBadge}>Recommended · No token needed</Text>
                  </View>
                </View>
                <Text style={styles.optionDesc}>
                  Run on your Mac first:{'\n'}
                  <Text style={styles.optionCode}>  cd mobile && npm run serve-model</Text>
                  {'\n'}It will print your exact URL — paste it below.
                </Text>
                <View style={styles.tokenInputWrapper} >
                  <TextInput
                    style={[styles.tokenInput, styles.urlInput]}
                    value={localUrl}
                    onChangeText={setLocalUrl}
                    placeholder="http://192.168.x.x:9999/model.gguf"
                    placeholderTextColor={Colors.textHint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>
                <Pressable
                  style={[styles.primaryBtn, !localUrl.trim() && styles.primaryBtnDisabled]}
                  onPress={() => runDownload(localUrl.trim())}
                  disabled={!localUrl.trim()}
                >
                  <LinearGradient
                    colors={['rgba(0,212,170,0.80)', 'rgba(0,180,140,1)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: Radius.lg }]}
                  />
                  <Text style={styles.primaryBtnText}>Download from Mac →</Text>
                </Pressable>
              </View>

              {/* Option B — HuggingFace */}
              <Pressable style={styles.optionCard} onPress={() => setPhase('hf_token')}>
                <View style={styles.optionHeader}>
                  <Text style={styles.optionIcon}>🌐</Text>
                  <View style={styles.optionTextBlock}>
                    <Text style={styles.optionTitle}>From HuggingFace</Text>
                    <Text style={[styles.optionBadge, styles.optionBadgeMuted]}>Requires token · ~3.4 GB</Text>
                  </View>
                </View>
                <Text style={styles.optionDesc}>
                  Download directly from the internet.{'\n'}
                  Need a read token from huggingface.co
                </Text>
              </Pressable>
            </>
          )}

          {/* ── HF token entry ── */}
          {phase === 'hf_token' && (
            <>
              <Text style={styles.sectionLabel}>HuggingFace Access Token</Text>
              <Text style={styles.tokenHint}>
                1. huggingface.co/settings/tokens → create a read token{'\n'}
                2. Accept Gemma 4 license at huggingface.co/google/gemma-4-E2B-it
              </Text>
              <View style={styles.tokenInputWrapper}>
                <TextInput
                  style={styles.tokenInput}
                  value={hfToken}
                  onChangeText={setHfToken}
                  placeholder="hf_xxxxxxxxxxxxxxxxxxxx"
                  placeholderTextColor={Colors.textHint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </View>
              <View style={styles.row}>
                <Pressable style={styles.ghostBtn} onPress={() => setPhase('choose')}>
                  <Text style={styles.ghostBtnText}>← Back</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtn, styles.primaryBtnFlex, !hfToken.trim() && styles.primaryBtnDisabled]}
                  onPress={() => runDownload(HF_MODEL_URL, { Authorization: `Bearer ${hfToken.trim()}` })}
                  disabled={!hfToken.trim()}
                >
                  <LinearGradient
                    colors={Colors.gradientAccent}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: Radius.lg }]}
                  />
                  <Text style={styles.primaryBtnText}>Download →</Text>
                </Pressable>
              </View>
            </>
          )}

          {/* ── Downloading ── */}
          {phase === 'downloading' && (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(downloadProgress * 100)}%` }]} />
              </View>
              <Text style={styles.progressLabel}>
                {Math.round(downloadProgress * 100)}%
                {downloadedBytes > 0 && `  ·  ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`}
              </Text>
              <Pressable style={styles.ghostBtn} onPress={cancelDownload}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </Pressable>
            </>
          )}

          {/* ── Loading model into RAM ── */}
          {phase === 'loading_model' && (
            <View style={styles.statusBlock}>
              <Animated.View style={[styles.dot, styles.dotTeal, { opacity: pulseAnim }]} />
              <Text style={styles.statusText}>Loading model…</Text>
              <Text style={styles.statusHint}>First load takes ~10–30s depending on device.</Text>
            </View>
          )}

          {/* ── Error ── */}
          {phase === 'error' && (
            <>
              <View style={styles.errorBlock}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => { setErrorMsg(''); setPhase('choose'); }}
              >
                <LinearGradient
                  colors={Colors.gradientAccent}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: Radius.lg }]}
                />
                <Text style={styles.primaryBtnText}>← Try again</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  glow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: Colors.accentGlow,
    top: '15%',
    alignSelf: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '88%',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  innerBorder: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: Colors.glassHighlight,
    zIndex: 1,
  },
  cardContent: {
    padding: Spacing.xl,
    alignItems: 'center',
    paddingBottom: Spacing.xxl,
  },
  iconRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.accentSoft,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  iconText: { fontSize: 32 },
  title: { ...Typography.h1, color: Colors.textPrimary, marginBottom: 6, textAlign: 'center' },
  subtitle: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },

  sectionLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    alignSelf: 'flex-start',
    marginBottom: Spacing.sm,
    fontWeight: '600',
  },

  // ── Option cards ──
  optionCard: {
    width: '100%',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  optionIcon: { fontSize: 22, marginRight: Spacing.sm },
  optionTextBlock: { flex: 1 },
  optionTitle: { ...Typography.h3, color: Colors.textPrimary },
  optionBadge: {
    ...Typography.caption,
    color: Colors.teal,
    fontWeight: '600',
    marginTop: 2,
  },
  optionBadgeMuted: { color: Colors.textMuted },
  optionDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  optionCode: {
    ...Typography.mono,
    color: Colors.accent,
    fontSize: 11,
  },

  // ── HF token ──
  tokenHint: {
    ...Typography.caption,
    color: Colors.textMuted,
    alignSelf: 'flex-start',
    lineHeight: 17,
    marginBottom: Spacing.sm,
  },
  tokenInputWrapper: {
    width: '100%',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.glassBase,
    marginBottom: Spacing.md,
  },
  tokenInput: {
    ...Typography.mono,
    color: Colors.textPrimary,
    padding: Spacing.md,
    height: 48,
  },
  urlInput: {
    fontSize: 12,
    height: 44,
  },

  // ── Progress ──
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.glassBase,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  progressLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },

  // ── Buttons ──
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
    marginTop: Spacing.sm,
  },
  primaryBtn: {
    height: 50,
    width: '100%',
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  primaryBtnFlex: { flex: 1, width: undefined },
  primaryBtnText: { ...Typography.h3, color: '#fff', fontWeight: '700' },
  primaryBtnDisabled: { opacity: 0.4 },
  ghostBtn: {
    height: 44,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: { ...Typography.body, color: Colors.textMuted },

  // ── Status ──
  statusBlock: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent },
  dotTeal: { backgroundColor: Colors.teal },
  statusText: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  statusHint: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center' },

  // ── Error ──
  errorBlock: {
    backgroundColor: 'rgba(255,95,126,0.10)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,95,126,0.25)',
  },
  errorText: { ...Typography.bodySmall, color: Colors.error },
});
