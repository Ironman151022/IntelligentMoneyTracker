# Android plan — Intelligent Money Tracker

**Scope:** Android first. On-device only.

## Goal

```
mic / text → Gemma 4 E2B (native audio + text) → transaction JSON → SQLite
```

No Whisper. No Ollama on device. No server for logging.

## Locked stack

| Piece | Choice |
|---|---|
| **Library** | **LiteRT-LM** (same stack as Google AI Edge Gallery) |
| **Collection** | [litert-community Gemma family](https://huggingface.co/collections/litert-community/gemma-family) |
| **Model repo** | [`litert-community/gemma-4-E2B-it-litert-lm`](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm) |
| **File** | `gemma-4-E2B-it.litertlm` (~2.58 GB) |
| **Base weights** | `google/gemma-4-E2B-it` (instruction-tuned; litert-community is the edge packaging) |

```
.litertlm (litert-community)
        ↓
LiteRT-LM on Android
        ↓
text / mic → logger prompt → JSON → SQLite
```

## Which stack to use

| Option | Use it? | Why |
|---|---|---|
| **LiteRT-LM + litert-community `.litertlm`** | **Yes — primary** | Official edge packaging. Native audio + text. Gallery path. |

**Decision:** Android on **LiteRT-LM** + **`litert-community/gemma-4-E2B-it-litert-lm`**.

## Model delivery

- Do **not** put the ~2.58 GB `.litertlm` inside the APK.
- **Testing (current):** download `gemma-4-E2B-it.litertlm` **directly from Hugging Face**
  ([`litert-community/gemma-4-E2B-it-litert-lm`](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm)).
  Public Apache-2.0 packaging — **no HF token in the app**.
- Resolve URL used by the app:
  `https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm`
- App: user taps **Download model** → store once in **app-private storage** → SHA-256 verify → LiteRT-LM load.
- Show Gemma license / prohibited-use link before or during first download.
- Vision/audio encoders load on demand inside LiteRT-LM (lower idle memory).
- **Later / production:** optionally re-host on your own CDN for rate-limit control; keep the same local-store + checksum flow.

## App shape

1. Download / load `gemma-4-E2B-it.litertlm` via LiteRT-LM.
2. Gesture (shake / system) opens log UI.
3. Text or mic → model + **logger system prompt** → one JSON action.
4. Persist to on-device SQLite / knowledge graph.
5. Analytics later. UPI auto-detect later.

## System prompt

Use [`logger-system-prompt.md`](./logger-system-prompt.md) (copy of backend logger prompt).  
Same contract on device: one JSON object, no free-form chat.

## Spike before full UI

On one Android device:

1. Load LiteRT-LM with litert-community E2B `.litertlm`.
2. Send a short WAV + logger prompt.
3. Confirm structured JSON out.

Only then build history / gestures / polish.

## Out of scope (for now)

- iOS
- Backend/Ollama dependency for logging
- Pending-draft / notification capture
- Analytics dashboards
- Play Asset Delivery (add after model size / Play ship is clear)
