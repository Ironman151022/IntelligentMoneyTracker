/** Capture mic audio as 16-bit mono WAV, auto-stop after silence. */

export type VoiceCaptureOptions = {
  /** Silence duration that ends capture after speech was heard. Default 3000ms. */
  silenceMs?: number;
  /** RMS above this counts as speech. Default 0.015. */
  speechThreshold?: number;
  /** Hard cap so we never hang forever. Default 30000ms. */
  maxDurationMs?: number;
  /** Ignore leading silence until this much speech has been heard. Default 250ms. */
  minSpeechMs?: number;
};

export type VoiceSession = {
  /** Stop early (cancel if no speech yet). */
  stop: () => void;
  /** Resolves with WAV when auto-stopped or manually stopped with speech. */
  done: Promise<Blob>;
};

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const pcm = floatTo16BitPCM(samples);
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  new Int16Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: "audio/wav" });
}

function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const v = frame[i]!;
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(1, frame.length));
}

export function startVoiceCaptureSession(
  options: VoiceCaptureOptions = {},
): VoiceSession {
  const silenceMs = options.silenceMs ?? 3000;
  const speechThreshold = options.speechThreshold ?? 0.015;
  const maxDurationMs = options.maxDurationMs ?? 30_000;
  const minSpeechMs = options.minSpeechMs ?? 250;

  let settle!: (blob: Blob) => void;
  let fail!: (err: Error) => void;
  const done = new Promise<Blob>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  let settled = false;
  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let mute: GainNode | null = null;
  const chunks: Float32Array[] = [];
  let sampleRate = 48_000;
  let speechHeardMs = 0;
  let lastSpeechAt = 0;
  let startedAt = 0;
  let tickId: number | null = null;

  const cleanup = () => {
    if (tickId != null) {
      window.clearInterval(tickId);
      tickId = null;
    }
    try {
      processor?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      source?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      mute?.disconnect();
    } catch {
      /* ignore */
    }
    processor = null;
    source = null;
    mute = null;
    if (audioCtx && audioCtx.state !== "closed") {
      void audioCtx.close();
    }
    audioCtx = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };

  const finish = (reason: "silence" | "max" | "manual") => {
    if (settled) return;
    settled = true;
    cleanup();

    const totalLen = chunks.reduce((n, c) => n + c.length, 0);
    if (totalLen === 0 || speechHeardMs < minSpeechMs) {
      fail(
        new Error(
          reason === "manual" ? "Recording cancelled" : "No speech detected",
        ),
      );
      return;
    }

    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    settle(encodeWav(merged, sampleRate));
  };

  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      audioCtx = new AudioContext();
      sampleRate = audioCtx.sampleRate;
      source = audioCtx.createMediaStreamSource(stream);
      const bufferSize = 4096;
      processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);

      startedAt = performance.now();
      lastSpeechAt = startedAt;

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        chunks.push(copy);

        const level = rms(input);
        const now = performance.now();
        const frameMs = (input.length / sampleRate) * 1000;

        if (level >= speechThreshold) {
          speechHeardMs += frameMs;
          lastSpeechAt = now;
        }
      };

      // Keep processor alive without audible feedback.
      mute = audioCtx.createGain();
      mute.gain.value = 0;
      source.connect(processor);
      processor.connect(mute);
      mute.connect(audioCtx.destination);

      tickId = window.setInterval(() => {
        const now = performance.now();
        if (now - startedAt >= maxDurationMs) {
          finish("max");
          return;
        }
        if (speechHeardMs >= minSpeechMs && now - lastSpeechAt >= silenceMs) {
          finish("silence");
        }
      }, 100);
    } catch (err) {
      cleanup();
      if (!settled) {
        settled = true;
        fail(
          err instanceof Error ? err : new Error("Microphone access failed"),
        );
      }
    }
  })();

  return {
    stop: () => finish("manual"),
    done,
  };
}

export async function transcribeWav(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", blob, "speech.wav");

  const res = await fetch("/api/voice/transcribe", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `Transcription failed (${res.status})`);
  }

  const data = (await res.json()) as { text: string };
  return (data.text || "").trim();
}
