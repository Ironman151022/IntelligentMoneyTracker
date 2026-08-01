# Intelligent Money Tracker

An intelligent, privacy-first money tracking application powered by an **on-device text model** and a knowledge graph. Heavy perception models (voice, bill images) run online so mid-range phones stay responsive.

## Key Features

- **On-device LLM** — Transaction understanding runs locally (Gemma). Structured money data never leaves the device for LLM inference.
- **Cloud perception** — Speech-to-text and receipt/bill vision run online for accuracy without packing large models next to the LLM.
- **Mobile friendly** — Designed for seamless use on mobile devices.
- **Knowledge Graph (Ontology)** — Organizes transactions and relationships in a structured, queryable graph.
- **Gesture-based activation** — Trigger the AI via user-attached system gestures (Back Tap, Action Button, Quick Settings, Shortcuts)—not a hard-coded volume-button hook.

## Inference split

| Model | Where it runs | Why |
|-------|---------------|-----|
| **Text / LLM** (Gemma) | **On device** | Parses text → transaction JSON; keeps the ledger private |
| **Voice → text** (Whisper-class STT) | **Online** | Medium/large STT + LLM together do not fit mid-range phones |
| **Image / bills** (OCR / vision for F2) | **Online** | Receipt models are large; only extracted text/fields return to the device |

```
mic / photo ──(online)──► text / bill fields
                              │
                              ▼
                     on-device LLM (Gemma)
                              │
                              ▼
                    SQLite ⇌ Knowledge Graph  (on device)
```

Audio and bill images may leave the device for transcription/OCR only. **Transaction JSON, the database, and the graph stay on device.**

## Workflow [ Features ]

1. **Activation** — The user activates the app via settings or gestures.
2. **Voice input** *(F1)* — The user speaks naturally, for example:
   > *"I bought food from Zomato for around ₹100."*

   Online STT turns speech into text; the on-device LLM parses it and stores the transaction in the knowledge graph.

3. **Photo upload** *(F2)* — Receipts/bills go to an online vision/OCR model; extracted text feeds the on-device LLM.

4. **Automatic payment detection** *(F3)* — AI activates automatically when a payment is detected.

## Data Architecture

```
Database ⇌ Knowledge Graph
```

The traditional database and knowledge graph stay synchronized, enabling both structured storage and rich semantic relationships.
