# Intelligent Money Tracker Android

Kotlin Android app for the on-device LiteRT-LM flow in `docs/ANDROID_PLAN.md`.

## Model download (testing)

Users download the model **directly from Hugging Face** — no CDN and **no API key** in the APK.

| | |
|---|---|
| Repo | [`litert-community/gemma-4-E2B-it-litert-lm`](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm) |
| File | `gemma-4-E2B-it.litertlm` (~2.58 GB) |
| URL | `https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm?download=true` |
| License | Apache-2.0 on the litert packaging |

Flow:

1. App refreshes file size / SHA-256 from the public HF tree API (falls back to baked-in values offline).
2. User taps **Download model**.
3. WorkManager streams the file into app-private storage (`files/models/`), with HTTP range resume.
4. Size + SHA-256 checks run before the file is marked ready.
5. LiteRT-LM loads the local `.litertlm` path.

## What is implemented

- Jetpack Compose Android app shell
- Room database for persisted transaction JSON
- WorkManager-based Hugging Face model download
- App-private storage for the `.litertlm` file
- SHA-256 verification before model activation
- LiteRT-LM integration for loading a local model path
- Text spike and optional audio spike buttons in the UI

## Optional audio spike asset

Add `app/src/main/assets/spike_sample.wav` if you want the audio spike path to send a short WAV clip through Gemma.

## Current limitations

- No Gradle wrapper in the repo yet (open in Android Studio to sync/build).
- Direct HF downloads may be rate-limited on busy networks; CDN mirror is a later production option.
- Resume depends on Hugging Face / CDN supporting HTTP `Range` requests (usual for LFS).
