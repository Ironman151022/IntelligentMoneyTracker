import { documentDirectory } from 'expo-file-system/legacy';

/**
 * Model filename stored on the device.
 * The file is downloaded once and reused across launches.
 */
export const MODEL_FILENAME = 'gemma4-e2b.gguf';

/**
 * LOCAL_MODEL_URL — default URL shown in the app's server field.
 * Run:  npm run serve-model   (in the mobile/ directory)
 * The script prints your Mac's exact LAN IP — paste it here or edit in the app.
 *
 * Physical device: use your Mac's WiFi IP (e.g. 192.168.1.8)
 * Android emulator: use 10.0.2.2
 */
export const LOCAL_MODEL_URL = 'http://192.168.1.8:9999/model.gguf';

/**
 * HF_MODEL_URL — fallback: download from HuggingFace (requires login + token).
 * bartowski/google_gemma-4-E2B-it-GGUF — Q4_K_M quantization.
 */
export const HF_MODEL_URL =
  'https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_K_M.gguf';

// Local path on the device where the model is stored
export const MODEL_PATH = `${documentDirectory}models/${MODEL_FILENAME}`;

// llama.rn context parameters
export const LLAMA_PARAMS = {
  n_ctx: 2048,
  n_batch: 512,
  n_threads: 4,
  use_mlock: false,
  use_mmap: true,
};

// Generation parameters — temperature 0 for deterministic output
export const GENERATION_PARAMS = {
  temperature: 0,
  top_p: 1,
  top_k: 1,
  n_predict: 512,
};
