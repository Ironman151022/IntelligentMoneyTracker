/**
 * LLM wrapper around llama.rn (llama.cpp React Native bindings).
 *
 * Responsibilities:
 *  - Load / release the GGUF model context (singleton)
 *  - Provide a chat-completion function that mirrors Ollama's interface
 *  - Enforce JSON output via response_format
 */

import { initLlama, LlamaContext } from 'llama.rn';
import { MODEL_PATH, LLAMA_PARAMS, GENERATION_PARAMS } from './config';

let _context: LlamaContext | null = null;
// Shared promise so concurrent callers await the same load instead of polling
let _loadPromise: Promise<void> | null = null;

// ── Model lifecycle ───────────────────────────────────────────────────────────

export async function loadModel(
  onProgress?: (progress: number) => void,
): Promise<void> {
  if (_context) return;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    try {
      onProgress?.(0);
      _context = await initLlama({
        model: MODEL_PATH,
        ...LLAMA_PARAMS,
      });
      onProgress?.(1);
    } finally {
      _loadPromise = null;
    }
  })();

  return _loadPromise;
}

export async function releaseModel(): Promise<void> {
  if (_context) {
    await _context.release();
    _context = null;
  }
}

export function isModelLoaded(): boolean {
  return _context !== null;
}

// ── Completion ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionResult {
  text: string;
  tokenCount: number;
}

/**
 * Run a chat completion. Requires model to be loaded first.
 * Uses response_format: json_object to enforce JSON output.
 */
export async function complete(
  messages: ChatMessage[],
  onToken?: (token: string) => void,
): Promise<CompletionResult> {
  if (!_context) {
    throw new Error('Model not loaded. Call loadModel() first.');
  }

  const result = await _context.completion(
    {
      messages,
      response_format: { type: 'json_object' },
      ...GENERATION_PARAMS,
    },
    onToken
      ? (data: { token: string }) => { onToken(data.token); }
      : undefined,
  );

  return {
    text: result.text,
    tokenCount: result.timings?.predicted_n ?? 0,
  };
}
